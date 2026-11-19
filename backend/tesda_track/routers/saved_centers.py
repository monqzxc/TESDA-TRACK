from fastapi import APIRouter, Response, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.delivery import CenterKey, SavedCenterPublic, SavedCenterSave
from tesda_track.services import saved_centers

router = APIRouter(prefix="/me/saved-centers", tags=["saved centers"])


@router.get("", response_model=list[SavedCenterPublic])
def list_saved_centers(learner: CurrentLearner, session: SessionDep):
    return [saved_centers.to_public(saved) for saved in saved_centers.list_for(session, learner)]


@router.put("/{center_id}", response_model=SavedCenterPublic)
def save_center(center_id: CenterKey, learner: CurrentLearner, session: SessionDep,
                request: SavedCenterSave | None = None):
    saved = saved_centers.save(session, learner, center_id, request or SavedCenterSave())
    session.commit()
    return saved_centers.to_public(saved)


@router.delete("/{center_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_center(center_id: CenterKey, learner: CurrentLearner, session: SessionDep):
    saved_centers.remove(session, learner, center_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
