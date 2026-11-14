"""Signing learners in through TESDA Skill Passport (docs/contracts/tsp-tracker-embed/CONTRACT.md).

The page hands over the one-time code TSP gave it. sign_in trades it with Hercules for the learner's profile and
then either signs in the account already linked to that sso_id, or, on a first visit, keeps the cleaned profile
for a few minutes and asks the learner to consent. consent creates the account and the link, or forgets the
profile. Accounts are linked by sso_id only, and TSP's email is never kept; a known sso_id arriving with another ULI
(or none, once one is stored) is refused, so two people are never mixed up. Every step is recorded in tsp_sign_in_audit.
"""
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, select

from tesda_track.errors import TspSignInError
from tesda_track.models import Learner, Region, utcnow
from tesda_track.models.identity import TSP_PROVIDER, LearnerIdentity, TspPendingSignIn, TspSignInAudit
from tesda_track.schemas.hercules import TrackerProfile
from tesda_track.services.hercules import (CLIENT_REJECTED, SIGN_IN_EXPIRED, UNAVAILABLE, HerculesClient,
                                           HerculesClientRejected, HerculesCodeRejected, HerculesNotConfigured,
                                           HerculesTokenRejected, HerculesUnavailable)

logger = logging.getLogger("tesda_track")

PENDING_LIFETIME = timedelta(minutes=10)
# What TESDA-TRACK keeps of a profile: the sections it recommends from, and from the personal information only the
# name and where the learner lives. No contact details, birth date, sex or street address.
SECTIONS = ("skills", "experience", "education", "qualifications")
KEPT_PERSONAL = ("first_name", "middle_name", "last_name", "municipality", "province", "region", "country")
DEFAULT_NAME = "Skill Passport learner"
# Hercules hasn't fixed the shape of a section's entries yet: an entry is a string, or an object whose label is the
# first of these keys it has.
LABEL_KEYS = ("name", "title", "skill", "skill_name", "qualification", "qualification_title", "qualification_name",
              "job_title", "position", "occupation", "degree", "course", "program", "school", "certificate_name",
              "training", "label")
CREDENTIAL_KINDS = ("certificates", "trainings", "assessments", "external_certificates")
LABEL_LIMIT = 200


@dataclass(frozen=True)
class ConsentRequired:
    pending_id: str
    name: str
    # What the consent screen says TESDA-TRACK will keep, from skills, experience, education, qualifications,
    # certificates and location: only what this profile actually has.
    keeps: list[str]


def kept_profile(profile: TrackerProfile) -> dict:
    personal = profile.personal_information.model_dump()
    return {"personal_information": {key: personal[key] for key in KEPT_PERSONAL if personal[key]},
            **{section: getattr(profile, section) for section in SECTIONS},
            "credentials": profile.credentials.model_dump()}


def profile_labels(profile: dict) -> dict[str, list[str]]:
    """A kept profile as readable labels per section, each list without repeats. Entries with no label are left
    out."""
    credentials = profile.get("credentials", {})
    sections = {section: profile.get(section, []) for section in SECTIONS}
    sections["credentials"] = [entry for kind in CREDENTIAL_KINDS for entry in credentials.get(kind, [])]
    return {section: list(dict.fromkeys(filter(None, map(_label, entries)))) for section, entries in sections.items()}


def _folded(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def region_code(session: Session, profile: dict) -> str | None:
    """The app's region code for where the learner's Skill Passport says they live, or None when it doesn't say
    or the value matches no region. TSP may send a code ("VII"), "Region VII", or a name ("Central Visayas")."""
    value = (profile.get("personal_information") or {}).get("region")
    if not isinstance(value, str) or not value.strip():
        return None
    wanted = _folded(value).removeprefix("region ").strip()
    for region in session.exec(select(Region)):
        # "Region VII (Central Visayas)": the code, the full name, and the part in brackets all count.
        inner = re.search(r"\(([^)]*)\)", region.name)
        names = {_folded(region.code), _folded(region.name), _folded(region.name).removeprefix("region ")}
        if inner:
            names.add(_folded(inner.group(1)))
        if wanted in names or _folded(value) in names:
            return region.code
    return None


def linked_profile(session: Session, learner: Learner) -> dict | None:
    link = session.exec(select(LearnerIdentity).where(LearnerIdentity.provider == TSP_PROVIDER,
                                                      LearnerIdentity.learner_id == learner.id)).first()
    return link.profile if link else None


def sign_in(session: Session, client: HerculesClient, code: str) -> Learner | ConsentRequired:
    token, profile = _exchange(client, code)
    kept, scopes, now = kept_profile(profile), sorted(token.scopes), utcnow()
    link = _identity(session, profile.sso_id)
    if link is None:
        pending = TspPendingSignIn(id=secrets.token_urlsafe(32), subject=profile.sso_id, uli=profile.uli,
                                   scopes=scopes, profile=kept, expires_at=now + PENDING_LIFETIME)
        session.add(pending)
        _audit(session, profile.sso_id, "consent_requested", scopes)
        session.flush()
        return ConsentRequired(pending.id, _full_name(kept), _keeps(kept))
    return _sign_in_linked(session, link, uli=profile.uli, profile=kept, scopes=scopes)


def consent(session: Session, pending_id: str, accept: bool) -> Learner | None:
    pending = session.get(TspPendingSignIn, pending_id)
    if pending is None or pending.expires_at <= utcnow():
        raise TspSignInError("handoff_expired", 404, SIGN_IN_EXPIRED)
    session.delete(pending)
    if not accept:
        _audit(session, pending.subject, "consent_declined", pending.scopes)
        session.flush()
        return None
    now = utcnow()
    learner = Learner(email=None, password_hash=None, full_name=_full_name(pending.profile), privacy_consent_at=now)
    try:
        # A second consent for the same person can race this one: the unique link decides, and the loser signs in
        # to the winner's account below.
        with session.begin_nested():
            session.add(learner)
            session.flush()
            session.add(LearnerIdentity(provider=TSP_PROVIDER, subject=pending.subject, learner_id=learner.id,
                                        uli=pending.uli, scopes=pending.scopes, profile=pending.profile,
                                        linked_at=now, last_signed_in_at=now))
            session.flush()
    except IntegrityError:
        link = _identity(session, pending.subject)
        if link is None:
            raise
        return _sign_in_linked(session, link, uli=pending.uli, profile=pending.profile, scopes=pending.scopes)
    _audit(session, pending.subject, "linked", pending.scopes, learner.id)
    session.flush()
    return learner


def purge_expired_pending(session: Session) -> int:
    return session.exec(delete(TspPendingSignIn).where(TspPendingSignIn.expires_at <= utcnow())).rowcount


def _exchange(client: HerculesClient, code: str):
    try:
        token = client.exchange_code(code)
        return token, client.fetch_profile(token)
    except (HerculesCodeRejected, HerculesTokenRejected):
        raise TspSignInError("handoff_expired", 401, SIGN_IN_EXPIRED) from None
    except (HerculesClientRejected, HerculesNotConfigured):
        raise TspSignInError("client_rejected", 503, CLIENT_REJECTED) from None
    except HerculesUnavailable:
        raise TspSignInError("unavailable", 503, UNAVAILABLE) from None


def _sign_in_linked(session: Session, link: LearnerIdentity, *, uli: str | None, profile: dict,
                    scopes: list) -> Learner:
    if link.uli and uli != link.uli:
        _audit(session, link.subject, "uli_mismatch", scopes, link.learner_id)
        # Committed here because the request ends in an error response, which rolls back.
        session.commit()
        logger.warning("TSP sign-in refused: the ULI differs from the one linked to identity %s", link.id)
        raise TspSignInError("unavailable", 409, UNAVAILABLE)
    learner = session.get(Learner, link.learner_id)
    if not learner.is_active:
        raise TspSignInError("unavailable", 403, UNAVAILABLE)
    link.uli = link.uli or uli
    link.profile, link.scopes, link.last_signed_in_at = profile, scopes, utcnow()
    learner.full_name = _full_name(profile)
    _audit(session, link.subject, "signed_in", scopes, learner.id)
    session.flush()
    return learner


def _identity(session: Session, subject: str) -> LearnerIdentity | None:
    return session.exec(select(LearnerIdentity).where(LearnerIdentity.provider == TSP_PROVIDER,
                                                      LearnerIdentity.subject == subject)).first()


def _audit(session: Session, subject: str, event: str, scopes: list, learner_id=None) -> None:
    session.add(TspSignInAudit(subject=subject, learner_id=learner_id, event=event, scopes=scopes))


def _full_name(profile: dict) -> str:
    personal = profile.get("personal_information", {})
    name = " ".join(part for part in (personal.get("first_name"), personal.get("middle_name"),
                                      personal.get("last_name")) if part)
    return name[:150] or DEFAULT_NAME


def _label(entry) -> str | None:
    if isinstance(entry, dict):
        entry = next((entry[key] for key in LABEL_KEYS if isinstance(entry.get(key), str) and entry[key].strip()), None)
    if not isinstance(entry, str):
        return None
    return " ".join(entry.split())[:LABEL_LIMIT] or None


def _keeps(profile: dict) -> list[str]:
    keeps = [section for section in SECTIONS if profile[section]]
    if any(profile["credentials"].values()):
        keeps.append("certificates")
    if any(profile["personal_information"].get(key) for key in ("municipality", "province", "region")):
        keeps.append("location")
    return keeps
