"""Training and assessment centers: joins API sites with their listings, then filters, measures and sorts them.

Plain functions without Streamlit, so the finder's rules are tested directly.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from math import asin, cos, isfinite, radians, sin, sqrt
from statistics import fmean

TRAINING, ASSESSMENT = "training", "assessment"
KIND_LABELS = {TRAINING: "Training center", ASSESSMENT: "Assessment center"}
PHILIPPINE_TIME = timezone(timedelta(hours=8))
_EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class Filters:
    """What the learner asked for. Empty values mean "any"."""
    kinds: tuple[str, ...] = ()
    region_code: str | None = None
    province: str | None = None
    text: str = ""
    qualification_codes: tuple[str, ...] = ()
    delivery_mode: str | None = None
    within_days: int | None = None
    scholarship: bool = False


def _coordinate(value, limit: float) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) and -limit <= number <= limit else None


def _center(kind: str, site: dict, regions: dict) -> dict:
    latitude, longitude = _coordinate(site.get("latitude"), 90), _coordinate(site.get("longitude"), 180)
    if latitude is None or longitude is None:
        latitude = longitude = None
    region_code = site.get("region_code")
    return {"id": f"{kind}-{site['id']}", "kind": kind, "site_id": site["id"], "name": site["name"],
            "region_code": region_code, "region": regions.get(region_code, {}).get("name", region_code or ""),
            "province": site.get("province"), "city": site.get("city"), "address": site.get("address"),
            "latitude": latitude, "longitude": longitude, "email": site.get("contact_email"),
            "phone": site.get("contact_phone"), "website": site.get("website"),
            "programs": [], "schedules": [], "distance_km": None}


def build_centers(providers: list[dict], assessment_centers: list[dict], programs: list[dict],
                  schedules: list[dict], regions: dict) -> list[dict]:
    """One center per site, each holding its own programs or assessment schedules."""
    centers = {}
    for kind, sites in ((TRAINING, providers), (ASSESSMENT, assessment_centers)):
        for site in sites:
            centers[f"{kind}-{site['id']}"] = _center(kind, site, regions)
    for kind, listings, site_field, bucket in ((TRAINING, programs, "provider", "programs"),
                                               (ASSESSMENT, schedules, "center", "schedules")):
        for listing in listings:
            site = listing[site_field]
            # The site list and the listings are fetched separately, so a listing can name a site the list missed.
            center = centers.setdefault(f"{kind}-{site['id']}", _center(kind, site, regions))
            center[bucket].append(listing)
    return list(centers.values())


def place_label(center: dict) -> str:
    """City, then province (or region when the province is unknown)."""
    city, broader = center.get("city"), center.get("province") or center.get("region")
    if city and broader and broader.casefold() not in (part.strip().casefold() for part in city.split(",")):
        return f"{city}, {broader}"
    return city or broader or ""


def distance_km(origin: dict, destination: dict) -> float:
    """Great-circle distance between two points with latitude and longitude."""
    lat1, lon1, lat2, lon2 = map(radians, (origin["latitude"], origin["longitude"],
                                           destination["latitude"], destination["longitude"]))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * asin(sqrt(a))


def with_distances(centers: list[dict], reference: dict | None) -> list[dict]:
    return [{**center, "distance_km": distance_km(reference, center)
             if reference and center["latitude"] is not None else None} for center in centers]


def _key(text: str) -> str:
    return " ".join(text.casefold().replace(",", " ").split())


def _places(centers: list[dict], regions: dict) -> list[dict]:
    """Every place name the finder knows, with a point for it. Lower rank is more specific."""
    points: dict[tuple[int, str], list[tuple[float, float]]] = {}
    for center in centers:
        if center["latitude"] is None:
            continue
        for rank, label in ((0, center.get("city")), (1, center.get("province"))):
            if label:
                points.setdefault((rank, label), []).append((center["latitude"], center["longitude"]))
    places = [{"rank": rank, "label": label, "names": {_key(label)},
               "latitude": fmean(point[0] for point in spots), "longitude": fmean(point[1] for point in spots)}
              for (rank, label), spots in points.items()]
    for region in regions.values():
        places.append({"rank": 2, "label": region["name"], "latitude": region["latitude"],
                       "longitude": region["longitude"],
                       "names": {_key(region["name"]), _key(region["code"]), _key(f"Region {region['code']}")}})
        if region.get("center_city"):
            places.append({"rank": 3, "label": region["center_city"], "names": {_key(region["center_city"])},
                           "latitude": region["latitude"], "longitude": region["longitude"]})
    return places


def find_place(text: str, centers: list[dict], regions: dict) -> dict | None:
    """Resolve a typed city, province or region to a point, without any outside geocoding service."""
    wanted = _key(text or "")
    if not wanted:
        return None
    places = _places(centers, regions)
    exact = [place for place in places if wanted in place["names"]]
    if exact:
        best = min(exact, key=lambda place: place["rank"])
    else:
        if len(wanted) < 3:
            return None
        partial = [place for place in places if any(wanted in name for name in place["names"])]
        if not partial:
            return None
        best = min(partial, key=lambda place: (not any(name.startswith(wanted) for name in place["names"]),
                                               len(place["label"]), place["rank"]))
    return {"label": best["label"], "latitude": best["latitude"], "longitude": best["longitude"]}


def _local_date(timestamp: str) -> date:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(PHILIPPINE_TIME).date()


def _start(program: dict) -> date | None:
    return date.fromisoformat(program["start_date"]) if program.get("start_date") else None


def _program_matches(program: dict, filters: Filters, today: date, last_day: date | None) -> bool:
    start = _start(program)
    return ((not filters.qualification_codes or program["qualification"]["code"] in filters.qualification_codes)
            and (not filters.delivery_mode or program["delivery_mode"] == filters.delivery_mode)
            and (not filters.scholarship or program["scholarship_available"])
            # A program without a start date takes learners any time.
            and (last_day is None or start is None or today <= start <= last_day))


def _schedule_matches(schedule: dict, filters: Filters, today: date, last_day: date | None) -> bool:
    return ((not filters.qualification_codes or schedule["qualification"]["code"] in filters.qualification_codes)
            and (last_day is None or today <= _local_date(schedule["scheduled_at"]) <= last_day))


def filter_centers(centers: list[dict], filters: Filters, today: date) -> list[dict]:
    """Centers that match, each narrowed to the listings that match. The input is left unchanged."""
    words = _key(filters.text).split()
    last_day = today + timedelta(days=filters.within_days) if filters.within_days else None
    narrows_programs = bool(filters.qualification_codes or filters.delivery_mode or filters.scholarship or last_day)
    narrows_schedules = bool(filters.qualification_codes or last_day)
    kept = []
    for center in centers:
        if ((filters.kinds and center["kind"] not in filters.kinds)
                or (filters.region_code and center["region_code"] != filters.region_code)
                or (filters.province and center.get("province") != filters.province)):
            continue
        if words:
            # A center is found by where it is or by what it offers.
            offered = [text for listing in center["programs"] + center["schedules"]
                       for text in (listing.get("title"), listing["qualification"]["name"])]
            haystack = _key(" ".join(filter(None, (center["name"], place_label(center), center["region"],
                                                   center.get("address"), *offered))))
            if not all(word in haystack for word in words):
                continue
        if center["kind"] == TRAINING and narrows_programs:
            programs = [item for item in center["programs"] if _program_matches(item, filters, today, last_day)]
            if programs:
                kept.append({**center, "programs": programs})
        elif center["kind"] == ASSESSMENT and narrows_schedules:
            schedules = [item for item in center["schedules"] if _schedule_matches(item, filters, today, last_day)]
            if schedules:
                kept.append({**center, "schedules": schedules})
        else:
            kept.append(center)
    return kept


def next_date(center: dict, today: date) -> date | None:
    """The next programme start or assessment day, in Philippine time."""
    dates = [start for start in map(_start, center["programs"]) if start and start >= today]
    dates += [day for day in (_local_date(item["scheduled_at"]) for item in center["schedules"]) if day >= today]
    return min(dates, default=None)


def sort_centers(centers: list[dict], order: str, today: date) -> list[dict]:
    if order == "nearest":
        return sorted(centers, key=lambda center: (center["distance_km"] is None, center["distance_km"] or 0,
                                                   center["name"].casefold()))
    if order == "soonest":
        upcoming = {center["id"]: next_date(center, today) for center in centers}
        return sorted(centers, key=lambda center: (upcoming[center["id"]] is None, upcoming[center["id"]] or today,
                                                   center["name"].casefold()))
    return sorted(centers, key=lambda center: center["name"].casefold())


def friendly_day(day: date, today: date) -> str:
    return f"{day:%b} {day.day}" + (f", {day.year}" if day.year != today.year else "")


def _counted(count: int, noun: str) -> str:
    return f"{count} {noun}{'' if count == 1 else 's'}"


def summary(center: dict, today: date) -> str:
    """One line on what a center offers next, for result cards and map popups."""
    upcoming = next_date(center, today)
    if center["kind"] == TRAINING:
        if not center["programs"]:
            return "No programs listed yet"
        head = _counted(len(center["programs"]), "program")
        if upcoming:
            return f"{head} · Next batch {friendly_day(upcoming, today)}"
        return f"{head} · Flexible start" if any(not item.get("start_date") for item in center["programs"]) else head
    if not center["schedules"]:
        return "No upcoming assessments yet"
    head = _counted(len(center["schedules"]), "upcoming assessment")
    return f"{head} · Next {friendly_day(upcoming, today)}" if upcoming else head


def map_points(centers: list[dict], today: date) -> list[dict]:
    """What the map needs to pin a center and fill its popup; centers without coordinates are left off."""
    return [{"id": center["id"], "kind": center["kind"], "name": center["name"], "place": place_label(center),
             "region": center["region"], "latitude": center["latitude"], "longitude": center["longitude"],
             "distance_km": None if center["distance_km"] is None else round(center["distance_km"], 1),
             "summary": summary(center, today), "address": center.get("address"), "phone": center.get("phone"),
             "email": center.get("email")}
            for center in centers if center["latitude"] is not None]


def provinces(centers: list[dict], region_code: str | None = None) -> list[str]:
    return sorted({center["province"] for center in centers
                   if center.get("province") and (region_code is None or center["region_code"] == region_code)},
                  key=str.casefold)
