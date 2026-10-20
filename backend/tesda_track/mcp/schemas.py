"""What the MCP tools return. The SDK publishes each as the tool's outputSchema."""
from datetime import date

from pydantic import BaseModel, Field, create_model

from tesda_track.schemas.analysis import Match, Profile, Route
from tesda_track.schemas.assessment_ranking import AssessmentRanking, RankedAssessment
from tesda_track.schemas.catalog import CompetencyPublic, QualificationSummary
from tesda_track.schemas.delivery import TrainingProgramPublic
from tesda_track.schemas.pathways import PathwayPublic
from tesda_track.schemas.ranking import TrainingRanking
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


class MatchOutput(BaseModel):
    interpreted: Profile = Field(description="What the service understood about the learner, from the goal and answers.")
    matches: list[Match]


class RouteOutput(BaseModel):
    route: Route
    reason: str
    next_step: str
    pathway: PathwayPublic | None = Field(description="Curated steps for this route, when defined.")


def _without(model: type[BaseModel], name: str, drop: set[str], **replace) -> type[BaseModel]:
    """The service model less some fields, so the tool's output follows the service schema."""
    fields = {key: (replace.get(key, field.annotation), field) for key, field in model.model_fields.items()
              if key not in drop}
    return create_model(name, __doc__=model.__doc__, **fields)


# The audit id is for the operator's usage log, not the partner; a partner cannot read an audit back.
TrainingRankingOutput = _without(TrainingRanking, "TrainingRankingOutput", {"audit_id"})
RankedAssessmentOutput = _without(RankedAssessment, "RankedAssessmentOutput", {"application_status"})
AssessmentRankingOutput = _without(AssessmentRanking, "AssessmentRankingOutput", {"audit_id"},
                                   results=list[RankedAssessmentOutput])


class DemandRow(BaseModel):
    qualification: QualificationSummary
    top_match: int | None = Field(description="Times it was the best match for a learner's goal.")
    chosen: int | None = Field(description="Times a learner chose it.")
    readiness_checks: int | None = Field(description="Readiness checks taken for it.")
    average_readiness: float | None = Field(
        description="Average readiness score, 0-100; null when fewer than 5 checks were taken.")
    assessment_applications: int | None
    competent: int | None = Field(description="Assessment applications that ended competent.")
    certified: int | None = Field(description="Verified certificates earned.")
    hidden: list[str] = Field(description="Fields set to null because the count was between 1 and 4.")


class DemandOutput(BaseModel):
    quarter: str
    date_from: date
    date_to: date
    rows: list[DemandRow] = Field(description="Qualifications with activity in the quarter; others are left out.")
