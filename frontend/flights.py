"""Estimated flights for the center finder's Directions, from the airport nearest the learner to the airport nearest
the center.

No airline schedules are used: whether a flight runs between the two airports, and when, is for the learner to check
with the airlines. The time is an estimate from the distance between the airports.
"""
from __future__ import annotations

import json
from functools import cache
from pathlib import Path

from centers import distance_km

AIRPORTS_FILE = Path(__file__).with_name("data") / "airports_ph.json"
MIN_TRIP_KM = 250  # nearer than this, the road is faster than getting to an airport and checking in
MIN_FLIGHT_KM = 150  # airports closer than this have no sensible flight between them
GROUND_MINUTES = 30  # taxiing, climbing and descending
CRUISE_KMH = 650  # what domestic jets and turboprops average between airports


@cache
def airports() -> tuple[dict, ...]:
    """Philippine airports with scheduled passenger flights."""
    return tuple(json.loads(AIRPORTS_FILE.read_text(encoding="utf-8"))["airports"])


def flight_minutes(kilometres: float) -> float:
    return GROUND_MINUTES + kilometres / CRUISE_KMH * 60


def _arc(start: dict, end: dict, steps: int = 32) -> list[list[float]]:
    """A gentle curve between two airports, as flight paths are drawn: a quadratic curve through a point beside the
    straight line's middle, a sixth of its length off to one side."""
    (lat1, lon1), (lat2, lon2) = (start["latitude"], start["longitude"]), (end["latitude"], end["longitude"])
    bend_lat, bend_lon = (lat1 + lat2) / 2 + (lon2 - lon1) / 6, (lon1 + lon2) / 2 - (lat2 - lat1) / 6
    return [[round((1 - t) ** 2 * lat1 + 2 * (1 - t) * t * bend_lat + t ** 2 * lat2, 5),
             round((1 - t) ** 2 * lon1 + 2 * (1 - t) * t * bend_lon + t ** 2 * lon2, 5)]
            for t in (step / steps for step in range(steps + 1))]


def flight(origin: dict, destination: dict, choices: tuple[dict, ...] | None = None) -> dict | None:
    """An estimated flight between the airports nearest each end, or None when the trip is too short to fly.

    Shaped like a road route (path, start, end, distance and minutes), plus both airports and how far each end is
    from its airport in a straight line.
    """
    choices = airports() if choices is None else choices
    if not choices or distance_km(origin, destination) < MIN_TRIP_KM:
        return None
    departure = min(choices, key=lambda airport: distance_km(origin, airport))
    arrival = min(choices, key=lambda airport: distance_km(destination, airport))
    kilometres = distance_km(departure, arrival)
    if departure is arrival or kilometres < MIN_FLIGHT_KM:
        return None
    path = _arc(departure, arrival)
    return {"path": path, "start": path[0], "end": path[-1], "distance_km": kilometres,
            "duration_min": flight_minutes(kilometres), "departure": departure, "arrival": arrival,
            "to_departure_km": distance_km(origin, departure), "from_arrival_km": distance_km(arrival, destination)}


def airport_label(airport: dict) -> str:
    """"Iloilo International Airport (ILO)". The name, not the town: some airports sit outside the city they serve."""
    return f"{airport['name']} ({airport['iata']})"
