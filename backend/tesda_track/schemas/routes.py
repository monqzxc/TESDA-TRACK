"""Directions to a center: road routes for each travel mode, and an estimated flight for long trips."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field

MapPoint = Annotated[list[float], Field(min_length=2, max_length=2, description="[latitude, longitude]")]
RoadMode = Literal["car", "bike", "foot"]


class RoadRoute(BaseModel):
    mode: RoadMode
    path: list[MapPoint] = Field(description="The route as the map draws it, origin to center")
    start: MapPoint = Field(description="Where the roads begin, which can be a little off the learner's location")
    end: MapPoint = Field(description="Where the roads end, near the center")
    distance_km: float
    duration_min: float = Field(description="Without traffic")


class Airport(BaseModel):
    iata: str
    name: str
    municipality: str
    latitude: float
    longitude: float


class FlightEstimate(BaseModel):
    """An estimate from the distance between the airports nearest each end, not an airline schedule."""
    mode: Literal["plane"]
    path: list[MapPoint] = Field(description="A curve from airport to airport, as flight paths are drawn")
    start: MapPoint
    end: MapPoint
    distance_km: float = Field(description="Between the airports, in a straight line")
    duration_min: float = Field(description="In the air, with time for taxiing, climbing and descending")
    departure: Airport
    arrival: Airport
    to_departure_km: float = Field(description="From the learner to the departure airport, in a straight line")
    from_arrival_km: float = Field(description="From the arrival airport to the center, in a straight line")


TravelRoute = Annotated[RoadRoute | FlightEstimate, Field(discriminator="mode")]


class Directions(BaseModel):
    routing_enabled: bool = Field(description="False when this server has no router: link to Google Maps instead")
    routes: list[TravelRoute] = Field(description="Car, bike and foot as the router has them, then a flight for "
                                                  "a long trip. Empty when routing is off.")
    missing_modes: list[RoadMode] = Field(description="Road modes that couldn't be routed this time; asking "
                                                      "again retries them")
