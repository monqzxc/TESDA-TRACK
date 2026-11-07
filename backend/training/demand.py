"""Build weak job-title labels from the dated demand snapshot and catalog job titles."""
import csv
import hashlib
import re
from collections import Counter, defaultdict
from pathlib import Path

from tesda_track.utils.helpers import normalize

SOURCE = Path(__file__).resolve().parents[1] / "seed" / "sources" / "labor_demand"
FILES = {
    "postings": ("philjobnet_postings_by_region_title_2026-11-04.csv", "title_normalized"),
    "careers": ("careerinfo_ph_careers.csv", "title"),
    "forecast": ("jlmf_calabarzon_2026_2027_priority_occupations.csv", "occupation"),
}
# Narrow spelling/role equivalents only. Targets must be literal possible_jobs in the catalog.
ALIASES = {
    "call center agent": "inbound/outbound contact center service agent",
    "call centre agent": "inbound/outbound contact center service agent",
    "warehouseman": "warehouseperson",
    "kitchen helper": "kitchen assistant",
    "food attendant": "food and beverage attendant",
    "company driver": "professional driver",
    "sales clerk": "sales clerk/ sales assistant",
    "sales assistant": "sales clerk/ sales assistant",
    "customer service assistant": "customer service clerk/assistant",
    "customer service clerk": "customer service clerk/assistant",
    "bagger": "counter-checker/bagger",
    "domestic helper": "domestic worker",
    "head waiter": "head waiter/waitress",
    "bartender": "bartender/barkeeper",
    "waitress": "waiter",
}


def title_key(text):
    # Do not strip specializations such as "(Automotive)" or seniority cues.
    return re.sub(r"\s*\(general\)$", "", normalize(text))


def build(qualifications, exclusions, directory=SOURCE):
    owners = defaultdict(set)
    for q in qualifications:
        for job in q.possible_jobs:
            owners[title_key(job)].add(q.name)
    for target in ALIASES.values():
        if target not in owners:
            raise ValueError(f"Missing catalog job for demand alias: {target}")

    observed = defaultdict(Counter)
    hashes = {}
    for source, (filename, field) in FILES.items():
        path = directory / filename
        hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                if source == "forecast" and not any(row[k] == "True" for k in ("in_demand", "hard_to_fill")):
                    continue
                query = normalize(row[field])
                if query:
                    observed[query][source] += int(row["postings"]) if source == "postings" else 1

    rows = []
    for query, counts in sorted(observed.items()):
        key = title_key(query)
        group = ALIASES.get(key, key)
        labels = sorted(owners.get(key, set()) | owners.get(group, set()))
        if not labels or query in exclusions or key in exclusions or group in exclusions:
            continue
        rows.append(dict(title=query, group=group, labels=labels, sources=dict(counts)))
    # Keep aliases and general-title variants together across all three sources.
    groups = sorted({r["group"] for r in rows}, key=lambda g: hashlib.sha256(("v5:" + g).encode()).digest())
    if len(groups) < 5:
        raise ValueError("Too few demand title groups to train and evaluate")
    held = set(groups[:max(1, len(groups) // 5)])
    for row in rows:
        row["split"] = "held" if row["group"] in held else "train"
    return rows, {"sha256": hashes, "observed_titles": len(observed), "matched_titles": len(rows),
                  "observed_postings": sum(c["postings"] for c in observed.values()),
                  "matched_postings": sum(r["sources"].get("postings", 0) for r in rows)}
