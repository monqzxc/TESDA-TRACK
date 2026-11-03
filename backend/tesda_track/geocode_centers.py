"""Move training providers and assessment centers to where Google geocodes their address.

Some registry coordinates are typing mistakes that put a center in the sea or in another town. This looks
each site's address up with the Google Geocoding API and replaces the stored point when Google's answer lies
in the site's own city or municipality and is specific enough:

- a building or street-address match always replaces the point;
- a barangay match replaces it when the point is missing or more than 1 km away;
- a match on only a road or the town replaces it when the point is missing or more than 5 km away, so a good
  registry point isn't moved to the middle of a highway or the town center;
- province-only matches, matches in another town and points an administrator corrected are left alone.

Preview is the default; --apply writes. The report also keeps Google's answers: running again with the same
--report reuses them, so a preview followed by --apply looks each address up once. Replaced points are marked
location_source = 'google_geocoding', and registry imports keep them.
"""
from __future__ import annotations

import json
import math
import re
import time
import unicodedata
from collections import Counter
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TextIO

import httpx
from sqlmodel import Session, select

from tesda_track.models import AssessmentCenter, TrainingProvider
from tesda_track.registry_import import coordinates

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
SOURCE = "google_geocoding"
MODELS = {"training": TrainingProvider, "assessment": AssessmentCenter}
# How far a point may sit from Google's answer and still be kept, by how precise the answer is.
KEEP_WITHIN_KM = {"exact": 0.0, "barangay": 1.0, "road": 5.0, "town": 5.0}
# Closer than this is the same point (Google's answers wobble by a few metres).
SAME_POINT_KM = 0.01

EXACT_TYPES = {"street_address", "premise", "subpremise", "establishment", "point_of_interest", "intersection",
               "plus_code"}
BARANGAY_TYPES = {"neighborhood", "colloquial_area", "sublocality", "sublocality_level_1", "sublocality_level_2",
                  "sublocality_level_3", "sublocality_level_4", "sublocality_level_5",
                  "administrative_area_level_4", "administrative_area_level_5"}
TOWN_TYPES = {"locality", "administrative_area_level_3"}
FILLER_WORDS = {"city", "of", "municipality", "the"}
ABBREVIATIONS = {"sto": "santo", "sta": "santa", "sn": "san", "gen": "general", "pres": "president",
                 "mt": "mountain", "brgy": "barangay", "bgy": "barangay", "pob": "poblacion"}
OUTCOMES = ("replace", "unchanged", "kept_close", "kept_manual", "other_town", "too_vague", "outside_philippines",
            "not_found", "no_address", "lookup_failed")


class GeocodeStop(Exception):
    """Google refused the key or the quota is used up; nothing further can be looked up."""


@dataclass(frozen=True)
class Site:
    kind: str
    id: int
    name: str
    address: str | None
    city: str | None
    province: str | None
    region_code: str
    latitude: float | None
    longitude: float | None
    location_source: str | None = None

    @classmethod
    def of(cls, kind: str, row) -> Site:
        return cls(kind, row.id, row.name, row.address, row.city, row.province, row.region_code,
                   row.latitude, row.longitude, row.location_source)


@dataclass(frozen=True)
class Decision:
    site: Site
    query: str | None
    outcome: str
    precision: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    moved_km: float | None = None
    google_address: str | None = None
    partial_match: bool = False

    def report(self) -> dict:
        site = self.site
        return {"kind": site.kind, "id": site.id, "name": site.name, "region": site.region_code,
                "query": self.query, "outcome": self.outcome, "precision": self.precision,
                "from": [site.latitude, site.longitude] if site.latitude is not None else None,
                "to": [self.latitude, self.longitude] if self.latitude is not None else None,
                "moved_km": None if self.moved_km is None else round(self.moved_km, 3),
                "google_address": self.google_address, "partial_match": self.partial_match}


def place_words(value: str | None) -> str:
    """Comparable place name: no accents, punctuation, '(Capital)' notes or words like 'City of'."""
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().casefold()
    value = re.sub(r"\(.*?\)", " ", value)
    words = (ABBREVIATIONS.get(word, word) for word in re.findall(r"[a-z0-9]+", value))
    return " ".join(word for word in words if word not in FILLER_WORDS)


def contains(haystack: str, needle: str) -> bool:
    return bool(needle) and f" {needle} " in f" {haystack} "


def province_of(site: Site) -> str:
    # NCR's "provinces" in the registry are district groupings (CaMaNaVa, PaMaMariSan) that Google doesn't know.
    return "" if site.region_code == "NCR" else place_words(site.province)


def query_for(site: Site) -> str | None:
    """The address, then the city and province when the address doesn't already name them."""
    address = re.sub(r"\s+", " ", site.address or "").strip(" ,")
    parts = [address] if address else []
    for extra in (site.city, site.province if province_of(site) else None):
        extra = re.sub(r"\s+", " ", extra or "").strip(" ,")
        if extra and not contains(place_words(", ".join(parts)), place_words(extra)):
            parts.append(extra)
    return ", ".join([*parts, "Philippines"]) if parts else None


def answer_from(payload: dict) -> dict | None:
    """The parts of Google's first result that decide a site: point, precision and place names."""
    if not payload.get("results"):
        return None
    result = payload["results"][0]
    geometry = result.get("geometry", {})
    location = geometry.get("location", {})
    return {"latitude": location.get("lat"), "longitude": location.get("lng"),
            "location_type": geometry.get("location_type"), "types": result.get("types", []),
            "formatted_address": result.get("formatted_address"), "partial_match": bool(result.get("partial_match")),
            "components": [{"name": c.get("long_name"), "types": c.get("types", [])}
                           for c in result.get("address_components", [])]}


def precision_of(answer: dict) -> str:
    types = set(answer.get("types", []))
    if answer.get("location_type") in ("ROOFTOP", "RANGE_INTERPOLATED") or types & EXACT_TYPES:
        return "exact"
    if types & BARANGAY_TYPES:
        return "barangay"
    # A road's point is the middle of its stretch in that town, which can be kilometres from the site.
    if "route" in types:
        return "road"
    if types & TOWN_TYPES:
        return "town"
    return "province"


def in_site_town(site: Site, answer: dict) -> bool:
    """Google placed the address in the site's city or municipality (or province, when the city is unknown).

    The town's name must match Google's town exactly; a looser match (one name inside the other, as with "Island
    Garden City of Samal" and "Samal") also needs the province to match, so "San Jose" never passes for "San Jose
    del Monte". Only town names count: "Cebu City" must not match a Mandaue answer through its province, Cebu.
    """
    components = answer.get("components", [])
    names = [answer.get("formatted_address") or "", *(c.get("name") or "" for c in components)]
    city, province = place_words(site.city), province_of(site)
    in_province = not province or contains(" | ".join(place_words(name) for name in names), province)
    if not city:
        return in_province
    towns = {place_words(c.get("name")) for c in components if set(c.get("types", [])) & TOWN_TYPES} - {""}
    if city in towns:
        return True
    return in_province and any(contains(town, city) or contains(city, town) for town in towns)


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def decide(site: Site, answers: dict) -> Decision:
    query = query_for(site)
    if site.location_source == "manual":
        return Decision(site, query, "kept_manual")
    if query is None:
        return Decision(site, None, "no_address")
    if query not in answers:
        return Decision(site, query, "lookup_failed")
    answer = answers[query]
    if answer is None:
        return Decision(site, query, "not_found")
    precision = precision_of(answer)
    latitude, longitude, flag = coordinates(answer.get("latitude"), answer.get("longitude"))
    found = {"precision": precision, "google_address": answer.get("formatted_address"),
             "partial_match": answer.get("partial_match", False)}
    if flag:
        return Decision(site, query, "outside_philippines", **found)
    found.update(latitude=latitude, longitude=longitude)
    if precision == "province":
        return Decision(site, query, "too_vague", **found)
    if not in_site_town(site, answer):
        return Decision(site, query, "other_town", **found)
    if site.latitude is None:
        return Decision(site, query, "replace", **found)
    moved = distance_km(site.latitude, site.longitude, latitude, longitude)
    if moved < SAME_POINT_KM:
        outcome = "unchanged"
    elif moved <= KEEP_WITHIN_KM[precision]:
        outcome = "kept_close"
    else:
        outcome = "replace"
    return Decision(site, query, outcome, moved_km=moved, **found)


class GoogleGeocoder:
    """Looks addresses up in the Philippines. Never puts the key in an error message: Google's URLs carry it."""

    def __init__(self, api_key: str, client: httpx.Client | None = None, retries: int = 3,
                 sleep: Callable[[float], None] = time.sleep):
        self.api_key, self.retries, self.sleep = api_key, retries, sleep
        self.client = client or httpx.Client(timeout=20)

    def lookup(self, query: str) -> dict | None:
        """Google's answer, or None when it found nothing. Raises LookupError when it couldn't be asked."""
        params = {"address": query, "components": "country:PH", "region": "ph", "key": self.api_key}
        for attempt in range(self.retries + 1):
            if attempt:
                self.sleep(2 ** (attempt - 1))
            try:
                payload = self.client.get(GEOCODE_URL, params=params).json()
            except (httpx.HTTPError, ValueError):
                continue
            status = payload.get("status")
            if status == "OK":
                return answer_from(payload)
            if status == "ZERO_RESULTS":
                return None
            if status in ("REQUEST_DENIED", "OVER_DAILY_LIMIT"):
                raise GeocodeStop(f"Google refused the lookup ({status}). {payload.get('error_message', '')}".strip())
            if status == "INVALID_REQUEST":
                break
        raise LookupError(query)


def load_sites(session: Session, kinds: Iterable[str], limit: int | None = None) -> list[Site]:
    """Every registry or hand-entered site (not the demo fixtures), training first, oldest first."""
    sites = []
    for kind in kinds:
        model = MODELS[kind]
        rows = session.exec(select(model).where(model.data_status != "example").order_by(model.id))
        sites.extend(Site.of(kind, row) for row in rows)
    return sites[:limit] if limit else sites


def look_up(queries: Iterable[str], answers: dict, lookup: Callable[[str], dict | None], workers: int = 8,
            checkpoint: Callable[[], None] | None = None, out: TextIO | None = None) -> int:
    """Adds an answer for every query not answered yet. Returns how many failed; they stay unanswered."""
    pending = sorted(set(queries) - set(answers))
    failed = done = 0
    if out and pending:
        print(f"Looking up {len(pending)} addresses with Google…", file=out, flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(lookup, query): query for query in pending}
        try:
            for future in as_completed(futures):
                try:
                    answers[futures[future]] = future.result()
                    done += 1
                except LookupError:
                    failed += 1
                    continue
                if done % 250 == 0:
                    if checkpoint:
                        checkpoint()
                    if out:
                        print(f"  {done}/{len(pending)}", file=out, flush=True)
        except BaseException:
            for future in futures:
                future.cancel()
            raise
    return failed


def apply_decisions(session: Session, decisions: Iterable[Decision]) -> int:
    """Writes every 'replace' decision. The caller commits."""
    written = 0
    for decision in decisions:
        if decision.outcome != "replace":
            continue
        row = session.get(MODELS[decision.site.kind], decision.site.id)
        row.latitude, row.longitude, row.location_source = decision.latitude, decision.longitude, SOURCE
        session.add(row)
        written += 1
    session.flush()
    return written


def read_answers(path: Path) -> dict:
    """Google's answers kept in an earlier report; refuses to reuse (and later overwrite) any other file."""
    if not path.exists():
        return {}
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        report = None
    if not isinstance(report, dict) or not isinstance(report.get("answers"), dict):
        raise ValueError(f"{path} isn't a report from this command; choose another --report file.")
    return report["answers"]


def write_report(path: Path, *, mode: str, decisions: list[Decision], answers: dict, written: int = 0) -> None:
    summary: dict[str, Counter] = {}
    for decision in decisions:
        summary.setdefault(decision.site.kind, Counter())[decision.outcome] += 1
    order = {outcome: index for index, outcome in enumerate(OUTCOMES)}
    rows = sorted(decisions, key=lambda d: (order[d.outcome], -(d.moved_km or 0), d.site.kind, d.site.id))
    report = {"mode": mode, "database_modified": written > 0, "points_written": written,
              "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "keep_within_km": KEEP_WITHIN_KM,
              "summary": {kind: dict(counts) for kind, counts in summary.items()},
              "sites": [decision.report() for decision in rows],
              # Google's answers by query, reused by the next run with this report.
              "answers": answers}
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def run(session: Session, *, report: Path, lookup: Callable[[str], dict | None], kinds: Iterable[str],
        apply: bool = False, refresh: bool = False, limit: int | None = None, workers: int = 8,
        out: TextIO | None = None) -> dict:
    """Preview the geocoded points, or with apply=True write and commit them, then save the report."""
    kinds = list(kinds)
    answers = {} if refresh else read_answers(report)
    mode = "apply" if apply else "dry-run"
    queries = {query_for(site) for site in load_sites(session, kinds, limit)
               if site.location_source != "manual"} - {None}
    # Don't hold a transaction open while Google answers; decide on the rows as they are afterwards.
    session.commit()

    def checkpoint():
        write_report(report, mode="lookup in progress", decisions=[], answers=dict(answers))

    try:
        failed = look_up(queries, answers, lookup, workers=workers, checkpoint=checkpoint, out=out)
    except BaseException:
        checkpoint()
        raise
    decisions = [decide(site, answers) for site in load_sites(session, kinds, limit)]
    written = 0
    if apply:
        written = apply_decisions(session, decisions)
        session.commit()
    write_report(report, mode=mode, decisions=decisions, answers=answers, written=written)
    counts = Counter(decision.outcome for decision in decisions)
    return {"mode": mode, "sites": len(decisions), "lookups_failed": failed, "points_written": written,
            "outcomes": {outcome: counts[outcome] for outcome in OUTCOMES if counts[outcome]}}
