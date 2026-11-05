"""Check skill and job search against the real model: how often the top match is right, and irrelevant input empty.

Run from backend/, with the model downloaded (backend/models/README.md), the database migrated and seeded, and the
catalog embedded (SEMANTIC_SEARCH_ENABLED=true python -m tesda_track.embeddings sync):

    SEMANTIC_SEARCH_ENABLED=true python -m evaluation.skill_search
    SEMANTIC_SEARCH_ENABLED=true python -m evaluation.skill_search --compare-goals https://tesda-track.vercel.app

--compare-goals also sends each occupation as a goal ("I want to be a ...") to this server and to a deployment
running the previous code, and reports any goal whose matches differ. The cases are hand-written test inputs.
"""
import argparse
import json
import sys
from pathlib import Path

import httpx
from sqlmodel import Session

from tesda_track.db import get_engine
from tesda_track.schemas.analysis import Profile
from tesda_track.services import analysis
from tesda_track.services.embeddings import get_embedder

CASES = Path(__file__).parent / "data" / "skill_search_cases_v1.json"


def accepted(code: str, prefixes: list[str]) -> bool:
    return any(code.startswith(prefix) for prefix in prefixes)


def run(session: Session, embedder) -> tuple[list[dict], dict]:
    cases = json.loads(CASES.read_text(encoding="utf-8"))["cases"]
    rows = []
    for case in cases:
        evidence = analysis.match_evidence(session, case["text"], Profile(), embedder, mode="skills")
        codes = [m.qualification.code for m in evidence.matches]
        relevant = bool(case["expect"])
        rows.append({
            **case,
            "top": [(m.qualification.code, m.score) for m in evidence.matches[:3]],
            "top1": relevant and bool(codes) and accepted(codes[0], case["expect"]),
            "top3": relevant and any(accepted(code, case["expect"]) for code in codes[:3]),
            "false_positive": not relevant and bool(codes),
        })
    summary = {}
    for kind in sorted({row["kind"] for row in rows}):
        group = [row for row in rows if row["kind"] == kind]
        if kind == "irrelevant":
            summary[kind] = {"cases": len(group), "returned_matches": sum(r["false_positive"] for r in group)}
        else:
            summary[kind] = {"cases": len(group), "top1": sum(r["top1"] for r in group),
                             "top3": sum(r["top3"] for r in group)}
    return rows, summary


def compare_goals(session: Session, embedder, base_url: str, rows: list[dict]) -> list[dict]:
    """Goal-mode matches here against a deployment of the previous code, for the occupation cases."""
    differences = []
    with httpx.Client(base_url=base_url.rstrip("/") + "/api/v1", timeout=60) as client:
        for row in (r for r in rows if r["kind"] == "occupation"):
            goal = f"I want to be a {row['text']}."
            profile = client.post("/analysis/goal", json={"query": goal}).json()["profile"]
            theirs = client.post("/analysis/matches", json={"query": goal, "profile": profile}).json()["matches"]
            _, ours = analysis.match(session, goal, Profile.model_validate(profile), embedder)
            pair = ([(m["qualification"]["code"], m["score"]) for m in theirs],
                    [(m.qualification.code, m.score) for m in ours])
            if pair[0] != pair[1]:
                differences.append({"goal": goal, "previous": pair[0], "now": pair[1]})
    return differences


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--compare-goals", metavar="URL", help="a deployment running the previous code")
    parser.add_argument("--output", type=Path, help="write the full results as JSON")
    args = parser.parse_args()
    embedder = get_embedder()
    if embedder is None:
        sys.exit("The model isn't loaded: set SEMANTIC_SEARCH_ENABLED=true and EMBEDDING_MODEL_PATH.")
    with Session(get_engine()) as session:
        rows, summary = run(session, embedder)
        report = {"model": embedder.model_name, "summary": summary, "cases": rows}
        if args.compare_goals:
            report["goal_differences"] = compare_goals(session, embedder, args.compare_goals, rows)
    for row in rows:
        ok = row["false_positive"] is False if row["kind"] == "irrelevant" else row["top1"]
        print(f"{'ok  ' if ok else 'MISS'} {row['kind']:<12} {row['text']!r:<42} {row['top']}")
    print(json.dumps({"model": report["model"], "summary": summary}, indent=2))
    if args.compare_goals:
        print(f"goal-mode differences against {args.compare_goals}: {len(report['goal_differences'])}")
        for difference in report["goal_differences"]:
            print(" ", difference)
    if args.output:
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
