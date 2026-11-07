"""Signing learners in through TESDA Skill Passport: exchange, consent, linking and the audit trail. Hercules is
faked (no network)."""
from datetime import timedelta

import httpx
import pytest
from sqlmodel import select

from tesda_track.config import Settings
from tesda_track.errors import TspSignInError
from tesda_track.models import Learner, utcnow
from tesda_track.models.identity import LearnerIdentity, TspPendingSignIn, TspSignInAudit
from tesda_track.schemas.hercules import TrackerProfile
from tesda_track.services import tsp_sign_in
from tesda_track.services.hercules import HerculesClient

PROFILE = {"sso_id": "sso-abc", "uli": "ULI-1",
           "personal_information": {"first_name": "Ana", "last_name": "Santos", "mobile_number": "+639170000000",
                                    "date_of_birth": "1990-01-01", "address": "1 Rizal St",
                                    "email_address": "ana@example.com", "province": "Cebu", "region": "VII"},
           "skills": [{"name": "Welding"}], "experience": [{"title": "Helper"}]}
TOKEN = {"access_token": "tok-123", "token_type": "Bearer", "expires_in": 900, "scope": "profile skills experience"}


def hercules(profile=PROFILE, token_response=None):
    def answer(request):
        if request.url.path.endswith("/v1/tracker/token"):
            return token_response or httpx.Response(200, json={"success": True, "data": TOKEN})
        return httpx.Response(200, json={"success": True, "data": profile})

    settings = Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                        hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                        tracker_client_secret="s" * 64)
    return HerculesClient(settings, transport=httpx.MockTransport(answer))


def events(session):
    return [row.event for row in session.exec(select(TspSignInAudit).order_by(TspSignInAudit.occurred_at))]


def linked_learner(session, profile=PROFILE):
    pending = tsp_sign_in.sign_in(session, hercules(profile), "code")
    return tsp_sign_in.consent(session, pending.pending_id, accept=True)


def test_new_learner_needs_consent(session):
    result = tsp_sign_in.sign_in(session, hercules(), "code")
    assert isinstance(result, tsp_sign_in.ConsentRequired)
    assert (result.name, result.keeps) == ("Ana Santos", ["skills", "experience", "location"])
    assert session.get(TspPendingSignIn, result.pending_id) is not None
    assert session.exec(select(Learner).where(Learner.full_name == "Ana Santos")).first() is None
    assert events(session) == ["consent_requested"]


def test_consent_accept_creates_linked_account(session):
    learner = linked_learner(session)
    assert learner.password_hash is None and learner.privacy_consent_at is not None
    assert (learner.full_name, learner.email, learner.role) == ("Ana Santos", None, "learner")
    link = session.exec(select(LearnerIdentity).where(LearnerIdentity.learner_id == learner.id)).one()
    assert (link.provider, link.subject, link.uli) == ("tsp", "sso-abc", "ULI-1")
    assert link.scopes == ["experience", "profile", "skills"]
    assert link.profile == tsp_sign_in.kept_profile(TrackerProfile.model_validate(PROFILE))
    assert session.exec(select(TspPendingSignIn)).all() == []
    assert events(session) == ["consent_requested", "linked"]


def test_consent_decline_keeps_nothing(session):
    pending = tsp_sign_in.sign_in(session, hercules(), "code")
    assert tsp_sign_in.consent(session, pending.pending_id, accept=False) is None
    assert session.exec(select(TspPendingSignIn)).all() == []
    assert session.exec(select(LearnerIdentity)).all() == []
    assert events(session) == ["consent_requested", "consent_declined"]


@pytest.mark.parametrize("expired", [True, False], ids=["expired", "unknown"])
def test_expired_or_unknown_pending_is_handoff_expired(session, expired):
    pending_id = "no-such-sign-in"
    if expired:
        pending_id = tsp_sign_in.sign_in(session, hercules(), "code").pending_id
        session.get(TspPendingSignIn, pending_id).expires_at = utcnow() - timedelta(seconds=1)
        session.flush()
    with pytest.raises(TspSignInError) as error:
        tsp_sign_in.consent(session, pending_id, accept=True)
    assert (error.value.code, error.value.status_code) == ("handoff_expired", 404)


def test_known_learner_signs_in_and_profile_refreshes(session):
    learner = linked_learner(session)
    link = session.exec(select(LearnerIdentity)).one()
    before = link.last_signed_in_at
    renamed = {**PROFILE, "personal_information": {**PROFILE["personal_information"], "first_name": "Anna"},
               "skills": [{"name": "Welding"}, {"name": "Brazing"}]}
    assert tsp_sign_in.sign_in(session, hercules(renamed), "code") == learner
    assert learner.full_name == "Anna Santos"
    assert link.profile["skills"] == [{"name": "Welding"}, {"name": "Brazing"}]
    assert link.last_signed_in_at >= before
    assert events(session)[-1] == "signed_in"


def test_uli_mismatch_refuses_and_audits(session):
    linked_learner(session)
    link = session.exec(select(LearnerIdentity)).one()
    with pytest.raises(TspSignInError) as error:
        tsp_sign_in.sign_in(session, hercules({**PROFILE, "uli": "ULI-2"}), "code")
    assert (error.value.code, error.value.status_code) == ("unavailable", 409)
    session.refresh(link)
    assert link.uli == "ULI-1"
    assert events(session)[-1] == "uli_mismatch"


def test_stored_uli_filled_when_first_missing(session):
    linked_learner(session, {**PROFILE, "uli": None})
    tsp_sign_in.sign_in(session, hercules(), "code")
    assert session.exec(select(LearnerIdentity)).one().uli == "ULI-1"


def test_kept_profile_holds_only_allowed_fields():
    kept = tsp_sign_in.kept_profile(TrackerProfile.model_validate(PROFILE))
    assert kept["personal_information"] == {"first_name": "Ana", "last_name": "Santos", "province": "Cebu",
                                            "region": "VII"}
    assert set(kept) == {"personal_information", "skills", "experience", "education", "qualifications", "credentials"}


def test_tsp_email_is_never_kept(session):
    """The consent screen says contact details aren't kept, and an email could claim another account's address."""
    assert "email" not in TspPendingSignIn.model_fields
    assert linked_learner(session).email is None


def test_missing_uli_against_stored_uli_refuses(session):
    linked_learner(session)
    with pytest.raises(TspSignInError) as error:
        tsp_sign_in.sign_in(session, hercules({**PROFILE, "uli": None}), "code")
    assert (error.value.code, error.value.status_code) == ("unavailable", 409)
    assert events(session)[-1] == "uli_mismatch"


@pytest.mark.parametrize("response, code, status", [
    (httpx.Response(400, json={"message": "Invalid code.", "error": "Bad Request", "statusCode": 400}),
     "handoff_expired", 401),
    (httpx.Response(502, text="Bad gateway"), "unavailable", 503),
    (httpx.Response(401, json={"message": "Invalid tracker client credentials.", "error": "Unauthorized",
                               "statusCode": 401}), "client_rejected", 503),
], ids=["code-rejected", "unavailable", "client-rejected"])
def test_hercules_errors_map_to_contract_codes(session, response, code, status):
    with pytest.raises(TspSignInError) as error:
        tsp_sign_in.sign_in(session, hercules(token_response=response), "code")
    assert (error.value.code, error.value.status_code) == (code, status)


def test_inactive_learner_is_refused(session):
    linked_learner(session).is_active = False
    session.flush()
    with pytest.raises(TspSignInError) as error:
        tsp_sign_in.sign_in(session, hercules(), "code")
    assert error.value.code == "unavailable"


def test_purge_removes_expired_pending(session):
    pending_id = tsp_sign_in.sign_in(session, hercules(), "code").pending_id
    kept_id = tsp_sign_in.sign_in(session, hercules({**PROFILE, "sso_id": "sso-other"}), "code").pending_id
    session.get(TspPendingSignIn, pending_id).expires_at = utcnow() - timedelta(seconds=1)
    session.flush()
    assert tsp_sign_in.purge_expired_pending(session) == 1
    assert [row.id for row in session.exec(select(TspPendingSignIn))] == [kept_id]


def test_background_purge_removes_expired_pending(session):
    """A pending sign-in holds the learner's profile before they consented: it must be deleted, not only ignored."""
    import threading
    from contextlib import nullcontext

    from tesda_track.services import cache

    pending_id = tsp_sign_in.sign_in(session, hercules(), "code").pending_id
    session.get(TspPendingSignIn, pending_id).expires_at = utcnow() - timedelta(seconds=1)
    session.flush()
    stop = threading.Event()

    def open_session():
        stop.set()
        return nullcontext(session)

    cache.purge_until_stopped(open_session, stop, interval_seconds=0)
    assert session.exec(select(TspPendingSignIn)).all() == []


def test_profile_labels_read_strings_and_objects():
    profile = {"skills": ["Welding", {"name": " Brazing  work "}, {"name": "Welding"}, {"id": 7}, 3],
               "experience": [{"job_title": "Helper", "company": "ACME"}], "education": [{"school": "Cebu NHS"}],
               "qualifications": [{"qualification_title": "SMAW NC II"}],
               "credentials": {"certificates": [{"title": "NC II"}], "trainings": ["Safety 101"], "assessments": [],
                               "external_certificates": [{"name": "First aid"}]}}
    assert tsp_sign_in.profile_labels(profile) == {
        "skills": ["Welding", "Brazing work"], "experience": ["Helper"], "education": ["Cebu NHS"],
        "qualifications": ["SMAW NC II"], "credentials": ["NC II", "Safety 101", "First aid"]}


def test_linked_profile_is_the_kept_profile(session):
    learner = linked_learner(session)
    assert tsp_sign_in.linked_profile(session, learner)["skills"] == [{"name": "Welding"}]
