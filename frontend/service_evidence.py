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


def can_apply(item: dict) -> bool:
    return (service_verified(item) and item["verification"].get("requirements_reviewed", False)
            and current_status(item.get("availability") or {}, "valid_until", "available") == "available")


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
    available = current_status(item.get("availability") or {}, "valid_until", "available")
    if available != "available":
        messages.append("Intake unavailable" if available == "unavailable" else "Intake availability requires confirmation")
    if not evidence.get("requirements_reviewed"):
        messages.append("Mandatory prerequisites require verification")
    messages.extend(f"Prerequisite: {rule['description']}" for rule in evidence.get("requirements", []))
    return messages
