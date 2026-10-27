from fastapi import APIRouter

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, OptionalLearner
from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification, RankingAudit
from tesda_track.schemas.analysis import MatchResult, Profile
from tesda_track.schemas.assessment_ranking import AssessmentRanking, AssessmentRankingRequest
from tesda_track.schemas.pathway_report import PathwayReport, PathwayReportRequest
from tesda_track.schemas.personalization import QualificationRecommendationRequest
from tesda_track.schemas.ranking import RankingAuditPublic, TrainingRanking, TrainingRankingRequest
from tesda_track.services import analysis, assessment_ranking, learner_assessments, pathway_report, ranking
from tesda_track.services.embeddings import EmbedderDep
from tesda_track.services.ownership import get_owned

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/assessments", response_model=AssessmentRanking)
def rank_assessments(request: AssessmentRankingRequest, session: SessionDep, learner: OptionalLearner):
    """Verified, available, eligible schedules with seats; no embedding model is required."""
    result = assessment_ranking.rank(session, request, learner)
    session.commit()
    return result


@router.post("/qualifications", response_model=MatchResult)
def rank_qualifications(request: QualificationRecommendationRequest, session: SessionDep, learner: OptionalLearner):
    """Structured matching works on a CPU without invoking an embedding model or storing guest answers."""
    answers, _ = learner_assessments.resolve(session, learner, request)
    if answers is None:
        raise InvalidRequestError("Supply a learner assessment or its saved ID.")
    profile, matches = analysis.match(session, request.goal or "", Profile(), assessment=answers, limit=request.limit)
    return MatchResult(profile=profile, matches=matches)


@router.post("/training", response_model=TrainingRanking)
def rank_training(request: TrainingRankingRequest, session: SessionDep, embedder: EmbedderDep,
                  learner: OptionalLearner):
    """Training programs for a qualification, ranked by the weighted score with each component shown.

    Works without signing in; a signed-in learner's rankings are linked to their account in the audit trail.
    """
    result = ranking.rank_programs(session, request, embedder, learner)
    session.commit()
    return result


@router.post("/report", response_model=PathwayReport)
def report(request: PathwayReportRequest, session: SessionDep, embedder: EmbedderDep, learner: OptionalLearner):
    """A personalized report on the chosen qualification's pathway: options, units to work on, why, and next steps.

    Worked out again from what the finder sent, as feedback is, with deterministic templates over the matching,
    readiness, the two rankings above (audited as usual; their audit ids are in `rankings`) and, signed in, the
    learner's own records. The goal is neither stored nor repeated; a region only sorts options by distance.
    """
    result = pathway_report.build(session, request, embedder, learner)
    session.commit()
    return result


@router.get("/{audit_id}", response_model=RankingAuditPublic)
def saved_ranking(audit_id: int, session: SessionDep, learner: CurrentLearner):
    """Owned historical scoring evidence, not a current availability or eligibility check."""
    audit = get_owned(session, RankingAudit, audit_id, learner, "Recommendation")
    qualification = session.get(Qualification, audit.qualification_id)
    return RankingAuditPublic(audit_id=audit.id, result_type=audit.preferences.get("service_kind", "training"),
        qualification_code=qualification.code, created_at=audit.created_at, assessment_id=audit.assessment_id,
        near_lat=audit.near_lat, near_lon=audit.near_lon, preferences=audit.preferences,
        weights=audit.weights, results=audit.results)
