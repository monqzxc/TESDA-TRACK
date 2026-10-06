from fastapi import APIRouter

from tesda_track.db import SessionDep
from tesda_track.deps import OptionalLearner
from tesda_track.schemas.ranking import TrainingRanking, TrainingRankingRequest
from tesda_track.services import ranking
from tesda_track.services.embeddings import EmbedderDep

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/training", response_model=TrainingRanking)
def rank_training(request: TrainingRankingRequest, session: SessionDep, embedder: EmbedderDep,
                  learner: OptionalLearner):
    """Training programs for a qualification, ranked by the weighted score with each component shown.

    Works without signing in; a signed-in learner's rankings are linked to their account in the audit trail.
    """
    result = ranking.rank_programs(session, request, embedder, learner)
    session.commit()
    return result
