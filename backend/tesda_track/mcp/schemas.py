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
    """Distinct learners, never events. A count of 1 to 4 is null and named in hidden; 0 stays 0."""
    qualification: QualificationSummary
    learners_top_matched: int | None = Field(description="Learners whose best match was this qualification.")
    learners_chose: int | None = Field(description="Learners who chose it.")
    learners_checked_readiness: int | None = Field(description="Learners who checked their readiness for it.")
    average_readiness: float | None = Field(
        description="Average of each learner's latest readiness score, 0-100; null when fewer than 5 learners "
                    "checked readiness.")
    learners_applied: int | None = Field(description="Learners who applied for an assessment.")
    learners_competent: int | None = Field(description="Learners assessed competent.")
    learners_certified: int | None = Field(description="Learners with a verified certificate.")
    hidden: list[str] = Field(description="Names of the fields set to null because 1 to 4 learners were counted.")


class DemandOutput(BaseModel):
    quarter: str
    date_from: date
    date_to: date
    rows: list[DemandRow] = Field(description="Qualifications with learner activity in the quarter; others are left out.")
