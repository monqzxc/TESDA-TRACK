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
    # The CARTO key is public by design: the browser sends it with every map tile request, which is why
    # .env.example says to restrict it to the deployment's domain in CARTO. Handing it out here reveals nothing new.
    return ClientConfig(carto_key=settings.carto_api.strip(),
                        routing_enabled=bool(settings.routing_url.strip()),
                        skills_bridge_enabled=settings.skills_bridge_mcp_enabled)
