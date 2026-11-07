"""Source-backed corrections without overwriting the original scraped catalog or model vectors."""

import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def corrections():
    path = (
        Path(__file__).resolve().parents[2]
        / "seed/sources/occupation_catalog_overrides.json"
    )
    return json.loads(path.read_text(encoding="utf-8"))


def jobs(code, original):
    entry = corrections()["qualifications"].get(code, {})
    return list(
        dict.fromkeys(
            entry.get("replace_jobs", [*entry.get("prepend_jobs", []), *original])
        )
    )


def source(code):
    entry = corrections()["qualifications"].get(code)
    if entry is None:
        return None
    return dict(
        corrections()["source"],
        occupations=entry.get("replace_jobs", entry.get("prepend_jobs", [])),
    )
