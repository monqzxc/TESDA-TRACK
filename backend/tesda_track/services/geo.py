"""PostGIS distance helpers over the plain latitude/longitude columns of providers and centers."""
from sqlalchemy import func

from tesda_track.schemas.delivery import NearbySearch, SiteSearch


def point(model):
    """Must stay identical to the *_location_gist index expression in migration 0003 so the index is used."""
    return func.geography(func.ST_SetSRID(func.ST_MakePoint(model.longitude, model.latitude), 4326))


def _reference(search: NearbySearch | SiteSearch):
    return point_at(search.near_lat, search.near_lon)


def distance_km(model, search: NearbySearch | SiteSearch):
    return func.ST_Distance(point(model), _reference(search)) / 1000.0


def within_radius(model, search: NearbySearch | SiteSearch):
    return func.ST_DWithin(point(model), _reference(search), search.radius_km * 1000.0)


def point_at(latitude: float, longitude: float):
    return func.geography(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326))
