"""Transparent assessment scoring using existing catalog rules; never an eligibility decision."""
import re

from tesda_track.config import get_settings
from tesda_track.schemas.learner_assessments import AssessmentAnswers, PersonalizedScore, ScoreFactor
from tesda_track.services.recommendation_service import score_qualifications
from tesda_track.services import goal_rules
from tesda_track.utils.helpers import contains, normalize

LEVELS = {"confident": 100.0, "some_experience": 50.0, "not_familiar": 0.0}

# Everyday descriptions of catalog occupations, never authority/eligibility evidence.
OCCUPATIONAL_PHRASES = (
    ("caregiving (elderly)", re.compile(r"\b(?:elder(?:ly)? care|senior care|care for (?:the )?(?:elderly|seniors|older adults)|take care of (?:the )?(?:elderly|seniors|older adults)|mag.alaga ng (?:matatanda|matanda))\b")),
    ("pv systems installation", re.compile(r"\b(?:solar panel(?:s)?|solar installation|photovoltaic installation)\b")),
    ("contact center services", re.compile(r"\b(?:call cent(?:er|re)(?:s)?|contact cent(?:er|re)(?:s)?)\b")),
    ("food production (bread and patisserie)", re.compile(r"\b(?:bread and cakes|bread making|cake making|baking bread|baking cakes|bake (?:bread|cakes)|pastry making|paggawa ng tinapay)\b")),
)


def observed(score: float, reason: str) -> ScoreFactor:
    return ScoreFactor(score=round(score, 6), state="observed", reason=reason)


def omitted(reason: str) -> ScoreFactor:
    return ScoreFactor(state="not_applicable", reason=reason)


def unknown(reason: str) -> ScoreFactor:
    return ScoreFactor(state="unknown", reason=reason)


def combine(factors: dict[str, ScoreFactor], limitations: list[str] | None = None) -> PersonalizedScore:
    weights = get_settings().personalization_weights.model_dump()
    total = sum(weights[key] for key, factor in factors.items() if factor.state != "not_applicable")
    effective = {key: weights[key] / total if total and factor.state != "not_applicable" else 0.0
                 for key, factor in factors.items()}
    contributions = {key: round(effective[key] * (factor.score or 0), 6) for key, factor in factors.items()}
    coverage = sum(effective[key] for key, factor in factors.items() if factor.state == "observed")
    notes = list(limitations or []) + [factor.reason for factor in factors.values() if factor.state == "unknown"]
    if not total:
        notes.append("Add interests, skills or a career goal to personalize recommendations.")
    return PersonalizedScore(score=round(sum(contributions.values())), configured_weights=weights,
                             effective_weights=effective, components=factors, contributions=contributions,
                             evidence_coverage=min(1.0, coverage), limitations=list(dict.fromkeys(notes)))


def matches_term(term: str, rules: dict) -> bool:
    # Reuse the existing keyword/typo/negation rules instead of creating a second occupation matcher.
    text = normalize(goal_rules.strip_negated(term)).replace("-", " ")
    title = normalize(rules["name"])
    phrase_match = any(title.startswith(name) and pattern.search(text) for name, pattern in OCCUPATIONAL_PHRASES)
    return bool(phrase_match or score_qualifications(term, {}, [rules]))


def alignment(answers: AssessmentAnswers, item) -> dict[str, ScoreFactor]:
    interest_terms = [*answers.interests, *answers.work_activities]
    career = answers.career_goal
    interest_tokens = {normalize(term) for term in interest_terms}
    skill_terms = [term for term in answers.existing_skills
                   if normalize(term) not in interest_tokens and normalize(term) != normalize(career or "")]
    interests = [100.0 if matches_term(term, item.rules) else 0.0 for term in interest_terms]
    if answers.preferred_sectors:
        interests.append(100.0 if item.sector in answers.preferred_sectors else 0.0)
    interest = observed(sum(interests) / len(interests), "Overlap with your selected interests, activities and catalog sectors.") \
        if interests else omitted("No occupational interests were supplied.")
    skills = []
    competency_names = [normalize(c.name) for c in item.public.competencies]
    for term in skill_terms:
        skills.append(100.0 if matches_term(term, item.rules) or any(contains(name, normalize(term)) for name in competency_names) else 0.0)
    by_id = {c.competency_id: c.answer for c in answers.competencies}
    answered = [LEVELS[by_id[c.id]] for c in item.public.competencies if c.id in by_id]
    skills.extend(answered)
    if answers.competencies and not answered and not skill_terms:
        skills.append(0.0)
    skill = observed(sum(skills) / len(skills), "Alignment with self-reported skills and explicitly answered catalog competencies.") \
        if skills else omitted("No independent skill evidence was supplied; beginners remain eligible for training.")
    if answers.preferred_qualification_codes:
        career_score = 100.0 if item.code in answers.preferred_qualification_codes else 0.0
        career_factor = observed(career_score, "Alignment with your explicitly selected qualification pathway.")
    elif career and normalize(career) not in interest_tokens:
        career_factor = observed(100.0 if matches_term(career, item.rules) else 0.0,
                                 "Alignment with your stated career goal using catalog keywords, jobs and documented occupational phrases.")
    else:
        career_factor = omitted("No independent career-goal signal was supplied; repeated interest evidence is counted once.")
    return {"interest": interest, "skill": skill, "career": career_factor}


def qualification_score(answers: AssessmentAnswers, item) -> PersonalizedScore:
    factors = alignment(answers, item)
    # Location and practical options belong to delivery records, not to qualification titles.
    factors.update(location=omitted("Distance is evaluated when choosing a provider."),
                   preference=omitted("Budget, schedule and delivery are evaluated against individual programs."))
    return combine(factors, context_limitations(answers))


def context_limitations(answers: AssessmentAnswers) -> list[str]:
    notes = []
    if answers.work_environments:
        notes.append("Work-environment preferences are recorded but no authoritative catalog mapping is available to score them.")
    if answers.education is not None or answers.experience_years is not None:
        notes.append("Education and experience inform the learner profile; they do not independently establish eligibility or competency.")
    if answers.goal_kind or answers.preferred_pathway:
        notes.append("Career purpose and preferred route inform pathway discussions; unsupported pathway mappings do not add score bonuses.")
    return notes


def program_score(answers: AssessmentAnswers, item, program, distance: float | None,
                  location_supplied: bool) -> PersonalizedScore:
    factors = alignment(answers, item)
    radius = answers.preferences.maximum_distance_km or get_settings().proximity_radius_km
    factors["location"] = (observed(100 * max(0.0, 1 - distance / radius), "Straight-line distance from your selected approximate location.")
                           if distance is not None else unknown("This provider has no confirmed coordinates.")) \
        if location_supplied else omitted("No location preference was supplied.")
    checks = practical_checks(answers, program)
    if checks:
        score = 100 * sum(value or 0 for _, value, _ in checks) / len(checks)
        missing = [reason for _, value, reason in checks if value is None]
        factors["preference"] = ScoreFactor(score=score, state="unknown" if missing else "observed",
            reason="; ".join(missing) if missing else "Share of your stated delivery, budget, scholarship and schedule preferences met.")
    else:
        factors["preference"] = omitted("No practical preferences were supplied.")
    return combine(factors, context_limitations(answers))


def practical_checks(answers: AssessmentAnswers, program) -> list[tuple[str, bool | None, str]]:
    pref = answers.preferences
    checks = []
    if pref.delivery_mode:
        checks.append(("delivery", program.delivery_mode == pref.delivery_mode if program.delivery_mode != "unknown" else None,
                       "Delivery mode is unknown."))
    if pref.maximum_budget is not None:
        checks.append(("budget", program.cost <= pref.maximum_budget if program.cost is not None else None, "Program cost is unknown."))
    if pref.needs_scholarship:
        checks.append(("scholarship", program.scholarship_available,
                       "Scholarship availability is unknown."))
    if pref.start_after or pref.start_before:
        checks.append(("schedule", (not pref.start_after or program.start_date >= pref.start_after) and
                       (not pref.start_before or program.start_date <= pref.start_before) if program.start_date else None,
                       "Program start date is unknown."))
    if pref.accessibility_preferences:
        checks.append(("accessibility", None, "Accessibility preferences require provider confirmation; capability data is missing."))
    return checks


def constraint_reasons(answers: AssessmentAnswers, program, distance: float | None) -> tuple[bool, list[str]]:
    """Return exclusion separately from unresolved mandatory checks; neither is a scoring penalty."""
    pref = answers.preferences
    unknowns = []
    if pref.maximum_distance_km is not None:
        if distance is None:
            unknowns.append("Maximum distance cannot be checked without provider coordinates.")
        elif distance > pref.maximum_distance_km:
            return True, []
    mandatory = {"delivery": pref.delivery_is_mandatory, "budget": pref.budget_is_mandatory,
                 "schedule": pref.schedule_is_mandatory, "scholarship": pref.scholarship_is_mandatory}
    for key, value, reason in practical_checks(answers, program):
        if mandatory.get(key):
            if value is None:
                unknowns.append(reason)
            elif not value:
                return True, []
    return False, unknowns


def explanations(score: PersonalizedScore) -> list[str]:
    reasons = [f"{key.capitalize()}: {factor.reason} ({factor.score:g}/100; contributes {score.contributions[key]:.1f} points)."
               for key, factor in score.components.items() if factor.score is not None and score.effective_weights[key] > 0]
    return [*reasons, *score.limitations]
