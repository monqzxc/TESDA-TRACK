"""Evaluate the actual structured qualification policy on the full committed catalog.

Run from backend/: python -m evaluation.qualifications --output ../reports/qualification-evaluation.json
This needs no database, model download, external API, or real learner data.
"""
import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from evaluation.metrics import summarize
from tesda_track.config import get_settings
from tesda_track.schemas.learner_assessments import AssessmentAnswers
from tesda_track.services.analysis import structured_matches
from tesda_track.seed import SEED_DIR
from training.catalog import load_catalog

DEFAULT_CASES = Path(__file__).with_name("data") / "qualification_cases_v1.json"


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    language: str
    tags: list[str]
    answers: AssessmentAnswers
    judgments: dict[str, StrictInt]
    expect_empty: bool = False

    @model_validator(mode="after")
    def valid_grades(self):
        if any(isinstance(g, bool) or not 0 <= g <= 3 for g in self.judgments.values()):
            raise ValueError("Grades must be 0..3")
        if self.expect_empty and any(self.judgments.values()):
            raise ValueError("A negative case cannot have relevant judgments")
        if not self.expect_empty and not any(self.judgments.values()):
            raise ValueError("A positive case requires relevance judgments")
        return self


class Dataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str
    review_status: str
    provenance: str
    reviewers: list[str] = Field(default_factory=list)
    cases: list[Case] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_cases(self):
        if len({c.id for c in self.cases}) != len(self.cases):
            raise ValueError("Case IDs must be unique")
        if self.review_status not in ("engineering_draft", "expert_reviewed"):
            raise ValueError("Unknown review status")
        if self.review_status == "expert_reviewed" and not self.reviewers:
            raise ValueError("Reviewed cases require named reviewers")
        return self


def evaluate(dataset: Dataset, repeats: int = 5, k: int = 3) -> dict:
    if repeats < 2 or not 1 <= k <= 50:
        raise ValueError("Use at least two repeats and k from 1 to 50")
    start = time.perf_counter()
    _, items = load_catalog()
    load_ms = 1000 * (time.perf_counter() - start)
    known = {item.code for item in items}
    rows = []
    for case in dataset.cases:
        referenced = set(case.judgments) | set(case.answers.preferred_qualification_codes)
        if referenced - known:
            raise ValueError(f"Unknown catalog codes in case {case.id}: {sorted(referenced - known)}")
        if case.answers.competencies:
            raise ValueError("Offline cases must not use database-specific competency IDs")
        # First call is measured separately; all later calls use the same catalog and policy.
        first_start = time.perf_counter()
        first = structured_matches(items, case.answers, k)
        first_ms = 1000 * (time.perf_counter() - first_start)
        identity = lambda results: [(r.qualification.code, r.score, r.personalization.model_dump()) for r in results]
        snapshot = identity(first)
        timings, stable = [], True
        for _ in range(repeats):
            started = time.perf_counter()
            again = structured_matches(items, case.answers, k)
            timings.append(1000 * (time.perf_counter() - started))
            stable &= identity(again) == snapshot
        violations = []
        for result in first:
            if result.qualification.code not in known:
                violations.append("unknown_qualification")
            if result.score != round(sum(result.personalization.contributions.values())):
                violations.append("score_arithmetic")
        if case.expect_empty and first:
            violations.append("negative_case_received_recommendation")
        rows.append({"id": case.id, "language": case.language, "tags": case.tags,
                     "judgments": case.judgments, "shown": [r.qualification.code for r in first],
                     "scores": [r.score for r in first], "expect_empty": case.expect_empty,
                     "stable": stable, "violations": violations, "first_call_ms": first_ms, "warm_latency_ms": timings})
    summary = summarize(rows, k)
    return {"evaluation_version": "qualification-evaluation-v1", "generated_at": datetime.now(timezone.utc).isoformat(),
            "policy_version": "structured-assessment-v1", "dataset_version": dataset.version,
            "review_status": dataset.review_status, "reviewers": dataset.reviewers, "provenance": dataset.provenance,
            "catalog_sha256": hashlib.sha256((SEED_DIR / "qualifications.json").read_bytes()).hexdigest(),
            "catalog_size": len(items), "catalog_load_ms": load_ms, "python": platform.python_version(),
            "configured_weights": get_settings().personalization_weights.model_dump(), "summary": summary,
            "by_language": {key: summarize([r for r in rows if r["language"] == key], k) for key in sorted({r["language"] for r in rows})},
            "cases": rows, "limitations": ["Draft judgments are provisional engineering expectations, not expert or scientific validation.",
                "Unjudged results receive zero relevance credit for calculation but remain explicitly unjudged.",
                "Latency is local sequential policy execution; it excludes HTTP, database access and concurrent load."]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--k", type=int, default=3)
    parser.add_argument("--max-p95-ms", type=float, default=1000, help="Provisional local latency gate")
    parser.add_argument("--min-top1", type=float, default=0.8, help="Provisional draft relevance gate; expert review is still required")
    args = parser.parse_args(argv)
    if args.max_p95_ms <= 0:
        parser.error("max-p95-ms must be positive")
    if not 0 <= args.min_top1 <= 1:
        parser.error("min-top1 must be from zero to one")
    dataset = Dataset.model_validate_json(args.cases.read_text(encoding="utf-8"))
    report = evaluate(dataset, args.repeats, args.k)
    report["dataset_sha256"] = hashlib.sha256(args.cases.read_bytes()).hexdigest()
    summary = report["summary"]
    report["engineering_gate_passed"] = not (summary["constraint_violations"] or summary["unstable_cases"] or
                                               summary["warm_p95_ms"] > args.max_p95_ms)
    report["expert_review_complete"] = dataset.review_status == "expert_reviewed"
    report["relevance_gate_passed"] = summary["top1_relevance"] is not None and summary["top1_relevance"] >= args.min_top1
    report["minimum_top1_relevance"] = args.min_top1
    report["max_p95_ms"] = args.max_p95_ms
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "summary": summary,
                      "engineering_gate_passed": report["engineering_gate_passed"],
                      "relevance_gate_passed": report["relevance_gate_passed"],
                      "expert_review_complete": report["expert_review_complete"]}, indent=2))
    return 0 if report["engineering_gate_passed"] and report["relevance_gate_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
