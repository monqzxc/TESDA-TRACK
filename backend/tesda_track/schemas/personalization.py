from pydantic import Field

from tesda_track.schemas.analysis import GoalText
from tesda_track.schemas.learner_assessments import AssessmentReference


class QualificationRecommendationRequest(AssessmentReference):
    goal: GoalText | None = None
    limit: int = Field(default=3, ge=1, le=50)
