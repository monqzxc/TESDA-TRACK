import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from tesda_track.schemas.analysis import AnswerCode, GoalText, Profile

FeedbackReason = Literal["wrong_qualification", "readiness_off", "pathway_not_helpful"]


class FeedbackCreate(BaseModel):
    """The recommendation as the finder asked for it, so the API can work it out again. The goal isn't kept."""
    query: GoalText
    profile: Profile = Field(description="The profile the matches were asked with, follow-up answers included")
    qualification_code: str = Field(max_length=40)
    answers: dict[int, AnswerCode] = Field(max_length=100, description="The readiness answers the result came from")
    satisfied: bool


class FeedbackReasonUpdate(BaseModel):
    """Each update replaces the reason and the wanted qualification given before."""
    reason: FeedbackReason
    wanted_qualification_code: str | None = Field(
        default=None, max_length=40,
        description='With "wrong_qualification" only: the qualification the learner wanted instead')

    @model_validator(mode="after")
    def wanted_only_when_wrong(self) -> "FeedbackReasonUpdate":
        if self.wanted_qualification_code is not None and self.reason != "wrong_qualification":
            raise ValueError("A wanted qualification goes only with the reason wrong_qualification.")
        return self


class FeedbackPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    satisfied: bool
    reason: FeedbackReason | None
    wanted_qualification_code: str | None = None


class SharedGoalCreate(BaseModel):
    """The goal's words, as they were rated, which the learner agreed to share to improve matching."""
    goal: GoalText
    consent: Literal[True] = Field(description="The learner ticked the box agreeing to share them")
