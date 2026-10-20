"""Independent metric arithmetic and safe dataset handling."""
import math
from datetime import datetime, timezone
import pytest

from evaluation.metrics import percentile, relevance, summarize
from evaluation.qualifications import Case, Dataset
from evaluation.services import constraint_violations


def test_graded_ndcg_mrr_and_missing_slots():
    result = relevance(["B", "A"], {"A": 3, "B": 1, "C": 0}, 3)
    assert result["precision_at_k"] == pytest.approx(2 / 3)
    assert result["recall_at_k"] == 1
    assert result["mrr_at_k"] == 1
    assert result["ndcg_at_k"] == pytest.approx((1 + 7 / math.log2(3)) / (7 + 1 / math.log2(3)))
    assert relevance(["C", "A"], {"A": 3, "C": 0})["mrr_at_k"] == 0.5
    assert relevance([], {"A": 3})["ndcg_at_k"] == 0


def test_unjudged_are_counted_not_claimed_irrelevant():
    result = relevance(["X", "A"], {"A": 3})
    assert result["unjudged_at_k"] == 1 and result["precision_at_k"] == pytest.approx(1 / 3)
    assert relevance([], {})["ndcg_at_k"] is None


@pytest.mark.parametrize("shown,judgments,k", [(["A", "A"], {"A": 3}, 3), ([], {"A": 4}, 3), ([], {}, 0)])
def test_invalid_metrics_are_rejected(shown, judgments, k):
    with pytest.raises(ValueError):
        relevance(shown, judgments, k)


def test_latency_percentiles_and_summary_keep_absent_measurements_null():
    assert percentile([0, 10, 20], 95) == 19
    assert percentile([], 95) is None
    empty = summarize([])
    assert empty["warm_p95_ms"] is None and empty["ndcg_at_k"] is None
    report = summarize([
        {"shown": ["A"], "judgments": {"A": 3}, "stable": False, "violations": ["x"], "warm_latency_ms": [10, 20]},
        {"shown": ["B"], "judgments": {}, "expect_empty": True, "violations": ["y"], "warm_latency_ms": [30]},
    ])
    assert report["constraint_violations"] == 2 and report["unstable_cases"] == 1
    assert report["negative_abstention_rate"] == 0 and report["warm_p50_ms"] == 20


def test_expert_review_cannot_be_claimed_without_reviewers():
    case = Case(id="empty", language="none", tags=[], answers={}, judgments={}, expect_empty=True)
    with pytest.raises(ValueError):
        Dataset(version="v1", provenance="Synthetic", review_status="expert_reviewed", cases=[case])
    with pytest.raises(ValueError):
        Dataset(version="v1", provenance="Synthetic", review_status="engineering_draft", cases=[case, case])


def test_independent_checker_detects_fabricated_service_claims_and_mandatory_fee():
    now = datetime(2030, 1, 1, tzinfo=timezone.utc)
    request = {"qualification_code": "QUAL", "maximum_fee": "100", "fee_is_mandatory": True}
    response = {"results": [{"score": 100, "eligibility": {"status": "unknown"}, "schedule": {
        "id": 1, "qualification": {"code": "OTHER"}, "scheduled_at": "2030-02-01T00:00:00Z",
        "seats_left": 0, "status": "open", "fee": "500", "verification": {"status": "unknown"}}}],
        "requires_verification": [{"score": 100}]}
    violations = constraint_violations("assessment", request, response, now)
    for reason in ("wrong_qualification", "prerequisites_not_satisfied", "service_not_verified",
                   "missing_authoritative_source", "availability_not_confirmed", "not_open_future_with_seats", "mandatory_fee"):
        assert f"1:{reason}" in violations
    assert "unconfirmed_listing_has_score" in violations
