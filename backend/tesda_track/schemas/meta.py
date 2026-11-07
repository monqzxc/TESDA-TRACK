"""Deployment settings the browser app reads when it starts, so one build of frontend/ runs in every deployment."""
from typing import Literal

from pydantic import BaseModel, Field


class ClientConfig(BaseModel):
    carto_key: str = Field(description="CARTO basemaps key for the center map. Empty: use OpenStreetMap tiles.")
    routing_enabled: bool = Field(description="Whether GET /api/v1/routes gives directions. False: link to Google "
                                              "Maps instead.")
    skills_bridge_enabled: bool = Field(description="Whether the Skills Bridge lookups behind Skills Explorer are "
                                                    "turned on.")
    tsp_sign_in: bool = Field(description="Whether /tsp/webview signs learners in through TSP's WebView bridge "
                                          "(POST /api/v1/auth/tsp/session). False: it stays guest-only.")
    tsp_suggestions: bool = Field(default=False, description="Whether /tsp/webview shows qualifications suggested from "
                                  "the TSP profile (POST /api/v1/analysis/suggestions). False: the goal box only.")
    # Defaults, so an app newer than its API reads a missing field as "no vector tiles" and keeps the Leaflet map.
    map_engine: Literal["maplibre", "leaflet"] = Field(
        default="maplibre", description="The center map's renderer. maplibre draws vector tiles when maptiler_key or "
                                        "map_tiles_url is set and the browser has WebGL 2; leaflet keeps the raster map.")
    maptiler_key: str = Field(default="", description="Public MapTiler key for the center map's vector tiles, "
                                                      "restricted to the deployment's domains. Empty: no MapTiler.")
    map_tiles_url: str = Field(default="", description="TileJSON address of an OpenMapTiles-schema vector source, "
                                                       "used instead of MapTiler. Empty: none.")
    map_3d: bool = Field(default=True, description="Whether the center map offers 3D buildings where the tiles record "
                                                   "building heights.")
