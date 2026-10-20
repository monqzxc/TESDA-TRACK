import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
    reason: FeedbackReason


class FeedbackPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    satisfied: bool
    reason: FeedbackReason | None
