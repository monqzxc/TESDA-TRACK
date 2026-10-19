"""What the MCP tools return. The SDK publishes each as the tool's outputSchema."""
from pydantic import BaseModel, Field

from tesda_track.schemas.catalog import CompetencyPublic, QualificationSummary
from tesda_track.schemas.delivery import TrainingProgramPublic
from tesda_track.schemas.reports import RegionSupply


class LevelRef(BaseModel):
    code: str
    name: str
    level: int = Field(description="The NC level: 1 for NC I up to 4 for NC IV.")


class QualificationDetail(BaseModel):
    qualification: QualificationSummary
    possible_jobs: list[str]
    competencies: list[CompetencyPublic]
    other_levels: list[LevelRef] = Field(
        description="Every active level of the same trade, this one included, lowest first; empty when it has no NC level.")


class ProgramPage(BaseModel):
    programs: list[TrainingProgramPublic]
    next_offset: int | None = Field(description="The offset of the next page; null when this page is the last.")


class RegionalSupply(BaseModel):
    regions: list[RegionSupply]
