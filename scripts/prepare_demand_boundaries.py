"""Fetch a pinned, PSGC-aligned regional map; preserve source attribution beside it."""
import hashlib
import json
from pathlib import Path
import urllib.request

COMMIT = "680e32e62baeccbcd8845d3b1387bc67c1baf78a"
ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "frontend/src/features/training/data"
BASE = f"https://raw.githubusercontent.com/faeldon/philippines-json-maps/{COMMIT}/"
SOURCE_PATH = "latest/geojson/country/lowres/country.0.001.json"
REGIONS = {
    1: "I", 2: "II", 3: "III", 4: "IV-A", 5: "V", 6: "VI", 7: "VII", 8: "VIII",
    9: "IX", 10: "X", 11: "XI", 12: "XII", 13: "NCR", 14: "CAR", 16: "XIII",
    17: "MIMAROPA", 18: "NIR", 19: "BARMM",
}


def download(path):
    request = urllib.request.Request(BASE + path, headers={"User-Agent": "TESDA-TRACK-boundary-import"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def rounded(value):
    return [rounded(item) for item in value] if isinstance(value, list) else round(value, 5)


def main():
    raw = download(SOURCE_PATH)
    data = json.loads(raw)
    names = {row["code"]: row["name"] for row in json.loads((ROOT / "backend/seed/regions.json").read_text())}
    features = []
    for feature in data["features"]:
        psgc = feature["properties"]["adm1_psgc"]
        code = REGIONS[psgc // 100_000_000]
        features.append({
            "type": "Feature", "id": code,
            "properties": {"region_code": code, "name": names[code], "psgc": psgc},
            "geometry": {"type": feature["geometry"]["type"], "coordinates": rounded(feature["geometry"]["coordinates"])},
        })
    assert {f["properties"]["region_code"] for f in features} == set(names)
    output = (json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n").encode()
    DESTINATION.mkdir(parents=True, exist_ok=True)
    (DESTINATION / "philippines-regions.json").write_bytes(output)
    (DESTINATION / "BOUNDARIES-LICENSE.txt").write_bytes(download("LICENSE").rstrip() + b"\n")
    manifest = {
        "source_url": BASE + SOURCE_PATH, "commit": COMMIT,
        "upstream_manifest": json.loads(download("latest/manifest.json")),
        "source_sha256": hashlib.sha256(raw).hexdigest(), "output_sha256": hashlib.sha256(output).hexdigest(),
        "changes": "Properties reduced to app region codes, names and PSGC; coordinates rounded to 5 decimals.",
        "attribution": "PSA / NAMRIA via OCHA HDX COD-AB (CC BY-IGO); PSGC alignment and simplification by James Faeldon (MIT).",
        "original_source": "https://data.humdata.org/dataset/cod-ab-phl",
        "boundary_license": "https://creativecommons.org/licenses/by/3.0/igo/",
    }
    (DESTINATION / "boundaries-source.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"regions": len(features), "bytes": len(output), "sha256": manifest["output_sha256"]}))


if __name__ == "__main__":
    main()
