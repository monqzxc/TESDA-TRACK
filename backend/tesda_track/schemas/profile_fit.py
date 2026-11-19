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


class PersonalFit(BaseModel):
    score: int = Field(ge=0, le=100, description="How well the Skill Passport fits: not an assessment")
    status: Literal["held", "renew"] | None = None
    reasons: list[FitReason] = Field(default_factory=list)
