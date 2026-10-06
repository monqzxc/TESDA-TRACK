import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from tesda_track.models import ENROLLMENT_STATUSES, ROUTES, STEP_KINDS, STEP_STATUSES
from tesda_track.schemas.catalog import QualificationSummary

StepKind = Literal[STEP_KINDS]
StepStatus = Literal[STEP_STATUSES]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class PathwayStepPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    kind: StepKind
    title: str
    description: str


class PathwayPublic(BaseModel):
    id: int
    qualification: QualificationSummary
    route: Literal[ROUTES]
    title: str
    description: str
    steps: list[PathwayStepPublic]


class PathwayStepInput(BaseModel):
    id: int | None = Field(default=None, description="Keep an existing step (and learners' progress on it)")
    kind: StepKind
    title: Title
    description: Description = ""


class PathwayCreate(BaseModel):
    qualification_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    route: Literal[ROUTES]
    title: Title
    description: Description = ""
    steps: list[PathwayStepInput] = Field(min_length=1, max_length=30)


class PathwayUpdate(BaseModel):
    """Omitted fields keep their value; `steps`, when given, replaces the list in the given order."""
    title: Title | None = None
    description: Description | None = None
    is_active: bool | None = None
    steps: list[PathwayStepInput] | None = Field(default=None, min_length=1, max_length=30)


class EnrollmentCreate(BaseModel):
    pathway_id: int


class EnrollmentUpdate(BaseModel):
    status: Literal["active", "withdrawn"]


class StepProgressUpdate(BaseModel):
    status: StepStatus


class StepWithStatus(PathwayStepPublic):
    status: StepStatus


class EnrollmentPublic(BaseModel):
    id: uuid.UUID
    pathway: PathwayPublic
    status: Literal[ENROLLMENT_STATUSES]
    completion_percent: int
    steps: list[StepWithStatus]
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
