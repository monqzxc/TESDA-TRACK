from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path

from tesda_track.config import Settings, get_settings
from tesda_track.schemas.skills_bridge import SkillsBridgeMatchRequest, SkillsBridgeOccupationSearchRequest
from tesda_track.services.skills_bridge_mcp import SkillsBridgeMCPClient, SkillsBridgeMCPError

router = APIRouter(prefix="/skills-bridge", tags=["skills bridge"])


def bridge_client(settings: Annotated[Settings, Depends(get_settings)]):
    return SkillsBridgeMCPClient(settings)


def _response(data: dict) -> dict:
    return {"source": "Skills Bridge", "source_url": "https://skills-bridge.ph",
            "retrieved_at": datetime.now(timezone.utc).isoformat(), "data": data}


@router.post("/matches")
def match_skills(body: SkillsBridgeMatchRequest, client: Annotated[SkillsBridgeMCPClient, Depends(bridge_client)]):
    """Read external matches for explicitly supplied skill terms. No learner records are forwarded or saved."""
    try:
        with client:
            return _response(client.match_skills(body.skills, body.limit))
    except SkillsBridgeMCPError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/occupations/search")
def search_occupations(body: SkillsBridgeOccupationSearchRequest,
                       client: Annotated[SkillsBridgeMCPClient, Depends(bridge_client)]):
    """Find occupations by title; capability terms continue through ``/matches``."""
    try:
        with client:
            return _response(client.search_occupations(body.occupations, body.limit))
    except SkillsBridgeMCPError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/occupations/{occupation_id}")
def occupation_details(occupation_id: Annotated[int, Path(ge=1, le=2_147_483_647)],
                       client: Annotated[SkillsBridgeMCPClient, Depends(bridge_client)]):
    """Qualifications, a bounded skills preview, and existing benchmark mappings for a public occupation id."""
    try:
        with client:
            return _response(client.occupation(occupation_id))
    except SkillsBridgeMCPError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
