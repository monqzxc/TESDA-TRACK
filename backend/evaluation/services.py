"""Independent checks on public recommendation evidence, not the ranker's filtering helpers."""
from datetime import date, datetime, time, timezone
from decimal import Decimal
from math import isfinite
from zoneinfo import ZoneInfo

PHILIPPINE_TIME = ZoneInfo("Asia/Manila")


def stamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Evidence timestamps must be timezone-aware")
    return result


def constraint_violations(kind: str, request: dict, response: dict, now=None) -> list[str]:
    """One diagnostic per violated rule; no learner answers or credentials in diagnostics."""
    now = now or datetime.now(timezone.utc)
    checked = stamp(response["checked_at"]) if response.get("checked_at") else now
    day = checked.astimezone(PHILIPPINE_TIME).date()
    problems = []
    pref = (request.get("assessment") or {}).get("preferences", {})
    distance_limit = request.get("maximum_distance_km", pref.get("maximum_distance_km"))
    for result in response.get("results", []):
        item = result.get("schedule" if kind == "assessment" else "program")
        if item is None:
            problems.append("wrong_result_type")
            continue
        label = str(item["id"])
        add = lambda reason: problems.append(f"{label}:{reason}")
        if item["qualification"]["code"] != request["qualification_code"]:
            add("wrong_qualification")
        if result.get("eligibility", {}).get("status") != "satisfied":
            add("prerequisites_not_satisfied")
        evidence = item.get("verification", {})
        if evidence.get("status") != "verified" or evidence.get("is_synthetic"):
            add("service_not_verified")
        if not evidence.get("requirements_reviewed") or not evidence.get("source_reference") or not evidence.get("source_name"):
            add("missing_authoritative_source")
        try:
            if stamp(evidence["reviewed_at"]) > checked or stamp(evidence["review_due_at"]) <= checked:
                add("stale_service_review")
        except (KeyError, ValueError, TypeError):
            add("invalid_review_timestamps")
        available = item.get("availability", {})
        if kind == "assessment" or request.get("require_confirmed_availability"):
            if available.get("status") != "available" or not available.get("source_reference"):
                add("availability_not_confirmed")
            try:
                if stamp(available["checked_at"]) > checked or stamp(available["valid_until"]) <= checked:
                    add("stale_availability")
            except (KeyError, ValueError, TypeError):
                add("invalid_availability_timestamps")
        if distance_limit is not None:
            distance = item.get("distance_km")
            # Public distances are rounded to one decimal, while the ranker compares the unrounded distance.
            if distance is None or distance > distance_limit + 0.05:
                add("mandatory_distance")
        start = end = None
        if kind == "assessment":
            scheduled = stamp(item["scheduled_at"])
            start = end = scheduled
            if item.get("status") != "open" or scheduled <= checked or item.get("seats_left", 0) <= 0:
                add("not_open_future_with_seats")
            if request.get("fee_is_mandatory"):
                if item.get("fee") is None or Decimal(str(item["fee"])) > Decimal(str(request["maximum_fee"])):
                    add("mandatory_fee")
            if request.get("schedule_is_mandatory"):
                scheduled_day = scheduled.astimezone(PHILIPPINE_TIME).date().isoformat()
                if request.get("scheduled_after") and scheduled_day < request["scheduled_after"] or request.get("scheduled_before") and scheduled_day > request["scheduled_before"]:
                    add("mandatory_schedule")
        else:
            if not item.get("is_active"):
                add("inactive_program")
            if item.get("end_date") and item["end_date"] < day.isoformat():
                add("finished_program")
            if item.get("start_date"):
                start = datetime.combine(date.fromisoformat(item["start_date"]), time.min, PHILIPPINE_TIME)
                end = datetime.combine(date.fromisoformat(item["end_date"]), time.max, PHILIPPINE_TIME) if item.get("end_date") else start
            if pref.get("budget_is_mandatory"):
                if item.get("cost") is None or Decimal(str(item["cost"])) > Decimal(str(pref["maximum_budget"])):
                    add("mandatory_budget")
            if pref.get("delivery_is_mandatory") and item.get("delivery_mode") != request.get("preferred_delivery_mode", pref.get("delivery_mode")):
                add("mandatory_delivery")
            if pref.get("scholarship_is_mandatory") and not item.get("scholarship_available"):
                add("mandatory_scholarship")
            if pref.get("schedule_is_mandatory"):
                start_day = item.get("start_date")
                if not start_day or pref.get("start_after") and start_day < pref["start_after"] or pref.get("start_before") and start_day > pref["start_before"]:
                    add("mandatory_schedule")
        if start is not None:
            if evidence.get("valid_from") and stamp(evidence["valid_from"]) > start or evidence.get("valid_until") and stamp(evidence["valid_until"]) <= end:
                add("authorization_does_not_cover_dates")
        score = result.get("score")
        if score is None or not isfinite(score) or not 0 <= score <= 100:
            add("invalid_score")
        details = result.get("personalization")
        if details and score != round(sum(details["contributions"].values())):
            add("score_arithmetic")
    for item in response.get("requires_verification", []):
        if "score" in item:
            problems.append("unconfirmed_listing_has_score")
    return problems
