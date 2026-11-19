"""Build the place list the explore page suggests while a learner types a city or province.

Every city and municipality comes from the PSGC (Philippine Standard Geographic Code, via psgc.gitlab.io) with its
province and whether it is the provincial capital. Its point is the town center (poblacion) from GeoNames, which
codes its places with the same PSGC codes. The file is bundled with the frontend, so typing a place never asks an outside
geocoding service where the learner is.

    python3 scripts/prepare_places.py            # downloads, writes frontend/src/features/training/data/places.json
    python3 scripts/prepare_places.py --cache D  # keeps the downloads in D and reuses them
"""
import argparse
import collections
import datetime
import hashlib
import io
import json
import math
import re
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "frontend/src/features/training/data"
SOURCES = {
    "PH.zip": "https://download.geonames.org/export/dump/PH.zip",
    "psgc_municipalities.json": "https://psgc.gitlab.io/api/cities-municipalities.json",
    "psgc_provinces.json": "https://psgc.gitlab.io/api/provinces.json",
}
# PSGC region (first two digits) to the region codes in backend/seed/regions.json, for towns with no province.
REGIONS = {
    "01": "I", "02": "II", "03": "III", "04": "IV-A", "05": "V", "06": "VI", "07": "VII", "08": "VIII",
    "09": "IX", "10": "X", "11": "XI", "12": "XII", "13": "NCR", "14": "CAR", "16": "XIII",
    "15": "BARMM", "17": "MIMAROPA",
}
SEATS = {"PPLC", "PPLA", "PPLA2", "PPLA3", "PPLA4"}


def fetch(name, cache):
    if cache and (cache / name).exists():
        return (cache / name).read_bytes()
    request = urllib.request.Request(SOURCES[name], headers={"User-Agent": "TESDA-TRACK-place-import"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / name).write_bytes(data)
    return data


def norm(text):
    """A name folded for matching: no accents, no "City of", abbreviations spelled out."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\(.*?\)", "", text).strip()
    text = re.sub(r"^(city|municipality|province) of ", "", text)
    text = re.sub(r"\bcity\b", "", text)
    for short, full in (("sto.", "santo"), ("sta.", "santa"), ("gen.", "general"), ("sen.", "senator"),
                        ("pres.", "president")):
        text = text.replace(short, full)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return text


def display(name):
    """"City of Tagum" as a learner writes it: "Tagum City"."""
    name = re.sub(r"\s*\(.*?\)", "", name).strip()
    match = re.match(r"^City of (.+)$", name)
    return f"{match.group(1)} City" if match else name


def title(province):
    # PSGC writes some provinces "Lanao Del Sur"; learners and the catalog write "Lanao del Sur".
    return re.sub(r"\b(Del|De|Of)\b", lambda m: m.group(1).lower(), province)


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path)
    args = parser.parse_args()

    raw = {name: fetch(name, args.cache) for name in SOURCES}
    with zipfile.ZipFile(io.BytesIO(raw["PH.zip"])) as archive:
        rows = [line.split("\t") for line in archive.read("PH.txt").decode().splitlines()]
    # GeoNames codes each municipality's places with its PSGC code: the town center (a seat) first, then the
    # municipality's own point, then its most populous place.
    points = {}
    by_name = collections.defaultdict(list)
    names = {}
    for row in rows:
        feature, kind, codes = row[6], row[7], (row[12], row[11])
        if feature == "P" and kind in SEATS:
            rank = 0
        elif feature == "A" and kind in ("ADM2", "ADM3"):
            rank = 1
        elif feature == "P":
            rank = 2
        else:
            continue
        point = (round(float(row[4]), 4), round(float(row[5]), 4))
        best = (rank, -int(row[14] or 0), point)
        for code in codes:
            if re.fullmatch(r"\d{9}", code) and (code not in points or best < points[code]):
                points[code] = best
        if rank == 0:
            for name in {norm(row[1]), norm(row[2])}:
                by_name[name].append(point)
        if kind == "ADM3" and re.fullmatch(r"\d{9}", row[12]):
            names[row[12]] = norm(row[1])
    # A town center GeoNames left uncoded: the seat of the same name near the municipality's own point.
    for code, (rank, population, point) in points.items():
        if rank and code in names:
            near = [seat for seat in by_name.get(names[code], []) if km(seat, point) < 20]
            if near:
                points[code] = (0, population, min(near, key=lambda seat: km(seat, point)))

    regions = {row["code"]: (row["latitude"], row["longitude"])
               for row in json.loads((ROOT / "backend/seed/regions.json").read_text())}
    provinces = {row["code"]: row for row in json.loads(raw["psgc_provinces.json"])}
    towns, missing = [], []
    for town in sorted(json.loads(raw["psgc_municipalities.json"]), key=lambda t: t["code"]):
        province = provinces.get(town["provinceCode"]) if town["provinceCode"] else None
        found = points.get(town["code"], (None, None, None))[2]
        if not found:
            # Not coded in GeoNames (an independent city): the same name nearest the town's region, when it is in
            # that region at all.
            middle = regions[REGIONS[town["regionCode"][:2]]]
            near = sorted(by_name.get(norm(town["name"]), []), key=lambda point: km(point, middle))
            found = near[0] if near and km(near[0], middle) < 350 else None
        if not found:
            missing.append(town["name"])
            continue
        towns.append({
            "name": display(town["name"]),
            "province": title(province["name"]) if province else None,
            "latitude": found[0],
            "longitude": found[1],
            "city": town["isCity"],
            "capital": town["isCapital"],
        })
    if missing:
        sys.exit(f"No point for {len(missing)} towns: {', '.join(missing)}")

    # Each province by its capital: typing "Pampanga" measures from San Fernando, not the middle of the province.
    capitals = []
    for province in sorted(provinces.values(), key=lambda p: p["name"]):
        label = title(province["name"])
        capital = next((i for i, t in enumerate(towns) if t["province"] == label and t["capital"]), None)
        if capital is None:
            sys.exit(f"No capital for {label}")
        capitals.append([label, capital])
    # Metro Manila has no province; its capital is Manila.
    capitals.append(["Metro Manila", next(i for i, t in enumerate(towns) if t["name"] == "Manila City")])

    data = {
        # [name, province or null, latitude, longitude, 1 for a city]
        "towns": [[t["name"], t["province"], t["latitude"], t["longitude"], int(t["city"])]
                  for t in towns],
        # [province, index of its capital in towns]
        "provinces": capitals,
    }
    DESTINATION.mkdir(parents=True, exist_ok=True)
    (DESTINATION / "places.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    (DESTINATION / "places-source.json").write_text(json.dumps({
        "built": datetime.date.today().isoformat(),
        "towns": len(towns),
        "provinces": len(capitals),
        "sources": {name: {"url": url, "sha256": hashlib.sha256(raw[name]).hexdigest()}
                    for name, url in SOURCES.items()},
        "license": "Points: GeoNames (geonames.org), CC BY 4.0. Names and capitals: PSA PSGC via psgc.gitlab.io.",
    }, indent=2) + "\n")
    print(f"{len(towns)} towns, {len(capitals)} provinces")


if __name__ == "__main__":
    main()
