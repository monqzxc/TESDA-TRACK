"""Why a Demand result was put first for a signed-in learner: the fit their Skill Passport shows."""
from typing import Literal

from pydantic import BaseModel, Field

FitReasonKind = Literal["skill", "experience", "unit", "sector", "held", "renew"]


class FitReason(BaseModel):
    """One line of "because": the learner's own words or records that point to this result.

    skill        a skill they listed ("cooking")
    experience   a job they have done ("kitchen helper")
    unit         a CORE unit of competency on one of their certificates, with that certificate's qualification
    sector       the same sector as a qualification they hold or held
    held         they hold this qualification today (on a job: the job is linked to it)
    renew        they held it, but the certificate has expired
    """
    kind: FitReasonKind
    terms: list[str] = Field(default_factory=list, max_length=3)
    qualification: str | None = Field(default=None, description="A qualification they hold or held, by name")
    sector: str | None = None


class CompetencyCoverage(BaseModel):
    """The qualification's CORE units, split by whether a certificate on the Skill Passport shows each."""
    covered: list[str] = Field(description="CORE units a certificate on the profile shows, by the catalog's name")
    missing: list[str] = Field(description="CORE units no certificate shows")
    expired: list[str] = Field(default_factory=list, description="Covered units shown only by expired certificates")
    share: float = Field(ge=0, le=1, description="covered / (covered + missing)")


NextStep = Literal["held", "renew", "assessment", "gap_training", "training"]


class PersonalFit(BaseModel):
    score: int = Field(ge=0, le=100, description="How well the Skill Passport fits: not an assessment")
    status: Literal["held", "renew"] | None = None
    reasons: list[FitReason] = Field(default_factory=list)
    coverage: CompetencyCoverage | None = Field(default=None, description=(
        "Present when a certificate on the profile shows at least one of the qualification's CORE units."))
    next_step: NextStep = Field(default="training", description=(
        "held: certified today. renew: certificate expired, take the assessment again. assessment: 70% or more of "
        "the CORE units shown. gap_training: 30% or more, so train for the missing units (COC per cluster), then "
        "assess. training: the full program. Self-declared skills never count toward coverage."))


class QualificationFit(BaseModel):
    """The signed-in learner's fit for one qualification, for the Explore view's next step."""
    qualification_code: str
    fit: PersonalFit | None = Field(default=None, description="None when nothing on the profile points to it")
