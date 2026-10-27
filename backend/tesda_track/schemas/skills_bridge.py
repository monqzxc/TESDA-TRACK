from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


SkillTerm = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SkillsBridgeMatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skills: list[SkillTerm] = Field(min_length=1, max_length=25)
    limit: int = Field(default=6, ge=1, le=10)

    @field_validator("skills")
    @classmethod
    def unique_terms(cls, skills: list[str]) -> list[str]:
        seen = set()
        unique = []
        for term in skills:
            if term.casefold() not in seen:
                unique.append(term)
                seen.add(term.casefold())
        return unique


class SkillsBridgeOccupationSearchRequest(BaseModel):
    """Occupation titles are searched separately from capability/skill matching."""
    model_config = ConfigDict(extra="forbid")
    occupations: list[SkillTerm] = Field(min_length=1, max_length=10)
    limit: int = Field(default=6, ge=1, le=10)

    @field_validator("occupations")
    @classmethod
    def unique_terms(cls, occupations: list[str]) -> list[str]:
        seen = set()
        unique = []
        for term in occupations:
            if term.casefold() not in seen:
                unique.append(term)
                seen.add(term.casefold())
        return unique


ExploreText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class SkillsBridgeExploreRequest(BaseModel):
    """A learner's own words. Only the terms extracted from them are sent to Skills Bridge."""
    model_config = ConfigDict(extra="forbid")
    text: ExploreText


class SkillsBridgeTermResolution(BaseModel):
    """How Skills Bridge understood one term: related skills for a capability, titles for an occupation."""
    term: str
    strength: str | None = None
    matched_skills: int | None = None
    matched_occupations: int | None = None


class SkillsBridgeOccupationMatch(BaseModel):
    occupation_id: int
    title: str
    sector: str | None = None
    score: float | None = None
    terms_matched: list[str] = []
    open_posts: int | None = None
    match_kind: Literal["occupation", "skill"] = Field(
        description="occupation: matched by title (an occupation title match); skill: matched by capabilities "
                    "(an input skill match). Neither is a readiness score.")


class SkillsBridgeEvidence(BaseModel):
    term: str
    skills: list[str] = []


class SkillsBridgeQualificationMatch(BaseModel):
    code: str | None = None
    title: str | None = None
    level_label: str | None = None
    status: str | None = None
    review_due_at: str | None = None
    terms_matched: list[str] = []
    skill_share: float | None = None
    evidence: list[SkillsBridgeEvidence] = []


class SkillsBridgeExploreResponse(BaseModel):
    source: str = "Skills Bridge"
    source_url: str = "https://skills-bridge.ph"
    retrieved_at: str | None = Field(default=None, description="When Skills Bridge answered; kept by cached answers.")
    searched: bool = Field(description="False when no usable terms were found, so Skills Bridge was not asked.")
    reason: Literal["no_terms", "too_many_terms", "term_too_long"] | None = Field(
        default=None, description="Why nothing was searched: no terms, more than 25 terms (or 10 occupation "
                                  "titles), or a term longer than 80 characters.")
    terms: list[str] = Field(description="The terms extracted from the text, for \"We searched for: ...\".")
    occupation_terms: list[str] = Field(description="Terms treated as target occupations (title lookup).")
    skill_terms: list[str] = Field(description="Terms treated as capabilities (skill matching).")
    unmatched: list[str] = []
    resolution: list[SkillsBridgeTermResolution] = []
    occupations: list[SkillsBridgeOccupationMatch] = []
    qualifications: list[SkillsBridgeQualificationMatch] = []


# The answer of /occupations/{id}: what SkillsBridgeMCPClient keeps of a Skills Bridge answer, with where and when
# it came from. Unlike /explore, it passes records on as Skills Bridge sent them rather than skipping incomplete
# ones, so every field of a record is optional. The route leaves out keys an answer didn't have
# (response_model_exclude_unset) rather than adding them, so lists use default_factory: a schema default would make
# the generated TypeScript type promise the key.


class SkillsBridgeLookup(BaseModel):
    source: str
    source_url: str
    retrieved_at: str = Field(description="When Skills Bridge answered; kept by cached answers.")


class SkillsBridgeOccupationSummary(BaseModel):
    occupation_id: int | None = None
    title: str | None = None
    sector: str | None = None


class SkillsBridgeStandard(BaseModel):
    """A current (promulgated) qualification for the occupation."""
    code: str | None = None
    title: str | None = None
    level_label: str | None = None
    status: str | None = None
    review_due_at: str | None = None


class SkillsBridgeOccupationProfile(BaseModel):
    occupation: SkillsBridgeOccupationSummary | None = Field(
        default=None, description="Missing when Skills Bridge has no occupation with this id.")
    standards: list[SkillsBridgeStandard] = Field(default_factory=list)


class SkillsBridgeSkill(BaseModel):
    skill_id: int | None = None
    name: str | None = None
    type: str | None = None


class SkillsBridgeBenchmark(BaseModel):
    """An international occupation Skills Bridge maps this one to. Not a certification equivalency."""
    title: str | None = None
    status: str | None = None
    source: str | None = None
    standard: str | None = None
    sample_skills: list[str] = Field(default_factory=list)


class SkillsBridgeOccupationDetails(BaseModel):
    profile: SkillsBridgeOccupationProfile
    skills: list[SkillsBridgeSkill] = Field(default_factory=list, description="Up to 50 linked skills, by graph weight.")
    benchmarks: list[SkillsBridgeBenchmark] = Field(default_factory=list)
    warnings: list[str] = Field(description="Parts that couldn't be loaded. These answers aren't cached, so asking "
                                            "again retries them.")


class SkillsBridgeOccupationDetailsResponse(SkillsBridgeLookup):
    data: SkillsBridgeOccupationDetails
