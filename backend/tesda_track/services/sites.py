"""Shared rules for places with an address: training providers and assessment centers."""
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Region
from tesda_track.schemas.delivery import check_location

REQUIRED_FIELDS = {"name", "region_code", "is_active"}


def regions(session: Session) -> list[Region]:
    return list(session.exec(select(Region).order_by(Region.position)))


def require_region(session: Session, code: str) -> None:
    if session.get(Region, code) is None:
        raise InvalidRequestError(f"Region '{code}' was not found.")


def apply_update(session: Session, site, request) -> None:
    """PATCH semantics: omitted fields stay; null clears optional fields; the location stays complete."""
    fields = request.model_fields_set
    if request.region_code is not None and "region_code" in fields:
        require_region(session, request.region_code)
    latitude = request.latitude if "latitude" in fields else site.latitude
    longitude = request.longitude if "longitude" in fields else site.longitude
    try:
        check_location(latitude, longitude)
    except ValueError as error:
        raise InvalidRequestError(str(error)) from None
    for field in fields:
        value = getattr(request, field)
        if value is None and field in REQUIRED_FIELDS:
            continue
        setattr(site, field, value)
    session.flush()
