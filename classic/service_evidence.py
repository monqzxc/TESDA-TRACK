"""Display-safe service evidence; older/missing response fields remain unconfirmed."""
from datetime import datetime, timezone


def current_status(evidence: dict, expiry_key: str, known_status: str) -> str:
    status = evidence.get("status", "unknown")
    if status == known_status:
        try:
            expiry = datetime.fromisoformat(evidence[expiry_key].replace("Z", "+00:00"))
            if expiry <= datetime.now(timezone.utc):
                return "expired" if known_status == "verified" else "unknown"
            if evidence.get("valid_until"):
                if datetime.fromisoformat(evidence["valid_until"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                    return "expired" if known_status == "verified" else "unknown"
        except (KeyError, TypeError, ValueError):
            return "unknown"
    return status


def service_verified(item: dict) -> bool:
    evidence = item.get("verification") or {}
    return not evidence.get("is_synthetic", False) and current_status(evidence, "review_due_at", "verified") == "verified"


def can_apply(item: dict, eligibility: dict | None = None) -> bool:
    if any(rule.get("kind") == "verified_certification" for rule in (item.get("verification") or {}).get("requirements", [])):
        if not eligibility or eligibility.get("status") != "satisfied":
            return False
    if item.get("scheduled_at"):
        try:
            if datetime.fromisoformat(item["scheduled_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                return False
        except (TypeError, ValueError):
            return False
    if item.get("status", "open") != "open" or item.get("seats_left", 1) <= 0:
        return False
    return (service_verified(item) and item["verification"].get("requirements_reviewed", False)
            and not any(rule.get("kind") == "manual_review" for rule in item["verification"].get("requirements", []))
            and authorization_covers_schedule(item)
            and current_status(item.get("availability") or {}, "valid_until", "available") == "available")


def authorization_covers_schedule(item: dict) -> bool:
    evidence = item.get("verification") or {}
    if not item.get("scheduled_at"):
        return True
    try:
        scheduled = datetime.fromisoformat(item["scheduled_at"].replace("Z", "+00:00"))
        if evidence.get("valid_from") and datetime.fromisoformat(evidence["valid_from"].replace("Z", "+00:00")) > scheduled:
            return False
        if evidence.get("valid_until") and datetime.fromisoformat(evidence["valid_until"].replace("Z", "+00:00")) <= scheduled:
            return False
    except (TypeError, ValueError):
        return False
    return True


def evidence_messages(item: dict) -> list[str]:
    evidence = item.get("verification") or {}
    status = current_status(evidence, "review_due_at", "verified")
    if evidence.get("is_synthetic"):
        label = "Demonstration record — not a verified service"
    else:
        label = {"verified": "Service verified for this qualification", "expired": "Service verification expired",
                 "unavailable": "Service unavailable", "unknown": "Service requires verification"}.get(status,
                                                                                                         "Service requires verification")
    messages = [label]
    if evidence.get("source_name"):
        messages.append("Source: " + evidence["source_name"])
    if evidence.get("source_reference"):
        messages.append("Source reference: " + evidence["source_reference"])
    if evidence.get("reviewed_at"):
        messages.append("Reviewed: " + evidence["reviewed_at"][:10])
    if evidence.get("review_due_at"):
        messages.append("Review due: " + evidence["review_due_at"][:10])
    if not authorization_covers_schedule(item):
        messages.append("Service authorization does not cover the scheduled assessment date")
    available = current_status(item.get("availability") or {}, "valid_until", "available")
    if available != "available":
        messages.append("Intake unavailable" if available == "unavailable" else "Intake availability requires confirmation")
    if not evidence.get("requirements_reviewed"):
        messages.append("Mandatory prerequisites require verification")
    messages.extend(f"Prerequisite: {rule['description']}" for rule in evidence.get("requirements", []))
    return messages
