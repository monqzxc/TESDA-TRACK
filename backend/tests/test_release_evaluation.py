"""Measure the real APIs against independent synthetic service expectations; every write rolls back."""
import json
import os
import time
from datetime import timedelta
from pathlib import Path

from sqlmodel import select

from evaluation.metrics import summarize
from evaluation.services import constraint_violations
from tesda_track.models import AssessmentSchedule, RankingAudit, utcnow
from backend.tests.conftest import available_fixture
from backend.tests.test_verification import prerequisite


def test_service_evaluation_and_scaling(client, session, make_center, make_schedule, make_program, verify_service):
    # Grades reflect stated logistics, not hidden engine components. IDs are created in this isolated test DB.
    near = make_center(name="Test-only nearby assessment", location=(14.6, 121.0))
    far = make_center(name="Test-only remote assessment", region_code="VII", location=(10.3, 123.9))
    cheap = make_schedule(center=near, fee="300")
    expensive = make_schedule(center=far, fee="2500")
    unknown_fee = make_schedule(fee=None)
    unverified = make_schedule(verified=False)
    unavailable = make_schedule(availability_status="unavailable")
    manual = make_schedule()
    verify_service("assessment", manual["center"]["id"], requirements=[prerequisite("manual_review")])
    certificate_needed = make_schedule()
    verify_service("assessment", certificate_needed["center"]["id"], requirements=[prerequisite()])
    expired = make_schedule()
    verify_service("assessment", expired["center"]["id"], status="expired")
    program = make_program(cost="300", start_date=(utcnow().date() + timedelta(days=5)).isoformat(), **available_fixture())
    expensive_program = make_program(cost="2500", start_date=(utcnow().date() + timedelta(days=5)).isoformat(), **available_fixture())
    unknown_program = make_program(cost=None, **available_fixture())
    unverified_program = make_program(verified=False)
    base = {"qualification_code": "SMAW-NC-II", "limit": 50}
    cases = [
        ("assessment-fee", "assessment", {"maximum_fee": "500"}, {str(cheap['id']): 3, str(unknown_fee['id']): 0, str(expensive['id']): 0}, False),
        ("assessment-hard-fee", "assessment", {"maximum_fee": "500", "fee_is_mandatory": True}, {str(cheap['id']): 3}, False),
        ("assessment-hard-distance", "assessment", {"near_lat": 14.6, "near_lon": 121.0, "maximum_distance_km": 10}, {str(cheap['id']): 3, str(unknown_fee['id']): 2}, False),
        ("assessment-hard-date", "assessment", {"scheduled_before": utcnow().date().isoformat(), "schedule_is_mandatory": True}, {}, True),
        ("assessment-no-zero-fee", "assessment", {"maximum_fee": "0", "fee_is_mandatory": True}, {}, True),
        ("assessment-self-report-not-certificate", "assessment", {"assessment": {"has_certification": True, "experience_years": 20}}, {str(cheap['id']): 1, str(expensive['id']): 1, str(unknown_fee['id']): 1}, False),
        ("training-soft-budget", "training", {"assessment": {"interests": ["welding"], "preferences": {"maximum_budget": "500"}}, "require_confirmed_availability": True}, {str(program['id']): 3, str(expensive_program['id']): 0, str(unknown_program['id']): 0}, False),
        ("training-hard-budget", "training", {"assessment": {"preferences": {"maximum_budget": "500", "budget_is_mandatory": True}}, "require_confirmed_availability": True}, {str(program['id']): 3}, False),
        ("training-no-zero-budget", "training", {"assessment": {"preferences": {"maximum_budget": "0", "budget_is_mandatory": True}}, "require_confirmed_availability": True}, {}, True),
    ]
    rows = []
    for case_id, kind, fields, judgments, empty in cases:
        body = {**base, **fields}
        path = f"/api/v1/recommendations/{'assessments' if kind == 'assessment' else 'training'}"
        warm_latencies, snapshot, stable, violations, response = [], None, True, [], None
        for repetition in range(4):
            start = time.perf_counter()
            reply = client.post(path, json=body)
            elapsed = 1000 * (time.perf_counter() - start)
            assert reply.status_code == 200
            response = reply.json()
            violations.extend(constraint_violations(kind, body, response))
            key = "schedule" if kind == "assessment" else "program"
            current = [(r[key]["id"], r["score"], r.get("personalization")) for r in response["results"]]
            if snapshot is None:
                snapshot = current
            else:
                stable &= current == snapshot
                warm_latencies.append(elapsed)
            forbidden = {unverified["id"], unavailable["id"], manual["id"], certificate_needed["id"], expired["id"]} if kind == "assessment" else {unverified_program["id"]}
            if any(item[0] in forbidden for item in current):
                violations.append("forbidden_candidate_recommended")
        shown = [str(r[0]) for r in snapshot]
        if empty and shown:
            violations.append("expected_abstention")
        rows.append({"id": case_id, "kind": kind, "judgments": judgments, "shown": shown, "expect_empty": empty,
                     "stable": stable, "violations": sorted(set(violations)), "warm_latency_ms": warm_latencies})
    # Add 250 schedules in one transaction, beyond the public search page size of 100.
    template = session.get(AssessmentSchedule, cheap["id"])
    for _ in range(250):
        session.add(AssessmentSchedule(center_id=template.center_id, qualification_id=template.qualification_id,
            scheduled_at=template.scheduled_at, slots=2, fee=300, **available_fixture()))
    session.flush()
    scaling = []
    for limit, offset in ((5, 0), (50, 0), (5, 100)):
        start = time.perf_counter()
        response = client.post("/api/v1/recommendations/assessments", json={**base, "limit": limit, "offset": offset}).json()
        elapsed = 1000 * (time.perf_counter() - start)
        assert response["total"] == 253
        assert len(response["results"]) == limit
        assert not constraint_violations("assessment", base, response)
        scaling.append({"eligible_candidates": response["total"], "limit": limit, "offset": offset, "latency_ms": elapsed})
    report = {"evaluation_version": "service-evaluation-v1", "review_status": "engineering_draft",
              "provenance": "Independent synthetic logistics and failure scenarios; source evidence exists only in the isolated test transaction.",
              "summary": summarize(rows), "cases": rows, "scaling": scaling,
              "limitations": ["Sequential in-process HTTP adapter, local database, no network transport or concurrent-user load.",
                              "Engineering relevance grades need expert review; fixtures do not establish production accreditation."]}
    if os.environ.get("TESDA_SERVICE_EVALUATION_REPORT"):
        output = Path(os.environ["TESDA_SERVICE_EVALUATION_REPORT"])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    assert report["summary"]["constraint_violations"] == 0
    assert report["summary"]["unstable_cases"] == 0
    assert report["summary"]["negative_abstention_rate"] == 1
    assert report["summary"]["warm_p95_ms"] < 1500, "Provisional local sequential latency budget, not a production SLA"
    assert max(r["latency_ms"] for r in scaling) < 3000
    # Ranking audits retain neither questionnaire answers nor literal interests/goals.
    assert all("interests" not in r.preferences and "career_goal" not in r.preferences for r in session.exec(select(RankingAudit)))
