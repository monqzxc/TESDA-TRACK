"""Suggest qualifications for the job titles no posting link covers yet, for a reviewer to decide.

    python scripts/suggest_unlinked_titles.py --out data-review/unlinked-titles-YYYY-MM-DD [--top 200]

Reads the configured database and asks a running API (API_BASE_URL, default http://127.0.0.1:8000) for the app's own
matches for each title, as the Career Map's search box would. It writes a sheet and changes nothing: no proposal is
imported and no mapping approved. A title with no good match is listed with none, for the reviewer to leave unlinked.
"""
import argparse
import csv
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

UNLINKED = """
WITH posting AS (
  SELECT e.id, e.normalized_title, e.occupation_title, e.region_code
  FROM labor_market_evidence e JOIN labor_market_dataset d ON d.id = e.dataset_id
  WHERE d.status = 'active' AND d.evidence_class = 'observed_posting' AND d.source_id LIKE 'philjobnet-postings-%'),
linked AS (
  SELECT DISTINCT m.evidence_id FROM labor_market_mapping m
  WHERE m.decision = 'approved' AND m.proposal = 'high_confidence')
SELECT normalized_title, min(occupation_title) AS title, count(*) AS postings,
       count(DISTINCT region_code) AS regions, string_agg(DISTINCT region_code, ' ' ORDER BY region_code) AS codes
FROM posting WHERE id NOT IN (SELECT evidence_id FROM linked)
GROUP BY normalized_title ORDER BY postings DESC, normalized_title
"""
STRONG = 60  # the Career Map's own line for a strong match


def ask(base: str, path: str, body: dict) -> dict:
    request = urllib.request.Request(base + path, json.dumps(body).encode(), {"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--top", type=int, default=200)
    args = parser.parse_args()
    from sqlalchemy import text
    from sqlmodel import Session

    from tesda_track.db import get_engine

    base = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    with Session(get_engine()) as session:
        titles = session.execute(text(UNLINKED)).all()
    total = sum(row.postings for row in titles)
    rows, covered, suggested = [], 0, 0
    for rank, row in enumerate(titles[:args.top], start=1):
        query = row.normalized_title
        goal = ask(base, "/api/v1/analysis/goal", {"query": query, "interpret_input": True})
        found = ask(base, "/api/v1/analysis/matches",
                    {"query": query, "profile": goal["profile"], "mode": goal.get("matching_mode") or "goal"})
        matches = found.get("matches", [])[:3]
        covered += row.postings
        suggested += row.postings if matches and matches[0]["score"] >= STRONG else 0
        record = {"rank": rank, "job_title": row.title, "postings": row.postings, "regions": row.regions,
                  "region_codes": row.codes}
        for n in range(3):
            match = matches[n] if n < len(matches) else None
            record[f"suggestion_{n + 1}_code"] = match["qualification"]["code"] if match else ""
            record[f"suggestion_{n + 1}_name"] = match["qualification"]["name"] if match else ""
            record[f"suggestion_{n + 1}_score"] = match["score"] if match else ""
        record.update({"decision (link / no TESDA qualification / unsure)": "", "qualification_code_to_link": "",
                       "reviewer_note": ""})
        rows.append(record)
    args.out.mkdir(parents=True, exist_ok=True)
    with (args.out / "title-suggestions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    summary = {"unlinked_titles": len(titles), "unlinked_postings": total, "titles_listed": len(rows),
               "postings_in_listed_titles": covered,
               "postings_whose_first_suggestion_is_a_strong_match": suggested, "strong_match_score": STRONG}
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
