"""How a signed-in learner's Skill Passport fits each qualification: the hidden half of a personalized Demand view.

The learner types nothing. Their kept TSP profile (tsp_sign_in.linked_profile) is normalized (tsp_profile), and its
occupational evidence is matched one term at a time with Find my pathway's keyword rules and semantic model
(skill_search.search_terms):

    their own skills, then the jobs they have done, then the CORE units of their certificates (valid ones first)

BASIC and COMMON units are left out: shared by dozens of qualifications, they say nothing about a trade. Matching
terms one at a time, rather than as one long query, keeps "cooking" and "welding" from blurring into neither.

A qualification's fit is its best single-term score, plus credit for sharing a sector with one the learner holds or
held. Qualifications they hold today are marked "held", expired ones "renew". Each fit keeps the terms behind it, so
the reasons shown ("Based on your skill: cooking") are what the matcher actually used, never a template.

The terms are never stored, logged or sent anywhere. Fits are kept in memory per learner and profile version, so
paging the Demand view doesn't re-run the model.
"""
import hashlib
import json
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, datetime
from threading import Lock
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from tesda_track.models import Learner, Qualification
from tesda_track.models.catalog import OfficialQualificationCode
from tesda_track.schemas.profile_fit import FitReason, PersonalFit
from tesda_track.services import analysis, catalog, labor_market, skill_search, skills_terms, tsp_profile, tsp_sign_in
from tesda_track.services.embeddings import Embedder

SECTOR_FIT = 30          # the same credit nearby_suggestions gives for a shared sector
HELD_JOB_FIT = 100       # a job linked to a qualification the learner holds today fits as well as anything can
TERMS_PER_REASON = 3
CACHE_SIZE = 256


@dataclass(frozen=True)
class ProfileFit:
    """Fits by catalog code. Codes absent from `by_code` don't fit anything in the profile."""
    by_code: dict[str, PersonalFit]

    def __bool__(self) -> bool:
        return bool(self.by_code)

    def get(self, code: str) -> PersonalFit | None:
        return self.by_code.get(code)

    def job_fit(self, code: str) -> int:
        """For ranking jobs: a qualification they hold today counts in full, since they can apply now."""
        fit = self.by_code.get(code)
        if fit is None:
            return 0
        return HELD_JOB_FIT if fit.status == "held" else fit.score


_cache: OrderedDict[tuple, ProfileFit] = OrderedDict()
_lock = Lock()


def for_learner(session: Session, learner: Learner | None, embedder: Embedder | None,
                today: date | None = None) -> ProfileFit | None:
    """The learner's fit, or None when they aren't signed in or their account isn't linked to a Skill Passport."""
    if learner is None:
        return None
    profile = tsp_sign_in.linked_profile(session, learner)
    if not profile:
        return None
    today = today or datetime.now(ZoneInfo("Asia/Manila")).date()
    current = catalog.snapshot(session)
    digest = hashlib.sha256(json.dumps(profile, sort_keys=True, default=str).encode()).hexdigest()
    key = (learner.id, digest, current.version, getattr(embedder, "model_name", None), today)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    fit = compute(session, profile, embedder, today)
    with _lock:
        _cache[key] = fit
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return fit


def code_book(session: Session, current: catalog.CatalogSnapshot) -> tsp_profile.CodeBook:
    rows = session.exec(
        select(OfficialQualificationCode.official_code, OfficialQualificationCode.official_title,
               OfficialQualificationCode.level, Qualification.code)
        .join(Qualification, Qualification.id == OfficialQualificationCode.qualification_id)
        .where(OfficialQualificationCode.relation == "same")
    ).all()
    return tsp_profile.CodeBook.from_rows(rows, {item.summary.name: item.code for item in current.items})


def evidence_terms(normalized: tsp_profile.NormalizedProfile) -> dict[str, tuple[str, str | None]]:
    """Each term to search, in priority order, with where it came from: (kind, source qualification code)."""
    terms: dict[str, tuple[str, str | None]] = {}

    def add(text: str, kind: str, source: str | None = None) -> None:
        text = " ".join(text.split())[:skills_terms.MAX_TERM_LENGTH]
        if text and text.casefold() not in {t.casefold() for t in terms}:
            terms[text] = (kind, source)

    for skill in normalized.skills:
        add(skill, "skill")
    for job in normalized.experience:
        add(job, "experience")
    core = sorted(normalized.units_of("CORE"), key=lambda unit: unit.status != "active")
    for unit in core:
        add(unit.title, "unit", unit.sources[0] if unit.sources else None)
    return dict(list(terms.items())[:skills_terms.MAX_TERMS])


def compute(session: Session, profile: dict, embedder: Embedder | None, today: date) -> ProfileFit:
    current = catalog.snapshot(session)
    items = {item.code: item for item in current.items}
    normalized = tsp_profile.normalize(profile, code_book(session, current), today)
    names = {code: item.summary.name for code, item in items.items()}
    held_today, held_before = normalized.held_today & items.keys(), normalized.held_before & items.keys()
    held_sectors: dict[str, str] = {}
    for code in [*sorted(held_today), *sorted(held_before)]:
        held_sectors.setdefault(items[code].sector, names[code])

    terms = evidence_terms(normalized)
    found = None
    if terms:
        found = skill_search.search_terms(
            session, current.items, labor_market.matching_rule_views(session, current.rule_views), list(terms),
            embedder, analysis.match_params(embedder), limit=len(current.items))
    matched = {match.qualification.code: match for match in found.matches} if found else {}

    fits = {}
    for code, item in items.items():
        match = matched.get(code)
        reasons = _term_reasons(found.supporting.get(code, ()) if match else (), terms, names)
        sector_of = held_sectors.get(item.sector)
        if sector_of and sector_of != names[code]:
            reasons.append(FitReason(kind="sector", qualification=sector_of, sector=item.sector))
        status = "held" if code in held_today else "renew" if code in held_before else None
        if status:
            reasons.insert(0, FitReason(kind=status, qualification=names[code]))
        score = min(100, (match.score if match else 0) + (SECTOR_FIT if sector_of and sector_of != names[code] else 0))
        if score or status:
            fits[code] = PersonalFit(score=score, status=status, reasons=reasons)
    return ProfileFit(fits)


def _term_reasons(supporting: tuple[str, ...], terms: dict[str, tuple[str, str | None]],
                  names: dict[str, str]) -> list[FitReason]:
    """The supporting terms grouped by where they came from, in the profile's priority order."""
    grouped: dict[tuple[str, str | None], list[str]] = {}
    for term in supporting:
        kind, source = terms.get(term, ("skill", None))
        grouped.setdefault((kind, source if kind == "unit" else None), []).append(term)
    order = {"skill": 0, "experience": 1, "unit": 2}
    return [FitReason(kind=kind, terms=found[:TERMS_PER_REASON], qualification=names.get(source) if source else None)
            for (kind, source), found in sorted(grouped.items(), key=lambda pair: order[pair[0][0]])]


def clear_cache() -> None:
    with _lock:
        _cache.clear()
