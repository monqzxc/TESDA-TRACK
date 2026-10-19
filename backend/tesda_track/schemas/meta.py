"""Deployment settings the browser app reads when it starts, so one build of web/ runs in every deployment."""
from pydantic import BaseModel, Field


class ClientConfig(BaseModel):
    carto_key: str = Field(description="CARTO basemaps key for the center map. Empty: use OpenStreetMap tiles.")
    routing_enabled: bool = Field(description="Whether GET /api/v1/routes gives directions. False: link to Google "
                                              "Maps instead.")
    skills_bridge_enabled: bool = Field(description="Whether the Skills Bridge lookups behind Skills Explorer are "
                                                    "turned on.")
