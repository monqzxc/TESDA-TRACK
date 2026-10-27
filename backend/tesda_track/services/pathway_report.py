"""The personalized pathway report: what to do next for one qualification, which units to work on, and why.

An explanation layer over the existing services. It decides nothing they decide, and calls them as the finder does:
- matching (analysis.match_evidence), the readiness result (analysis.score_readiness) and the route (analysis.pathway);
- training programs and assessment schedules from ranking.rank_programs and assessment_ranking.rank, unchanged and
  audited as every ranking is;
- the catalog's units of competency, from TESDA Training Regulations, with their Basic, Common or Core category;
- signed in, the learner's own certificates, assessment applications and goals.

Deterministic: every sentence is a template filled with those facts, so nothing is generated that the data doesn't
say. Where a fact is missing (no providers, no verification, no job data), the report says so instead. The goal's
words are used for matching and ranking only; the report never repeats them.
"""
from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import (AssessmentApplication, AssessmentCenter, AssessmentSchedule, Certification, Goal,
                                Learner, Qualification, Region, utcnow)
from tesda_track.schemas.analysis import Profile, ReadinessResult
from tesda_track.schemas.assessment_ranking import AssessmentRanking, AssessmentRankingRequest
from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.pathway_report import (CompetencyAdvice, CompetencyRef, Consideration, Employment, Explanation,
                                                FinalRecommendation, MatchSummary, NextStep, PathwayOption,
                                                PathwayReport, PathwayReportRequest, ProviderOption, RankingReferences,
                                                ReadinessSummary, ReportQualification)
from tesda_track.schemas.ranking import TrainingRanking, TrainingRankingRequest
from tesda_track.schemas.provenance import ProvenancePublic
from tesda_track.schemas.verification import VerificationPublic
from tesda_track.services import analysis, assessment_ranking, catalog, goal_rules, ranking, verification
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.embeddings import Embedder

PROVIDER_LIMIT = 3  # options of each kind the report shows; the rankings audit the same number
NAMED = 3  # units named in one sentence before "and N more"
CATALOG_SOURCE = "TESDA-TRACK's qualification catalog, built from TESDA Training Regulations"
JOBS_SOURCE = "The qualification's TESDA Training Regulation (jobs it leads to); not job-vacancy data"
DISCLAIMER = ("This report is guidance based on your own answers and the information TESDA-TRACK has. It is not an "
              "official competency assessment, and it doesn't guarantee certification or employment. Confirm "
              "requirements, fees and schedules with the provider or assessment center before you decide.")
NO_JOB_DATA = ("TESDA-TRACK has no job-vacancy or labor-market data, so what follows is general career guidance, not "
               "evidence of openings.")

ANSWER_WORDS = {"confident": "I can do this confidently", "some_experience": "I have some experience",
                "not_familiar": "I am not familiar with this"}
MODE_WORDS = {"institution_based": "institution-based", "enterprise_based": "enterprise-based",
              "community_based": "community-based", "online": "online"}
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}
CATEGORY_ORDER = {"core": 0, "common": 1, "other": 2, "basic": 3}

ACTIVITIES = {
    ("core", "learn"): [
        "Learn it in a training program with supervised, hands-on practice using the tools and equipment it needs.",
        "Practice each task until you can do it safely without help, then rate yourself again."],
    ("core", "practice"): [
        "Practice its tasks at work or in a workshop, with a trainer or experienced worker checking your work.",
        "Note the tasks you're unsure of and ask a training provider about a refresher on them."],
    ("core", "demonstrate"): [
        "Do its tasks from start to finish without help, as you would in an assessment.",
        "Ask the assessment center how this unit is assessed."],
    ("common", "learn"): [
        "Learn it in a training program or short course that covers this unit.",
        "Apply it in your practical work so you can explain and show it."],
    ("common", "practice"): [
        "Review what the unit covers and apply it in your daily work.",
        "Ask a trainer or supervisor to check how you apply it."],
    ("basic", "learn"): [
        "Build it in training and in daily work, for example by asking a trainer or supervisor for feedback."],
    ("basic", "practice"): ["Practice it at work and ask a supervisor or co-worker for feedback."],
}
FALLBACK_ACTIVITIES = {
    "learn": ["Learn it in a training program that covers this unit."],
    "practice": ["Practice it at work or in training, and ask a trainer to check your work."],
    "demonstrate": ["Be ready to explain and show it during the assessment."],
}


# Words and lists.

def lower_first(name: str) -> str:
    """'Perform fillet welding' -> 'perform fillet welding', leaving acronyms ('OHS ...') as they are."""
    return name[:1].lower() + name[1:] if len(name) > 1 and name[1].islower() else name


def listing(items: list[str], limit: int = NAMED) -> str:
    """'A', 'A and B', 'A, B and C', or 'A, B, C and 2 more'."""
    if len(items) > limit:
        return f"{', '.join(items[:limit])} and {len(items) - limit} more"
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def plural(count: int, word: str, words: str | None = None) -> str:
    return f"{count} {word if count == 1 else words or word + 's'}"


def day(value: date) -> str:
    return f"{value:%B} {value.day}, {value.year}"


def money(value) -> str:
    return f"₱{value:,.2f}"


def experience_text(years: float | None) -> str | None:
    if years is None:
        return None
    if years == 0:
        return "no practical experience"
    if years < 1:
        return "less than a year of experience"
    return f"about {plural(round(years), 'year')} of experience"


# Units of competency.

def category_kind(category: str) -> str:
    kind = (category or "").strip().lower()
    return kind if kind in ("core", "common", "basic") else "other"


def priority(category: str, status: str) -> str:
    """Core units carry the trade's technical work, so a core unit the learner doesn't know comes first. A gap in a
    shared or general unit, or a core unit the learner has some experience in, comes next; the rest after."""
    kind = category_kind(category)
    if status == "not_familiar":
        return "high" if kind == "core" else "medium"
    if status == "some_experience":
        return "medium" if kind == "core" else "low"
    return "low"


@dataclass(frozen=True)
class Unit:
    """One active unit of competency with the learner's answer: plain values, so the rules need no database."""
    id: int
    position: int
    name: str
    category: str
    status: str  # an answer code, or "not_answered"

    @property
    def kind(self) -> str:
        return category_kind(self.category)


def units_with_answers(qualification: Qualification, answers: dict[int, str]) -> list[Unit]:
    return [Unit(c.id, c.position, c.name, c.category, answers.get(c.id, "not_answered"))
            for c in catalog.active_competencies(qualification)]


def advice(unit: Unit, action: str, name: str, sector: str, jobs: list[str]) -> CompetencyAdvice:
    """What to do about one unit, why, and on what evidence. "Must learn" needs both a listed unit and the learner's
    own answer that they don't know it; a low score alone never makes a unit required."""
    role = {"core": f"a core unit: the technical work specific to {name}",
            "common": f"a common unit: skills shared by qualifications in the {sector} sector",
            "basic": "a basic unit: general workplace skills that every National Certificate includes",
            "other": f"one of the units of competency listed for {name}"}[unit.kind]
    job_text = f"jobs such as {listing(jobs[:2])}" if jobs else "jobs in this trade"
    relevance = {"core": f"Part of what the {name} assessment covers (core units are usually shown by doing the "
                         f"work), and of the work in {job_text}.",
                 "common": f"Part of what the {name} assessment covers, and used across jobs in the {sector} sector.",
                 "basic": f"Part of what the {name} assessment covers, and useful in any workplace.",
                 "other": f"Part of what the {name} assessment covers."}[unit.kind]
    verb = lower_first(unit.name)
    what = {"learn": f"Learn to {verb}.", "practice": f"Practice until you can {verb} without help.",
            "demonstrate": f"Be ready to show that you can {verb}."}[action]
    evidence = [f"Listed as a {unit.category} unit of competency for {name} in {CATALOG_SOURCE}."]
    if unit.status in ANSWER_WORDS:
        evidence.append(f"You answered “{ANSWER_WORDS[unit.status]}”.")
    if action == "demonstrate":
        evidence.append("A self-rating isn't proof, so an assessment will ask you to show it.")
    return CompetencyAdvice(
        competency_id=unit.id, name=unit.name, category=unit.category, status=unit.status,
        priority="low" if action == "demonstrate" else priority(unit.category, unit.status), action=action,
        basis={"learn": "required_unit", "practice": "reported_gap", "demonstrate": "general_recommendation"}[action],
        must_learn=action == "learn", what_to_do=what,
        why_it_matters=f"It's {role}. The competency assessment for {name} is based on its listed units.",
        activities=ACTIVITIES.get((unit.kind, action), FALLBACK_ACTIVITIES[action]), relevance=relevance,
        evidence=evidence)


def advise(units: list[Unit], name: str, sector: str, jobs: list[str],
           show_confident_core: bool) -> tuple[list[CompetencyAdvice], list[CompetencyAdvice]]:
    """(skills to improve, competencies to learn or practice). The first is every reported gap, most important first;
    the second keeps what's essential: units to learn, core units to practice, and, for a learner heading straight to
    assessment, the core units they rated confident and will have to show."""
    def order(item: CompetencyAdvice, unit: Unit):
        return PRIORITY_ORDER[item.priority], CATEGORY_ORDER[unit.kind], unit.position

    gaps = sorted(((advice(u, "learn" if u.status == "not_familiar" else "practice", name, sector, jobs), u)
                   for u in units if u.status in ("not_familiar", "some_experience")), key=lambda pair: order(*pair))
    improve = [item for item, _ in gaps]
    essential = [item for item in improve if item.action == "learn" or item.priority != "low"]
    if show_confident_core:
        essential += [advice(u, "demonstrate", name, sector, jobs) for u in units
                      if u.status == "confident" and u.kind == "core"]
    return improve, essential


# Readiness and records.

def band(readiness: ReadinessResult | None) -> str | None:
    """high, moderate or low, as the result's level says (its 80% and 50% bands)."""
    if readiness is None:
        return None
    word = (readiness.level.split() or [""])[0].lower()
    if word in ("high", "moderate", "low"):
        return word
    return "high" if readiness.score >= 80 else "moderate" if readiness.score >= 50 else "low"


def readiness_kind(level: str | None, route: str) -> str | None:
    """The pathway the readiness result points to; without one, the route the learner's experience suggests."""
    if level is not None:
        return {"high": "direct_assessment", "moderate": "focused_training", "low": "full_training"}[level]
    return {"ASSESSMENT_READINESS": "direct_assessment", "SKILL_GAP_CHECK": "focused_training",
            "TRAINING_AND_ASSESSMENT": "full_training"}.get(route)


@dataclass(frozen=True)
class Application:
    status: str
    scheduled_on: date
    center: str


@dataclass(frozen=True)
class Records:
    """The signed-in learner's own records about this qualification; empty for a guest."""
    verified_certificate: bool = False
    recorded_certificate: bool = False
    application: Application | None = None
    target_date: date | None = None


def learner_records(session: Session, learner: Learner | None, qualification: Qualification) -> Records:
    if learner is None:
        return Records()
    now = utcnow()
    today = now.astimezone(verification.PHILIPPINE_TIME).date()
    certificates = session.exec(select(Certification.verified, Certification.expires_on).where(
        Certification.learner_id == learner.id, Certification.qualification_id == qualification.id)).all()
    current = [verified for verified, expires in certificates if expires is None or expires >= today]
    application = session.exec(
        select(AssessmentApplication.status, AssessmentSchedule.scheduled_at, AssessmentCenter.name)
        .join(AssessmentSchedule, AssessmentSchedule.id == AssessmentApplication.schedule_id)
        .join(AssessmentCenter, AssessmentCenter.id == AssessmentSchedule.center_id)
        .where(AssessmentApplication.learner_id == learner.id,
               AssessmentSchedule.qualification_id == qualification.id,
               AssessmentApplication.status.in_(("pending", "approved")), AssessmentSchedule.scheduled_at > now)
        .order_by(AssessmentSchedule.scheduled_at)).first()
    target = session.exec(select(Goal.target_date).where(
        Goal.learner_id == learner.id, Goal.target_qualification_id == qualification.id, Goal.status == "active",
        Goal.target_date.is_not(None)).order_by(Goal.target_date)).first()
    return Records(
        verified_certificate=any(current), recorded_certificate=bool(current) and not any(current),
        application=Application(application[0], application[1].astimezone(verification.PHILIPPINE_TIME).date(),
                                application[2]) if application else None,
        target_date=target)


def neighbours(session: Session, qualification: Qualification) -> tuple[CatalogItem | None, CatalogItem | None]:
    """The levels just below and above this one in the same trade ('... NC I' and '... NC III'), when listed."""
    parsed = goal_rules.level_of(qualification.name)
    if parsed is None:
        return None, None
    family, level = parsed
    lower = higher = None
    for item in catalog.snapshot(session).items:
        other = goal_rules.level_of(item.summary.name)
        if other and other[0].casefold() == family.casefold():
            if other[1] == level - 1:
                lower = item
            elif other[1] == level + 1:
                higher = item
    return lower, higher


# Providers, from the existing rankings.

def _status(evidence: VerificationPublic, confirmed: bool, *sources: ProvenancePublic) -> str:
    if evidence.is_synthetic or any(source.status == "example" for source in sources):
        return "demonstration"
    return "confirmed" if confirmed else "needs_verification"


def _km(distance: float | None) -> int | None:
    return round(distance) if distance is not None else None


def _without_distance(notes: list[str]) -> list[str]:
    """The ranking says "About N km from you"; the report measures from the region's center and shows it apart."""
    return [note for note in notes if not (note.startswith("About ") and note.endswith(" km from you"))]


def training_options(result: TrainingRanking) -> list[ProviderOption]:
    """The ranking's scored programs first, then the listed ones that still need verification, in its order."""
    def option(program, score, notes, confirmed):
        status = _status(program.verification, confirmed, program.provenance, program.provider.provenance)
        return ProviderOption(
            kind="training", service_id=program.id, site_id=program.provider.id, name=program.provider.name,
            title=program.title, city=program.provider.city, region_code=program.provider.region_code,
            distance_km=_km(program.distance_km), starts_on=program.start_date, cost=program.cost,
            duration_hours=program.duration_hours, delivery_mode=program.delivery_mode,
            scholarship_available=program.scholarship_available,
            status=status, score=score if status == "confirmed" else None, notes=notes[:4])

    return ([option(r.program, r.score, _without_distance(r.explanation), True) for r in result.results]
            + [option(r.program, None, r.reasons, False) for r in result.requires_verification])[:PROVIDER_LIMIT]


def assessment_options(result: AssessmentRanking) -> list[ProviderOption]:
    def option(schedule, score, notes, confirmed):
        status = _status(schedule.verification, confirmed, schedule.provenance, schedule.center.provenance)
        return ProviderOption(
            kind="assessment", service_id=schedule.id, site_id=schedule.center.id, name=schedule.center.name,
            city=schedule.center.city, region_code=schedule.center.region_code, distance_km=_km(schedule.distance_km),
            starts_on=schedule.scheduled_at.astimezone(verification.PHILIPPINE_TIME).date(), cost=schedule.fee,
            seats_left=schedule.seats_left, status=status, score=score if status == "confirmed" else None,
            notes=notes[:4])

    def ranked_notes(item):
        # Its date, fee, seats and distance are fields of their own; the ranking's factor-by-factor scoring notes
        # are for the Compare assessment centers view, not a learner's summary.
        return [f"You've applied for this schedule ({item.application_status})."] if item.application_status else []

    return ([option(r.schedule, r.score, ranked_notes(r), True) for r in result.results]
            + [option(r.schedule, None, r.reasons, False) for r in result.requires_verification])[:PROVIDER_LIMIT]


# The report.

@dataclass
class Facts:
    """Everything the report's sections are written from."""
    qualification: ReportQualification
    units: list[Unit]
    readiness: ReadinessResult | None
    route: str
    route_reason: str
    profile: Profile
    match: MatchSummary
    records: Records
    region: Region | None
    request: PathwayReportRequest
    providers: list[ProviderOption]
    assessment: AssessmentRanking
    lower: CatalogItem | None
    higher: CatalogItem | None
    level: str | None = field(init=False)

    def __post_init__(self):
        self.level = band(self.readiness)

    @property
    def name(self) -> str:
        return self.qualification.name

    def with_status(self, *statuses: str) -> list[Unit]:
        return [u for u in self.units if u.status in statuses]

    def shown(self, kind: str) -> list[ProviderOption]:
        return [p for p in self.providers if p.kind == kind]


def match_summary(evidence: analysis.MatchEvidence, code: str) -> MatchSummary:
    codes = [m.qualification.code for m in evidence.matches]
    rank = codes.index(code) + 1 if code in codes else None
    others = [m.qualification for m in evidence.matches if m.qualification.code != code]
    score = evidence.matches[rank - 1].score if rank else None
    if not evidence.matches:
        strength, text = "none", ("Your goal didn't clearly match any qualification, so this report rests on the "
                                  "qualification you chose.")
    elif rank is None:
        strength, text = "chosen", (f"You chose this qualification yourself. Your goal matched "
                                    f"{listing([q.name for q in others])} more closely.")
    elif evidence.keyword.get(code, 0) > 0:
        strength, text = "named", "Your goal's own words point to this qualification."
    else:
        strength, text = "similar", ("Your goal is close to this qualification in meaning but doesn't name it, so "
                                     "check its units below to be sure it's what you want.")
    if rank and rank > 1:
        text += f" Your goal matched {evidence.matches[0].qualification.name} slightly more closely."
    return MatchSummary(strength=strength, rank=rank, match_count=len(codes), score=score, explanation=text,
                        alternatives=others)


def readiness_summary(f: Facts) -> ReadinessSummary:
    counts = Counter(u.status for u in f.units)
    tally = {status: counts.get(status, 0) for status in ("confident", "some_experience", "not_familiar",
                                                           "not_answered")}
    limitations = ["Self-reported: this is not an official competency assessment."]
    if not f.units:
        return ReadinessSummary(available=False, counts=tally, limitations=limitations, summary=(
            f"{f.name} has no units of competency in TESDA-TRACK's catalog yet, so readiness can't be checked."))
    if f.readiness is None:
        rated = len(f.units) - tally["not_answered"]
        limitations.append(f"{plural(tally['not_answered'], 'unit')} not rated yet.")
        return ReadinessSummary(available=False, counts=tally, limitations=limitations, summary=(
            f"You've rated {rated} of {plural(len(f.units), 'unit')}. Rate them all to see how ready you are."))
    if tally["some_experience"]:
        limitations.append("“I have some experience” counts as half a unit in the score, so the score is an estimate.")
    return ReadinessSummary(
        available=True, score=f.readiness.score, level=f.readiness.level, counts=tally, limitations=limitations,
        summary=f"{f.readiness.level} ({f.readiness.score:g}%): you rated yourself confident in "
                f"{tally['confident']} of {plural(len(f.units), 'unit')}.")


def availability_line(f: Facts, kind: str) -> str:
    label = "training programs" if kind == "training" else "assessment schedules"
    shown = f.shown(kind)
    if not shown:
        return f"TESDA-TRACK doesn't list any {label} for {f.name} yet."
    if any(p.status == "confirmed" for p in shown):
        return f"Verified {label} are listed: see the options below."
    return f"{label.capitalize()} are listed, but none is verified in TESDA-TRACK yet: confirm with the provider."


def pathway_options(f: Facts) -> list[PathwayOption]:
    """The ways forward, with exactly one recommended when the evidence picks one."""
    name, n = f.name, len(f.units)
    gaps = f.with_status("not_familiar", "some_experience")
    unknown = f.with_status("not_familiar")
    core_unknown = [u for u in unknown if u.kind == "core"]
    confident = f.with_status("confident")
    kind = readiness_kind(f.level, f.route)
    years = f.profile.experience_years
    experience = experience_text(years)
    experienced = (years is not None and years >= 1) or f.profile.has_certification is True
    options = []

    if f.records.verified_certificate:
        options.append(PathwayOption(kind="already_certified", title=f"You already hold {name}", recommended=True,
                                     service_kind=None, reasons=[
            f"Your account has a verified certificate for {name}.",
            "Use it when you apply for jobs, and keep your skills current."]))
    if f.records.application:
        a = f.records.application
        options.append(PathwayOption(kind="current_application", title="Prepare for your scheduled assessment",
                                     recommended=True, service_kind="assessment", reasons=[
            f"Your application for the assessment at {a.center} on {day(a.scheduled_on)} is {a.status}.",
            "Use the time before it to practice the units you're least sure of."]))

    if kind == "direct_assessment" or (experienced and not f.records.verified_certificate):
        reasons = []
        if kind == "direct_assessment":
            if f.readiness is not None:
                reasons.append(f"You rated yourself confident in {len(confident)} of {plural(n, 'unit')} "
                               f"({f.readiness.score:g}%).")
            else:
                reasons.append(f.route_reason)
            if experience:
                reasons.append(f"You reported {experience}.")
        else:
            # Readiness points to training, but experience may count: say so without promising it.
            basis = f"You reported {experience}" if years is not None and years >= 1 else \
                "You said you hold a related certificate"
            reasons.append(f"{basis}. An assessment center or training provider can help you work out which units it "
                           "already covers, and whether you could be assessed without full training.")
        reasons.append("An assessment center decides whether you can be assessed without training first, based on "
                       "its own requirements, so ask before you apply.")
        reasons.append(availability_line(f, "assessment"))
        options.append(PathwayOption(kind="direct_assessment",
                                     title="Ask an assessment center about going straight to assessment",
                                     recommended=kind == "direct_assessment", service_kind="assessment",
                                     reasons=reasons))

    if kind == "focused_training" or (f.level == "high" and gaps):
        reasons = [f"You marked {plural(len(gaps), 'unit')} as {'a gap' if len(gaps) == 1 else 'gaps'}: "
                   f"{listing([u.name for u in gaps])}."] if gaps else [f.route_reason]
        reasons += ["TESDA-TRACK lists full programs; ask a provider whether you can join only the modules that "
                    "cover these units.", availability_line(f, "training")]
        options.append(PathwayOption(
            kind="focused_training", recommended=kind == "focused_training", service_kind="training",
            title="Take focused training on your gaps, then the assessment" if kind == "focused_training"
            else "Brush up on a few units first (optional)", reasons=reasons))

    if kind == "full_training":
        if f.readiness is not None:
            first = (f"You marked {len(unknown)} of {plural(n, 'unit')} as not familiar"
                     + (f", including {plural(len(core_unknown), 'core unit')}." if core_unknown else "."))
        else:
            first = f.route_reason
        options.append(PathwayOption(kind="full_training", title="Take a full training program, then the assessment",
                                     recommended=True, service_kind="training", reasons=[
            first, "A full program is built to cover the qualification's units, with supervised practice.",
            availability_line(f, "training")]))
    if kind is None:
        # Neither readiness nor experience picks a pathway yet: show training without recommending it.
        options.append(PathwayOption(kind="full_training", title="Training, then the assessment", recommended=False,
                                     service_kind="training", reasons=[
            f.route_reason, "Finish the readiness check to see whether you need full training, focused training, or "
                            "could go straight to assessment.", availability_line(f, "training")]))

    if f.level == "low" and f.lower is not None:
        options.append(PathwayOption(kind="lower_level", title=f"Consider starting with {f.lower.summary.name}",
                                     recommended=False, service_kind="training", qualification=f.lower.summary,
                                     reasons=[
            f"It's the level before {name} in the same trade, with "
            f"{plural(len(f.lower.public.competencies), 'unit')} of competency.",
            "Ask a provider whether it suits you as a first step."]))
    if (f.level == "high" or f.records.verified_certificate) and f.higher is not None:
        options.append(PathwayOption(kind="next_level", title=f"Plan for the next level: {f.higher.summary.name}",
                                     recommended=False, service_kind=None, qualification=f.higher.summary,
                                     reasons=[f"It's the level after {name} in the same trade."]))

    # Only the first recommended option stays recommended: a certificate or an application outranks the rest.
    seen = False
    for option in options:
        if option.recommended:
            option.recommended, seen = not seen, True
    return sorted(options, key=lambda o: not o.recommended)


def reasoning(f: Facts) -> list[Explanation]:
    name, n = f.name, len(f.units)
    gaps = f.with_status("not_familiar", "some_experience")
    confident = f.with_status("confident")
    result = []
    if f.readiness is not None or confident:
        core = [u for u in confident if u.kind == "core"]
        if confident:
            points = ["Confident: " + listing([u.name for u in sorted(confident, key=lambda u: CATEGORY_ORDER[u.kind])],
                                              5) + "."]
            points.append(f"{plural(len(core), 'of them is a core unit', 'of them are core units')}, the technical "
                          "work of this trade: a base to build on for the assessment." if core else
                          "They're general or shared skills; the core technical units are still ahead.")
            result.append(Explanation(topic="strengths", points=points, summary=(
                f"You rated yourself confident in {len(confident)} of {plural(n, 'unit')} of {name}.")))
        else:
            result.append(Explanation(topic="strengths", summary="You haven't rated any unit as confident yet.",
                                      points=["Training is designed to build these units from the start."]))
    if f.readiness is not None or gaps:
        high = [u for u in gaps if priority(u.category, u.status) == "high"]
        if not gaps:
            result.append(Explanation(topic="skill_gaps", summary="You didn't report any gaps.", points=[
                "Before the assessment, practice showing each unit from start to finish."]))
        else:
            first = high or [u for u in gaps if priority(u.category, u.status) == "medium"] or gaps
            counts = Counter(priority(u.category, u.status) for u in gaps)
            points = [f"{counts[p]} {p}-priority" for p in ("high", "medium", "low") if counts[p]]
            result.append(Explanation(topic="skill_gaps", summary=(
                f"Start with {listing([u.name for u in first])}."), points=[
                f"Your {plural(len(gaps), 'gap')}: {', '.join(points)}.",
                "Core units you don't know yet come first: they're the trade's technical work and usually need "
                "supervised practice. Units you have some experience in, and general workplace units, come after."]))

    career = []
    jobs = f.qualification.possible_jobs
    if jobs:
        career.append(f"{name} leads to jobs such as {listing(jobs)} (from its Training Regulation).")
    career.append(f.match.explanation)
    if f.profile.existing_skills:
        career.append(f"You mentioned experience in {listing(f.profile.existing_skills)}.")
    if f.records.recorded_certificate:
        career.append(f"Your account lists a certificate for {name} that isn't verified yet, so eligibility checks "
                      "can't count it.")
    if f.profile.intent == "career_exploration":
        career.append("You said you're still exploring, so compare a few qualifications before you commit to "
                      "training.")
    if f.request.preferred_delivery_mode:
        career.append(f"You prefer {MODE_WORDS[f.request.preferred_delivery_mode]} training; programs that offer it "
                      "rank higher.")
    if f.request.needs_scholarship:
        career.append("You need a scholarship; programs that list one rank higher.")
    goal = f.profile.career_goal
    result.append(Explanation(topic="career_goal", points=career, summary=(
        f"Your goal points to work as {'an' if goal[:1].lower() in 'aeiou' else 'a'} {goal}." if goal
        else f"You chose {name}.")))

    if f.readiness is not None:
        unresolved = [u.name for u in gaps if u.kind == "core"]
        counts = Counter(u.status for u in f.units)
        points = [f"{counts['confident']} confident, {counts['some_experience']} with some experience, "
                  f"{counts['not_familiar']} not familiar."]
        if unresolved:
            points.append(f"Core units to resolve before the assessment: {listing(unresolved)}.")
        points.append("This is a self-check, not an official competency assessment: only an accredited assessment "
                      "center can assess you.")
        result.append(Explanation(topic="assessment_readiness", points=points, summary=(
            f"Your self-rated readiness is {f.readiness.score:g}% ({f.readiness.level.lower()}).")))
    elif f.units:
        result.append(Explanation(topic="assessment_readiness",
                                  summary="Your readiness check isn't complete, so this report can't say how ready "
                                          "you are.",
                                  points=["Rate every unit in the readiness check to get advice that fits you."]))

    employment = [NO_JOB_DATA]
    if jobs:
        employment.append(f"Jobs listed for {name}: {listing(jobs, 5)}. Its core units describe the work these jobs "
                          "involve.")
    employment.append("A National Certificate can help you show employers your skills, but neither it nor this "
                      "report guarantees a job.")
    result.append(Explanation(topic="employment", summary="Use this as general guidance on where the qualification "
                                                          "can lead.", points=employment))
    return result


def considerations(f: Facts) -> list[Consideration]:
    name, region = f.name, f.region
    training, assessment = f.shown("training"), f.shown("assessment")
    result = []
    if not training and not assessment:
        result.append(Consideration(topic="providers", text=(
            f"TESDA-TRACK doesn't list any training programs or assessment schedules for {name} yet."), items=[
            f"Ask the TESDA provincial or district office near you which providers offer {name}."]))
    else:
        items = []
        if not training:
            items.append(f"No training programs for {name} are listed yet.")
        if not assessment:
            items.append(f"No upcoming assessment schedules for {name} are listed yet.")
        sorted_by = f", sorted by distance from {region.center_city}, your region's center" if region else ""
        result.append(Consideration(topic="providers", items=items, text=(
            f"The options below come from TESDA-TRACK's training and assessment rankings for {name}{sorted_by}.")))

    statuses = {p.status for p in f.providers}
    if "needs_verification" in statuses or "demonstration" in statuses:
        items = []
        if "demonstration" in statuses:
            items.append("Options marked “Demonstration” are sample records, not real providers.")
        if "confirmed" in statuses:
            items.append("Options marked “Verified” have current verification evidence for this qualification.")
        result.append(Consideration(topic="verification", items=items, text=(
            "Some options aren't verified in TESDA-TRACK yet. Before you enroll or apply, confirm with the provider "
            f"that it's registered or accredited for {name}, and that its schedule and fees are current.")))

    if region is not None:
        distances = [p for p in f.providers if p.distance_km is not None]
        if distances:
            nearest = min(distances, key=lambda p: p.distance_km)
            result.append(Consideration(topic="distance", text=(
                f"The nearest option listed, {nearest.name}, is about {nearest.distance_km:,} km from "
                f"{region.center_city}, your region's center. Distances are straight-line, so travel time and "
                "fares can be more.")))
        elif f.providers:
            result.append(Consideration(topic="distance", text=(
                "The listed options have no map location, so their distance couldn't be checked.")))

    if f.providers:
        known = [f"{p.name}: {'training cost' if p.kind == 'training' else 'assessment fee'} {money(p.cost)}"
                 + (f", {p.duration_hours:,} hours" if p.duration_hours else "") for p in f.providers
                 if p.cost is not None]
        missing = [p for p in f.providers if p.cost is None or p.starts_on is None]
        if known:
            text = "Listed fees are below; check them with the provider before you decide."
            if missing:
                text += " Some options don't list a fee or start date, so ask about those."
            result.append(Consideration(topic="cost_and_schedule", text=text, items=known))
        elif missing:
            result.append(Consideration(topic="cost_and_schedule", text=(
                "Fees or start dates aren't listed for these options; ask the provider.")))

    if f.request.needs_scholarship:
        offering = [p.name for p in training if p.scholarship_available]
        result.append(Consideration(topic="scholarship", text=(
            f"{listing(offering)} {'lists' if len(offering) == 1 else 'list'} a scholarship." if offering else
            "None of the listed training options says it offers a scholarship. Ask the provider or the TESDA office "
            "about scholarship programs.")))

    if assessment:
        # Only requirements reviewed on verified schedules; nothing is inferred for the others.
        requirements = sorted({rule.description for ranked in f.assessment.results
                               if ranked.schedule.verification.requirements_reviewed
                               for rule in ranked.schedule.verification.requirements})
        result.append(Consideration(topic="eligibility", items=requirements, text=(
            "Verified requirements for the listed assessment centers (confirm the documents with the center):"
            if requirements else
            "Assessment requirements and documents aren't verified in TESDA-TRACK for these centers. Ask the "
            "assessment center what you need to apply.")))

    practical = [u.name for u in f.with_status("not_familiar", "some_experience") if u.kind == "core"]
    if practical:
        result.append(Consideration(topic="equipment", text=(
            f"The core units you need to work on ({listing(practical)}) are practical. Choose training with supervised, "
            "hands-on practice and access to the tools and equipment they need, and ask the provider about it.")))

    result.append(Consideration(topic="jobs", text=(
        "For job openings and employer requirements near you, check PhilJobNet or your local Public Employment "
        "Service Office (PESO): TESDA-TRACK has no job-vacancy data.")))

    if f.match.strength in ("none", "chosen", "similar") or (f.match.rank or 0) > 1:
        items = [q.name for q in f.match.alternatives]
        result.append(Consideration(topic="alternatives", items=items, text=(
            "Your goal also matched these qualifications; compare them before you commit." if items else
            "If this isn't the trade you meant, describe the job you want in other words to see other matches.")))

    missing = []
    if not f.units:
        missing.append(f"{name} has no units of competency in TESDA-TRACK's catalog, so your skills can't be checked "
                       "against it. Ask TESDA for its Training Regulation.")
    elif f.readiness is None:
        rated = len(f.units) - len(f.with_status("not_answered"))
        missing.append(f"You've rated {rated} of {plural(len(f.units), 'unit')} in the readiness check.")
    if f.profile.experience_years is None:
        missing.append("How much practical experience you have.")
    if f.profile.has_certification is None:
        missing.append("Whether you already hold a related certificate.")
    if region is None:
        missing.append("Your region, to sort options by distance.")
    if missing:
        result.append(Consideration(topic="missing_information", items=missing, text=(
            "Some information is missing, so parts of this report are general:")))
    return result


def next_steps(f: Facts, options: list[PathwayOption], learn: list[CompetencyAdvice]) -> list[NextStep]:
    name = f.name
    primary = next((o.kind for o in options if o.recommended), None)
    focus = [a for a in learn if a.action != "demonstrate"][:NAMED]
    training = f.shown("training")
    assessment = f.shown("assessment")
    steps: list[tuple[str, str, str, list[int]]] = []

    def add(kind, title, detail, ids=None):
        steps.append((kind, title, detail, ids or []))

    def providers_of(kind, items):
        label = "training providers" if kind == "training" else "assessment centers"
        if not items:
            return (f"Find {label} for {name}", f"None are listed in TESDA-TRACK yet. Ask the TESDA provincial or "
                                                f"district office near you which {label} offer {name}.")
        return (f"Compare {label}", f"Start with {listing(list(dict.fromkeys(p.name for p in items)))}, and compare "
                                    "their schedules, fees and distance.")

    if f.match.strength == "none":
        add("explore_alternatives", "Check this is the right qualification",
            "Your goal didn't clearly match a qualification. Read its units, or describe the job you want in other "
            "words.")
    if f.units and f.readiness is None:
        add("complete_readiness", "Finish the readiness check",
            f"Rate all {plural(len(f.units), 'unit')} of {name} so the advice fits you.")
    if f.region is None:
        add("choose_region", "Choose your region", "So training and assessment options are sorted by distance.")
    if f.records.application:
        a = f.records.application
        add("prepare_assessment", f"Prepare for your assessment on {day(a.scheduled_on)}",
            f"Your application at {a.center} is {a.status}. "
            + (f"Practice {listing([x.name for x in focus])}, and " if focus else "")
            + "ask the center what to bring.", [x.competency_id for x in focus])
    elif primary == "already_certified":
        if f.higher is not None:
            add("next_level", f"Look into {f.higher.summary.name}", "It's the next level in the same trade.")
    elif primary == "direct_assessment":
        if focus:
            add("review_gaps", "Review the units you're less sure of", f"{listing([x.name for x in focus])}.",
                [x.competency_id for x in focus])
        add("confirm_requirements", "Ask an assessment center about assessment",
            (f"For example {assessment[0].name}. " if assessment else "")
            + "Ask whether you can be assessed directly, what it requires, and which documents to bring.")
        add("apply", "Apply for the assessment", "When you meet the center's requirements, book a schedule.")
    elif primary in ("focused_training", "full_training"):
        if primary == "focused_training" and focus:
            add("review_gaps", "Start with your highest-priority gaps", f"{listing([x.name for x in focus])}.",
                [x.competency_id for x in focus])
        add("compare_providers", *providers_of("training", training))
        add("train", "Complete the training" if primary == "full_training" else "Take focused training",
            "Choose training with supervised, hands-on practice"
            + (f", especially for {listing([x.name for x in focus])}." if focus else "."),
            [x.competency_id for x in focus])
        add("recheck", "Rate yourself again", "After training, check whether your gaps have closed.")
        add("confirm_requirements", "Confirm the assessment requirements",
            (f"For example with {assessment[0].name}. " if assessment else "")
            + "Ask what the assessment requires and which documents to bring.")
        add("apply", "Apply for the assessment", "When you meet the requirements, book a schedule.")
    add("explore_jobs", "Explore job opportunities",
        "Look for openings and employer requirements on PhilJobNet or at your local PESO"
        + (f", for jobs such as {listing(f.qualification.possible_jobs[:2])}." if f.qualification.possible_jobs
           else "."))
    return [NextStep(position=i, kind=kind, title=title, detail=detail, competency_ids=ids)
            for i, (kind, title, detail, ids) in enumerate(steps, start=1)]


def final(f: Facts, options: list[PathwayOption], learn: list[CompetencyAdvice],
          steps: list[NextStep]) -> FinalRecommendation:
    name = f.name
    primary = next((o for o in options if o.recommended), None)
    focus = [a.name for a in learn if a.action != "demonstrate"][:NAMED]
    confirmed = [p for p in f.providers if p.status == "confirmed"]
    providers = [p.name for p in (confirmed or [p for p in f.providers if p.status == "needs_verification"])]
    providers = list(dict.fromkeys(providers))[:NAMED]
    lead = {
        "already_certified": f"You already hold a verified certificate for {name}; build on it",
        "current_application": f"Your next step for {name} is to prepare for the assessment you applied for",
        "direct_assessment": f"Your strongest option for {name} is to ask an assessment center whether you can go "
                             "straight to assessment",
        "focused_training": f"Your best next step for {name} is focused training on the units you marked as gaps, "
                            "then the assessment",
        "full_training": f"Your best next step for {name} is a full training program, then the assessment",
    }
    sentences = [(lead[primary.kind] + ".") if primary and primary.kind in lead else
                 f"Finish the readiness check for {name} first, so the report can recommend a pathway."]
    if focus:
        sentences.append(f"Focus first on {listing(focus)}.")
    if providers:
        verified = "verified" if confirmed else "listed (not yet verified)"
        sentences.append(f"{listing(providers)} {'is' if len(providers) == 1 else 'are'} {verified} for {name}.")
    elif f.providers:
        sentences.append(f"Only demonstration records are listed for {name}, so ask the TESDA office near you which "
                         "providers offer it.")
    else:
        sentences.append(f"No providers for {name} are listed in TESDA-TRACK yet, so ask the TESDA office near you "
                         "which providers offer it.")
    if f.records.target_date:
        sentences.append(f"Your saved goal's target date is {day(f.records.target_date)}.")
    first = steps[0] if steps else None
    return FinalRecommendation(summary=" ".join(sentences), next_action=f"{first.title}: {first.detail}" if first else "",
                               pathway=primary.title if primary else "Finish the readiness check", focus=focus,
                               providers=providers)


def build(session: Session, request: PathwayReportRequest, embedder: Embedder | None,
          learner: Learner | None) -> PathwayReport:
    qualification = catalog.resolve_qualification(session, request.qualification_code)
    region = None
    if request.region_code:
        region = session.get(Region, request.region_code)
        if region is None:
            raise InvalidRequestError("Unknown region.")
    units = units_with_answers(qualification, request.answers)
    readiness = analysis.score_readiness(qualification, request.answers) \
        if units and all(u.status != "not_answered" for u in units) else None
    evidence = analysis.match_evidence(session, request.query, request.profile, embedder)
    route = analysis.pathway(session, evidence.profile, qualification.code)

    # The existing rankings, unchanged: they audit what they return, so the report's options can be traced.
    training = ranking.rank_programs(session, TrainingRankingRequest(
        qualification_code=qualification.code, goal=request.query,
        near_lat=region.latitude if region else None, near_lon=region.longitude if region else None,
        preferred_delivery_mode=request.preferred_delivery_mode, needs_scholarship=request.needs_scholarship,
        limit=PROVIDER_LIMIT), embedder, learner)
    # Its region_code would be a hard filter; the region's center sorts by distance, as for training, instead.
    assessment = assessment_ranking.rank(session, AssessmentRankingRequest(
        qualification_code=qualification.code, goal=request.query,
        near_lat=region.latitude if region else None, near_lon=region.longitude if region else None,
        limit=PROVIDER_LIMIT), learner)

    item = catalog.catalog_item(qualification)
    lower, higher = neighbours(session, qualification)
    facts = Facts(
        qualification=ReportQualification(**item.summary.model_dump(), possible_jobs=list(item.possible_jobs),
                                          unit_count=len(units)),
        units=units, readiness=readiness, route=route.recommendation, route_reason=route.reason,
        profile=evidence.profile, match=match_summary(evidence, qualification.code),
        records=learner_records(session, learner, qualification), region=region, request=request,
        providers=training_options(training) + assessment_options(assessment), assessment=assessment,
        lower=lower, higher=higher)
    options = pathway_options(facts)
    primary = next((o.kind for o in options if o.recommended), None)
    improve, learn = advise(units, facts.name, facts.qualification.sector, facts.qualification.possible_jobs,
                            show_confident_core=primary == "direct_assessment")
    steps = next_steps(facts, options, learn)
    return PathwayReport(
        generated_at=utcnow(), qualification=facts.qualification, match=facts.match, route=route.recommendation,
        readiness=readiness_summary(facts),
        strengths=[CompetencyRef(competency_id=u.id, name=u.name, category=u.category)
                   for u in facts.with_status("confident")],
        training_to_consider=options, skills_to_improve=improve, competencies_to_learn_or_practice=learn,
        reasoning=reasoning(facts),
        employment=Employment(observed_data=False, possible_jobs=facts.qualification.possible_jobs,
                              source=JOBS_SOURCE, note=NO_JOB_DATA),
        considerations=considerations(facts), providers=facts.providers,
        region_name=region.name if region else None, next_steps=steps, final=final(facts, options, learn, steps),
        disclaimer=DISCLAIMER,
        rankings=RankingReferences(training_audit_id=training.audit_id, training_policy=training.policy_version,
                                   assessment_audit_id=assessment.audit_id,
                                   assessment_policy=assessment.policy_version))
