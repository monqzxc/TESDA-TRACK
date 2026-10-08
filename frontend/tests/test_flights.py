"""Estimated flights for the center finder: nearest airports, when a flight is offered, and its time.

Run with:
    .venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_flights.py
"""
import pytest

from flights import GROUND_MINUTES, airport_label, airports, flight, flight_minutes

ILOILO = {"iata": "ILO", "name": "Iloilo International Airport", "latitude": 10.83302, "longitude": 122.49305}
MANILA = {"iata": "MNL", "name": "Ninoy Aquino International Airport", "latitude": 14.5086, "longitude": 121.01944}
CLARK = {"iata": "CRK", "name": "Clark International Airport", "latitude": 15.18598, "longitude": 120.55998}
AIRPORTS = (ILOILO, MANILA, CLARK)
ILOILO_CITY = {"latitude": 10.72, "longitude": 122.56}
MAKATI = {"latitude": 14.55, "longitude": 121.02}
MANILA_CENTER = {"latitude": 14.5995, "longitude": 120.9842}


def test_a_long_trip_flies_between_the_airports_nearest_each_end():
    trip = flight(ILOILO_CITY, MANILA_CENTER, AIRPORTS)
    assert (trip["departure"]["iata"], trip["arrival"]["iata"]) == ("ILO", "MNL")
    assert trip["distance_km"] == pytest.approx(450, abs=15)
    assert trip["duration_min"] == pytest.approx(flight_minutes(trip["distance_km"]))
    assert trip["to_departure_km"] < 20 and trip["from_arrival_km"] < 15
    assert (trip["start"], trip["end"]) == ([10.83302, 122.49305], [14.5086, 121.01944]), "the path runs airport to airport"


def test_a_short_trip_is_not_flown():
    assert flight(MAKATI, MANILA_CENTER, AIRPORTS) is None


def test_two_ends_served_by_airports_too_close_together_are_not_flown():
    tarlac = {"latitude": 15.4755, "longitude": 120.5963}
    assert flight(tarlac, {"latitude": 12.0, "longitude": 121.0}, (CLARK, MANILA)) is None, \
        "Clark and Manila are about 90 km apart: the road is the way"


def test_flight_time_adds_ground_time_to_the_time_in_the_air():
    assert flight_minutes(0) == GROUND_MINUTES
    assert flight_minutes(650) == pytest.approx(GROUND_MINUTES + 60)


def test_the_path_bends_away_from_the_straight_line():
    path = flight(ILOILO_CITY, MANILA_CENTER, AIRPORTS)["path"]
    middle = path[len(path) // 2]
    straight = [(ILOILO["latitude"] + MANILA["latitude"]) / 2, (ILOILO["longitude"] + MANILA["longitude"]) / 2]
    assert abs(middle[0] - straight[0]) + abs(middle[1] - straight[1]) > 0.3


def test_the_bundled_airports_include_the_main_hubs():
    codes = {airport["iata"] for airport in airports()}
    assert {"MNL", "CEB", "DVO", "ILO", "CRK"} <= codes
    assert all(airport["latitude"] and airport["longitude"] for airport in airports())


def test_airports_are_named_with_their_code():
    assert airport_label(ILOILO) == "Iloilo International Airport (ILO)"
