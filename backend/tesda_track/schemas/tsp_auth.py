from typing import Literal

from pydantic import BaseModel, Field


class TspSessionRequest(BaseModel):
    code: str = Field(min_length=1, max_length=4096, description="The one-time handoff code TSP gave the page.")


class TspConsentRequest(BaseModel):
    pending_id: str = Field(min_length=1, max_length=64)
    accept: bool = Field(description="True creates the linked account; false forgets the profile.")


class TspConsentSummary(BaseModel):
    name: str = Field(description="The learner's name from TSP. Learner text: render it as text.")
    keeps: list[Literal["skills", "experience", "education", "qualifications", "certificates", "location"]] = Field(
        description="What TESDA-TRACK will keep from the TSP profile.")


class TspConsentRequired(BaseModel):
    """A first sign-in: the learner consents (POST /api/v1/auth/tsp/consent) before an account is created."""
    consent_required: Literal[True] = True
    pending_id: str = Field(description="Valid for 10 minutes.")
    summary: TspConsentSummary
