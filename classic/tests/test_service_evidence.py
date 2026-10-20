from datetime import datetime, timedelta, timezone

from service_evidence import can_apply, evidence_messages, service_verified


def test_certificate_prerequisite_needs_learner_eligibility_not_self_report():
    record = {"verification": {"status": "verified", "requirements_reviewed": True,
        "review_due_at": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        "requirements": [{"kind": "verified_certification"}]},
        "availability": {"status": "available", "valid_until": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()}}
    assert not can_apply(record)
    assert not can_apply(record, {"status": "unknown"})
    assert can_apply(record, {"status": "satisfied"})


def test_missing_fields_and_expired_cached_verification_fail_closed():
    assert not can_apply({}) and not service_verified({})
    assert "Service requires verification" in evidence_messages({})
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    item = {"verification": {"status": "verified", "review_due_at": future, "requirements_reviewed": True},
            "availability": {"status": "available", "valid_until": future}}
    assert can_apply(item)
    item["verification"]["review_due_at"] = past
    assert not can_apply(item)
    assert "Service verification expired" in evidence_messages(item)


def test_stale_availability_and_synthetic_records_never_enable_applications():
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    item = {"verification": {"status": "verified", "review_due_at": future, "requirements_reviewed": True},
            "availability": {"status": "available"}}
    assert not can_apply(item)
    item["availability"]["valid_until"] = future
    item["verification"]["is_synthetic"] = True
    assert not can_apply(item)


def test_authorization_expiring_before_assessment_disables_application():
    now = datetime.now(timezone.utc)
    item = {"verification": {"status": "verified", "requirements_reviewed": True,
                             "review_due_at": (now + timedelta(days=30)).isoformat(),
                             "valid_until": (now + timedelta(days=7)).isoformat()},
            "availability": {"status": "available", "valid_until": (now + timedelta(days=2)).isoformat()},
            "scheduled_at": (now + timedelta(days=14)).isoformat()}
    assert service_verified(item)
    assert not can_apply(item)


def test_manual_requirements_cannot_enable_applications():
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    item = {"verification": {"status": "verified", "review_due_at": future, "requirements_reviewed": True,
                             "requirements": [{"kind": "manual_review", "description": "Entry documents"}]},
            "availability": {"status": "available", "valid_until": future}}
    assert not can_apply(item)
