from typing import Annotated

from fastapi import APIRouter, Depends, Response

from tesda_track.config import Settings, get_settings
from tesda_track.schemas.meta import ClientConfig

router = APIRouter(tags=["meta"])
SettingsDep = Annotated[Settings, Depends(get_settings)]

# Settings change only when the API restarts, so browsers and Caddy may reuse the answer for a few minutes.
CACHE_CONTROL = "public, max-age=300"


@router.get("/client-config", response_model=ClientConfig)
def client_config(response: Response, settings: SettingsDep):
    """The map key, and which optional services this deployment has turned on. No sign-in needed."""
    response.headers["Cache-Control"] = CACHE_CONTROL
    # The CARTO and MapTiler keys are public by design: the browser sends them with every map tile request, which is
    # why .env.example says to restrict them to the deployment's domain. Handing them out here reveals nothing new.
    return ClientConfig(carto_key=settings.carto_api.strip(),
                        routing_enabled=bool(settings.routing_url.strip()),
                        skills_bridge_enabled=settings.skills_bridge_mcp_enabled,
                        tsp_sign_in=settings.tsp_sign_in_enabled,
                        tsp_mock=settings.tsp_sign_in_enabled and settings.tsp_mock_enabled,
                        tsp_suggestions=settings.tsp_suggestions_enabled,
                        map_engine=settings.map_engine,
                        maptiler_key=settings.maptiler_key,
                        map_tiles_url=settings.map_tiles_url,
                        map_3d=settings.map_3d_enabled)
