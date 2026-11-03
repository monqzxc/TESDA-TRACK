"""Move training providers and assessment centers to where Google Maps puts them.

Some registry coordinates are typing mistakes that put a center in the sea or in another town. Two lookups fix
them; both only move a point to somewhere in the site's own city or municipality, and never touch a point an
administrator corrected.

By address (the default) geocodes each site's address with the Geocoding API:

- a building or street-address match always replaces the point;
- a barangay match replaces it when the point is missing or more than 1 km away;
- a match on only a road or the town replaces it when the point is missing or more than 5 km away, so a good
  registry point isn't moved to the middle of a highway or the town center;
- province-only matches and matches in another town are left alone.

By name (--by-name) searches Google Maps (Places API) for the center itself, "<name>, <town>, <province>", and
moves the point to the place whose name matches. Names match on their distinctive words: "college" or "training
center" count for little, so "STI College Novaliches" never matches "STI College Fairview". Two matching places
far apart in the same town (branches) are reported as ambiguous instead of guessed between.

Preview is the default; --apply writes. The report also keeps Google's answers: running again with the same
--report reuses them, so a preview followed by --apply asks Google once. Replaced points are marked
location_source = 'google_geocoding' or 'google_places', and registry imports keep them.
"""
from __future__ import annotations

import json
import math
import re
import threading
import time
import unicodedata
from collections import Counter
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import TextIO
from urllib.parse import quote

import httpx
from sqlmodel import Session, select

from tesda_track.models import AssessmentCenter, TrainingProvider
from tesda_track.registry_import import coordinates

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_FIELDS = ",".join(f"places.{field}" for field in
                         ("id", "displayName", "formattedAddress", "location", "types", "addressComponents",
                          "businessStatus"))
PHILIPPINES = {"low": {"latitude": 4.0, "longitude": 116.0}, "high": {"latitude": 22.0, "longitude": 127.0}}
SOURCES = {"address": "google_geocoding", "name": "google_places"}
SOURCE = SOURCES["address"]
MODELS = {"training": TrainingProvider, "assessment": AssessmentCenter}
# How far a point may sit from Google's answer and still be kept, by how precise the answer is.
KEEP_WITHIN_KM = {"exact": 0.0, "barangay": 1.0, "road": 5.0, "town": 5.0}
# Closer than this is the same point (Google's answers wobble by a few metres).
SAME_POINT_KM = 0.01
# Two places matching a name this well, this far apart, are branches; neither is picked.
AMBIGUOUS_SCORE_GAP = 0.1
AMBIGUOUS_KM = 0.3
# Weighted share of the center's name found in the place's name, of the place's name found in the center's, and
# their average. Measured on the registry itself: same-town pairs of different institutions score below 0.75
# ("Tuguegarao Training and Assessment Center" / "Mallari Training and Assessment Center"), while the same
# institution spelled two ways scores above it.
NAME_COVERS_OURS = 0.75
NAME_COVERS_THEIRS = 0.5
NAME_MIN_SCORE = 0.75
# When every word of Google's name is in the center's, Google lists a shorter name; less of ours need be in it, as
# long as Google's name has a word fewer than about 25 of the ~9,600 registry names use ("Edfher" in "EDFHER FARM";
# not "Driving" in "B.N. Driving School", which 63 use).
NAME_SHORTER_LISTING = 0.4
NAME_DISTINCTIVE = 7.0
# Two branches: the one whose address shares at least this many more words with the center's address wins.
ADDRESS_TIE_BREAK = 2

EXACT_TYPES = {"street_address", "premise", "subpremise", "establishment", "point_of_interest", "intersection",
               "plus_code"}
BARANGAY_TYPES = {"neighborhood", "colloquial_area", "sublocality", "sublocality_level_1", "sublocality_level_2",
                  "sublocality_level_3", "sublocality_level_4", "sublocality_level_5",
                  "administrative_area_level_4", "administrative_area_level_5"}
TOWN_TYPES = {"locality", "administrative_area_level_3"}
FILLER_WORDS = {"city", "of", "municipality", "the"}
ABBREVIATIONS = {"sto": "santo", "sta": "santa", "sn": "san", "gen": "general", "pres": "president",
                 "mt": "mountain", "brgy": "barangay", "bgy": "barangay", "pob": "poblacion"}
NAME_FILLER = {"inc", "incorporated", "incorporation", "corp", "corporation", "co", "company", "ltd", "limited", "the",
               "of", "and", "for",
               # Words Google Maps listings add to the institution's name.
               "tesda", "accredited", "main", "campus", "branch", "annex", "extension", "satellite", "office",
               "building", "bldg"}
NAME_ABBREVIATIONS = {**ABBREVIATIONS, "st": "saint", "phils": "philippines", "phil": "philippines",
                      "ptc": "provincial training center",
                      "rtc": "regional training center", "centre": "center", "ctr": "center", "cntr": "center",
                      "trng": "training", "natl": "national", "nhs": "national high school",
                      "sat": "school of arts and trades"}
# Left out of acronyms: "United School of Science and Technology" is USST, "Academy for International Culinary
# Arts" AICA. Company words stay in: "Guimaras Skills Academy Corp." is GSAC.
ACRONYM_SKIP = {"of", "and", "the", "for", "in", "at", "de", "del", "la", "sa", "ng"}
# Address words too common to tell two places apart.
ADDRESS_COMMON = {"street", "st", "avenue", "ave", "road", "rd", "barangay", "purok", "poblacion", "national",
                  "highway", "hwy", "philippines", "blk", "block", "lot", "lots", "phase", "subdivision", "subd",
                  "village", "zone", "district", "sitio", "building", "bldg", "floor", "unit", "corner", "cor"}
OUTCOMES = ("replace", "unchanged", "kept_close", "kept_manual", "ambiguous", "other_town", "name_not_found",
            "too_vague", "outside_philippines", "not_found", "no_address", "lookup_failed")


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


def map_link(latitude: float | None, longitude: float | None) -> str | None:
    return None if latitude is None else f"https://www.google.com/maps?q={latitude},{longitude}"


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
    google_name: str | None = None
    place_id: str | None = None
    name_score: float | None = None

    def report(self) -> dict:
        site = self.site
        row = {"kind": site.kind, "id": site.id, "name": site.name, "region": site.region_code,
               "query": self.query, "outcome": self.outcome, "precision": self.precision,
               "from": [site.latitude, site.longitude] if site.latitude is not None else None,
               "to": [self.latitude, self.longitude] if self.latitude is not None else None,
               "moved_km": None if self.moved_km is None else round(self.moved_km, 3),
               "google_address": self.google_address, "partial_match": self.partial_match,
               "from_map": map_link(site.latitude, site.longitude), "to_map": map_link(self.latitude, self.longitude)}
        if self.place_id:
            row.update(google_name=self.google_name, place_id=self.place_id, name_score=self.name_score,
                       to_map=f"https://www.google.com/maps/search/?api=1&query={quote(self.google_name or '')}"
                              f"&query_place_id={self.place_id}")
        return row


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


def _with_town(parts: list[str], site: Site) -> str | None:
    """Adds the city and province when the text so far doesn't already name them."""
    for extra in (site.city, site.province if province_of(site) else None):
        extra = re.sub(r"\s+", " ", extra or "").strip(" ,")
        if extra and not contains(place_words(", ".join(parts)), place_words(extra)):
            parts.append(extra)
    return ", ".join([*parts, "Philippines"]) if parts else None


def query_for(site: Site) -> str | None:
    """The address, then the city and province when the address doesn't already name them."""
    address = re.sub(r"\s+", " ", site.address or "").strip(" ,")
    return _with_town([address] if address else [], site)


def name_query_for(site: Site) -> str | None:
    """The center's name, then its city and province: what someone would type into Google Maps."""
    name = re.sub(r"\s+", " ", site.name or "").strip(" ,")
    return _with_town([name], site) if name else None


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


def place_from(place: dict) -> dict:
    """One Places search result, in the same shape as a geocoding answer plus its name and ID."""
    location = place.get("location", {})
    return {"name": (place.get("displayName") or {}).get("text"), "place_id": place.get("id"),
            "latitude": location.get("latitude"), "longitude": location.get("longitude"),
            "formatted_address": place.get("formattedAddress"), "types": place.get("types", []),
            "status": place.get("businessStatus"),
            "components": [{"name": c.get("longText"), "types": c.get("types", [])}
                           for c in place.get("addressComponents", [])]}


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

    The town's name must match Google's town exactly (spaces aside: "Sultan Sabarongis" is "Sultan sa Barongis");
    a looser match (one name inside the other, as with "Island Garden City of Samal" and "Samal") also needs the
    province to match, so "San Jose" never passes for "San Jose del Monte". Only town names count: "Cebu City"
    must not match a Mandaue answer through its province, Cebu.
    """
    components = answer.get("components", [])
    names = [answer.get("formatted_address") or "", *(c.get("name") or "" for c in components)]
    city, province = place_words(site.city), province_of(site)
    in_province = not province or contains(" | ".join(place_words(name) for name in names), province)
    if not city:
        return in_province
    towns = {place_words(c.get("name")) for c in components if set(c.get("types", [])) & TOWN_TYPES} - {""}
    if any(_same_town(city, town) for town in towns):
        return True
    return in_province and any(contains(town, city) or contains(city, town) for town in towns)


def _same_town(ours: str, theirs: str) -> bool:
    """Equal place names, spaces aside ("Sultan Sabarongis") or with a word given as its initial ("Gen. E. Aguinaldo"
    is "General Emilio Aguinaldo")."""
    if ours.replace(" ", "") == theirs.replace(" ", ""):
        return True
    a, b = ours.split(), theirs.split()
    return len(a) == len(b) and all(x == y or (min(len(x), len(y)) == 1 and x[0] == y[0]) for x, y in zip(a, b))


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


def name_words(value: str | None) -> list[str]:
    """An institution's name word by word: no accents or apostrophes; PTC and St. spelled out."""
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().casefold()
    value = re.sub(r"['`’]", "", value)
    return " ".join(NAME_ABBREVIATIONS.get(word, word) for word in re.findall(r"[a-z0-9]+", value)).split()


def name_tokens(value: str | None) -> frozenset[str]:
    """The words that identify an institution: name_words without 'Inc.', 'Corp.', 'of', 'Main Campus' or initials."""
    return frozenset(word for word in name_words(value)
                     if word not in NAME_FILLER and (len(word) > 1 or word.isdigit()))


def acronyms(value: str | None) -> dict[str, set[str]]:
    """Every acronym of two to six consecutive words, with the words it stands for: "PWU" for "Philippine Women's
    University"."""
    words = [word for word in name_words(value) if word not in ACRONYM_SKIP]
    runs: dict[str, set[str]] = {}
    for start in range(len(words)):
        for end in range(start + 2, min(len(words), start + 6) + 1):
            runs.setdefault("".join(word[0] for word in words[start:end]), set()).update(words[start:end])
    return runs


def address_words(value: str | None, town_words: Iterable[str] = ()) -> set[str]:
    """The words that tell one address from another nearby: house numbers, streets, subdivisions."""
    words = set(place_words(value).split()) - ADDRESS_COMMON - set(town_words)
    return {word for word in words if len(word) > 1 or word.isdigit()}


class NameWeights:
    """How distinctive each word is across all center names: 'college' counts little, 'novaliches' a lot."""

    def __init__(self, names: Iterable[str]):
        documents = [name_tokens(name) for name in set(names)]
        self.count = len(documents)
        self.frequency = Counter(word for words in documents for word in words)

    def __call__(self, word: str) -> float:
        return math.log((self.count + 1) / (self.frequency[word] + 1)) + 1


def _same_word(a: str, b: str) -> bool:
    # Tolerates a typo in longer words ("Minadanao", "Mindanao") but not different short ones ("Iba", "Ibu").
    return a == b or (min(len(a), len(b)) >= 5 and SequenceMatcher(None, a, b).ratio() >= 0.85)


def name_match(ours: str, theirs: str | None, weights: Callable[[str], float],
               town_words: Iterable[str] = (), address: str | None = None,
               their_address: str | None = None) -> float | None:
    """How well a Google place's name matches a center's, from 0 to 1, or None when it doesn't match.

    Each name's most distinctive word must be in the other: "Novaliches" for "STI College Novaliches", and "Tambis"
    rules "Tambis National High School" out for "Barobo National High School". Most of each name's weight must
    be in the other's too, or all of the place's when Google lists a shorter name ("EDFHER FARM" for "Edfher Farm
    Agricultural Learning Site"). A word may also be found in the other side's address ("Cebu Skills Institute -
    Banilad" at "... Banilad, Cebu City"), or as an acronym ("PWU" for "Philippine Women's University"). The
    center's own town and province words count as little as "center": in Naga, "City College of Naga" and "Naga
    College Foundation" share nothing distinctive.
    """
    a, b = name_tokens(ours), name_tokens(theirs)
    if not a or not b:
        return None
    town_words = set(town_words)
    a_runs, b_runs = acronyms(ours), acronyms(theirs)
    # Words each side can find: the other's name and address, the other's acronyms, and its own words that an
    # acronym in the other's name stands for.
    for_a = (b | name_tokens(their_address), {k for k in b_runs if len(k) >= 3},
             set().union(*(words for k, words in a_runs.items() if len(k) >= 3 and k in b)))
    for_b = (a | name_tokens(address), {k for k in a_runs if len(k) >= 3},
             set().union(*(words for k, words in b_runs.items() if len(k) >= 3 and k in a)))

    def weight(word):
        # "City" belongs with the town: "Lipa City Colleges" says nothing "St. Cecilia College of Lipa City" doesn't.
        return 1.0 if word in town_words or word in FILLER_WORDS else weights(word)

    def found(word, sources):
        words, initials, explained = sources
        return word in explained or word in initials or any(_same_word(word, other) for other in words)

    def covered(words, sources):
        return sum(weight(word) for word in words if found(word, sources)) / sum(weight(word) for word in words)

    def rarest_found(words, sources):
        rarest = max(weight(word) for word in words)
        return any(found(word, sources) for word in words if weight(word) == rarest)

    if not rarest_found(a, for_a) or not rarest_found(b, for_b):
        return None
    ours_covered, theirs_covered = covered(a, for_a), covered(b, for_b)
    score = round((ours_covered + theirs_covered) / 2, 3)
    alike = ours_covered >= NAME_COVERS_OURS and theirs_covered >= NAME_COVERS_THEIRS and score >= NAME_MIN_SCORE
    shorter_listing = (theirs_covered >= 0.999 and ours_covered >= NAME_SHORTER_LISTING
                       and max(weight(word) for word in b) >= NAME_DISTINCTIVE)
    return score if alike or shorter_listing else None


def decide_by_name(site: Site, answers: dict, weights: Callable[[str], float]) -> Decision:
    query = name_query_for(site)
    if site.location_source == "manual":
        return Decision(site, query, "kept_manual")
    if query is None:
        return Decision(site, None, "no_address")
    if query not in answers:
        return Decision(site, query, "lookup_failed")
    matches = []
    town_words = set(place_words(site.city).split()) | set(place_words(site.province).split())
    for place in answers[query] or []:
        latitude, longitude, flag = coordinates(place.get("latitude"), place.get("longitude"))
        score = None if flag else name_match(site.name, place.get("name"), weights, town_words, site.address,
                                             place.get("formatted_address"))
        if score is not None:
            matches.append((score, place, latitude, longitude))
    if not matches:
        return Decision(site, query, "name_not_found")

    def found(match, **extra):
        score, place, latitude, longitude = match
        return Decision(site, query, precision="place", latitude=latitude, longitude=longitude,
                        google_address=place.get("formatted_address"), google_name=place.get("name"),
                        place_id=place.get("place_id"), name_score=score, **extra)

    in_town = [match for match in matches if in_site_town(site, match[1])]
    if not in_town:
        return found(max(matches, key=lambda m: m[0]), outcome="other_town")
    best = max(in_town, key=lambda m: m[0])
    rivals = [match for match in in_town if match is not best and match[0] >= best[0] - AMBIGUOUS_SCORE_GAP
              and distance_km(best[2], best[3], match[2], match[3]) > AMBIGUOUS_KM]
    if rivals:
        # Branches of one name: the registry's address picks one ("360-A Don Placido Campos Ave") when it clearly can.
        ours = address_words(site.address, town_words)
        shared = sorted(((len(ours & address_words(m[1].get("formatted_address"), town_words)), i, m)
                         for i, m in enumerate([best, *rivals])), key=lambda s: (-s[0], s[1]))
        if shared[0][0] < ADDRESS_TIE_BREAK or shared[0][0] < shared[1][0] + ADDRESS_TIE_BREAK:
            return found(best, outcome="ambiguous")
        best = shared[0][2]
    if site.latitude is None:
        return found(best, outcome="replace")
    moved = distance_km(site.latitude, site.longitude, best[2], best[3])
    return found(best, outcome="unchanged" if moved < SAME_POINT_KM else "replace", moved_km=moved)


def _error_message(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
    except (ValueError, AttributeError):
        return ""
    return f"{error.get('status', '')}: {error.get('message', '')}".strip(": ") if isinstance(error, dict) else ""


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


class GooglePlaces:
    """Searches Google Maps for places in the Philippines (Places API, Text Search), at most per_minute a minute."""

    def __init__(self, api_key: str, client: httpx.Client | None = None, retries: int = 4, per_minute: int = 500,
                 sleep: Callable[[float], None] = time.sleep):
        self.api_key, self.retries, self.sleep = api_key, retries, sleep
        self.client = client or httpx.Client(timeout=20)
        self.interval, self.next_start, self.lock = 60 / per_minute, 0.0, threading.Lock()

    def _wait_turn(self):
        with self.lock:
            wait = self.next_start - time.monotonic()
            self.next_start = max(self.next_start, time.monotonic()) + self.interval
        if wait > 0:
            self.sleep(wait)

    def lookup(self, query: str) -> list[dict] | None:
        """Up to five places, best first, or None when Google found none. Raises LookupError when it couldn't ask."""
        body = {"textQuery": query, "regionCode": "PH", "languageCode": "en", "pageSize": 5,
                "locationRestriction": {"rectangle": PHILIPPINES}}
        headers = {"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": PLACES_FIELDS}
        for attempt in range(self.retries + 1):
            if attempt:
                self.sleep(2 ** attempt)
            self._wait_turn()
            try:
                response = self.client.post(PLACES_URL, json=body, headers=headers)
            except httpx.HTTPError:
                continue
            if response.status_code == 200:
                try:
                    places = response.json().get("places", [])
                except (ValueError, AttributeError):
                    continue
                return [place_from(place) for place in places] or None
            if response.status_code in (401, 403):
                raise GeocodeStop(f"Google refused the search (HTTP {response.status_code}). "
                                  f"{_error_message(response)}".strip())
            if response.status_code == 400:
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


def look_up(queries: Iterable[str], answers: dict, lookup: Callable[[str], object], workers: int = 8,
            checkpoint: Callable[[], None] | None = None, out: TextIO | None = None) -> int:
    """Adds an answer for every query not answered yet. Returns how many failed; they stay unanswered."""
    pending = sorted(set(queries) - set(answers))
    failed = done = 0
    if out and pending:
        print(f"Asking Google about {len(pending)} centers…", file=out, flush=True)
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


def apply_decisions(session: Session, decisions: Iterable[Decision], source: str = SOURCE) -> int:
    """Writes every 'replace' decision. The caller commits."""
    written = 0
    for decision in decisions:
        if decision.outcome != "replace":
            continue
        row = session.get(MODELS[decision.site.kind], decision.site.id)
        row.latitude, row.longitude, row.location_source = decision.latitude, decision.longitude, source
        session.add(row)
        written += 1
    session.flush()
    return written


def read_answers(path: Path, lookup: str = "address") -> dict:
    """Google's answers kept in an earlier report; refuses to reuse (and later overwrite) any other file."""
    if not path.exists():
        return {}
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        report = None
    if not isinstance(report, dict) or not isinstance(report.get("answers"), dict):
        raise ValueError(f"{path} isn't a report from this command; choose another --report file.")
    if report.get("lookup", "address") != lookup:
        made = "with --by-name" if report.get("lookup") == "name" else "without --by-name"
        raise ValueError(f"{path} was made {made}; use another --report file for this lookup.")
    return report["answers"]


def write_report(path: Path, *, mode: str, decisions: list[Decision], answers: dict, written: int = 0,
                 lookup: str = "address") -> None:
    summary: dict[str, Counter] = {}
    for decision in decisions:
        summary.setdefault(decision.site.kind, Counter())[decision.outcome] += 1
    order = {outcome: index for index, outcome in enumerate(OUTCOMES)}
    rows = sorted(decisions, key=lambda d: (order[d.outcome], -(d.moved_km or 0), d.site.kind, d.site.id))
    report = {"mode": mode, "lookup": lookup, "database_modified": written > 0, "points_written": written,
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


def run(session: Session, *, report: Path, lookup: Callable[[str], object], kinds: Iterable[str],
        apply: bool = False, refresh: bool = False, limit: int | None = None, by_name: bool = False,
        workers: int = 8, out: TextIO | None = None) -> dict:
    """Preview the new points, or with apply=True write and commit them, then save the report."""
    kinds = list(kinds)
    kind_of_lookup = "name" if by_name else "address"
    query_of = name_query_for if by_name else query_for
    answers = {} if refresh else read_answers(report, kind_of_lookup)
    mode = "apply" if apply else "dry-run"
    queries = {query_of(site) for site in load_sites(session, kinds, limit)
               if site.location_source != "manual"} - {None}
    # Don't hold a transaction open while Google answers; decide on the rows as they are afterwards.
    session.commit()

    def checkpoint():
        write_report(report, mode="lookup in progress", decisions=[], answers=dict(answers), lookup=kind_of_lookup)

    try:
        failed = look_up(queries, answers, lookup, workers=workers, checkpoint=checkpoint, out=out)
    except BaseException:
        checkpoint()
        raise
    sites = load_sites(session, kinds, limit)
    if by_name:
        # Word weights come from every center's name, so a --limit or --kind run judges names the same way.
        weights = NameWeights(site.name for site in load_sites(session, MODELS))
        decisions = [decide_by_name(site, answers, weights) for site in sites]
    else:
        decisions = [decide(site, answers) for site in sites]
    written = 0
    if apply:
        written = apply_decisions(session, decisions, SOURCES[kind_of_lookup])
        session.commit()
    write_report(report, mode=mode, decisions=decisions, answers=answers, written=written, lookup=kind_of_lookup)
    counts = Counter(decision.outcome for decision in decisions)
    return {"mode": mode, "sites": len(decisions), "lookups_failed": failed, "points_written": written,
            "outcomes": {outcome: counts[outcome] for outcome in OUTCOMES if counts[outcome]}}
