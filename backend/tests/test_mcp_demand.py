"""The quarterly demand tool: whole, finished quarters only, distinct learners, counts under five never published."""
import uuid
from datetime import date, datetime, timedelta

import pytest

from tesda_track.models import ReadinessCheck
from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.reports import LearnerDemand
from tesda_track.services import reports
from tesda_track.services.match_stats import PHILIPPINE_TIME


def demand(code, **counts):
    values = dict(top_matched=0, chose=0, checked_readiness=0, average_readiness=None, applied=0, competent=0,
                  certified=0)
    values.update(counts)
    return LearnerDemand(qualification=QualificationSummary(code=code, name=code, sector="Metals"), **values)


def test_hide_small_counts():
    assert reports.hide_small_counts({"a": 0, "b": 3, "c": 5}) == ({"a": 0, "b": None, "c": 5}, ["b"])


def test_quarter_range_bounds_and_errors():
    assert reports.quarter_range("2026-Q3").model_dump() == {"date_from": date(2026, 7, 1), "date_to": date(2026, 9, 30)}
    assert reports.quarter_range("2026-Q1").date_to == date(2026, 3, 31)
    assert reports.quarter_range("2026-Q4").date_to == date(2026, 12, 31)
    for bad in ("2026-Q5", "2026-Q0", "2026Q1", "26-Q1", "2026-q1", "2026-Q1 ", "", "2026-01-01",
                "\u0662\u0660\u0662\u0666-Q1"):
        with pytest.raises(ValueError):
            reports.quarter_range(bad)


REPORTS = ("reports:read",)


def ask(mcp, partner, **arguments):
    return mcp.tool(partner(scopes=REPORTS).headers, "get_qualification_demand", **arguments)


def test_demand_tool_hides_and_drops(mcp, partner, monkeypatch):
    rows = [demand("LOW", top_matched=1, chose=2, certified=4),
            demand("MID", top_matched=7, competent=2, checked_readiness=4, average_readiness=61.0)]
    seen = []
    monkeypatch.setattr(reports, "qualification_demand_by_learners",
                        lambda session, period: seen.append(period) or rows)
    result = ask(mcp, partner, quarter="2025-Q1")
    assert not result.get("isError")
    out = result["structuredContent"]
    assert out["quarter"] == "2025-Q1" and out["date_from"] == "2025-01-01" and out["date_to"] == "2025-03-31"
    assert seen[0].date_from == date(2025, 1, 1)
    [row] = out["rows"]
    assert row["qualification"]["code"] == "MID" and row["learners_top_matched"] == 7
    assert row["learners_competent"] is None and row["learners_checked_readiness"] is None
    assert row["average_readiness"] is None
    assert row["learners_chose"] == 0 and row["learners_certified"] == 0
    assert row["hidden"] == ["learners_checked_readiness", "learners_competent"]


def test_average_shown_from_five_learners_and_zero_stays_zero(mcp, partner, monkeypatch):
    rows = [demand("OK", chose=9, checked_readiness=5, average_readiness=72.5),
            demand("NONE", chose=6, checked_readiness=0)]
    monkeypatch.setattr(reports, "qualification_demand_by_learners", lambda session, period: rows)
    ok, none = ask(mcp, partner, quarter="2025-Q1")["structuredContent"]["rows"]
    assert ok["average_readiness"] == 72.5 and ok["hidden"] == []
    assert none["learners_checked_readiness"] == 0 and none["average_readiness"] is None and none["hidden"] == []


def test_row_mixing_visible_and_hidden_counts(mcp, partner, monkeypatch):
    monkeypatch.setattr(reports, "qualification_demand_by_learners", lambda session, period: [
        demand("MIX", chose=12, applied=3, certified=5)])
    [row] = ask(mcp, partner, quarter="2025-Q1")["structuredContent"]["rows"]
    assert (row["learners_chose"], row["learners_applied"], row["learners_certified"]) == (12, None, 5)
    assert row["hidden"] == ["learners_applied"]


def test_demand_tool_filters_by_code(mcp, partner, monkeypatch):
    monkeypatch.setattr(reports, "qualification_demand_by_learners", lambda session, period: [
        demand("A", chose=9), demand("B", chose=10)])
    result = ask(mcp, partner, quarter="2025-Q1", qualification_code="B")
    assert [row["qualification"]["code"] for row in result["structuredContent"]["rows"]] == ["B"]


def test_open_and_future_quarters_are_tool_errors(mcp, partner):
    today = datetime.now(PHILIPPINE_TIME).date()
    headers = partner(scopes=REPORTS).headers
    for day in (today, today + timedelta(days=400)):
        label = f"{day.year}-Q{(day.month - 1) // 3 + 1}"
        result = mcp.tool(headers, "get_qualification_demand", quarter=label)
        assert result["isError"] is True
        assert label not in result["content"][0]["text"]


def dated_checks(client, session, headers, competency_ids, whens, answer="confident"):
    answers = {str(i): answer for i in competency_ids("SMAW-NC-II")}
    for when in whens:
        response = client.post("/api/v1/me/readiness-checks", headers=headers,
                               json={"qualification_code": "SMAW-NC-II", "answers": answers})
        assert response.status_code == 201, response.text
        check = session.get(ReadinessCheck, uuid.UUID(response.json()["id"]))
        check.created_at = when
        session.flush()


def manila(*args):
    return datetime(*args, tzinfo=PHILIPPINE_TIME)


def test_one_learner_with_many_checks_counts_once(client, session, mcp, partner, learner, competency_ids):
    dated_checks(client, session, learner, competency_ids, [manila(2025, 2, 10, 9, n) for n in range(5)])
    [smaw] = [r for r in reports.qualification_demand_by_learners(session, reports.quarter_range("2025-Q1"))
              if r.qualification.code == "SMAW-NC-II"]
    assert smaw.checked_readiness == 1
    assert ask(mcp, partner, quarter="2025-Q1")["structuredContent"]["rows"] == []


def test_average_uses_each_learners_latest_check(client, session, mcp, partner, register, login, competency_ids):
    for n in range(5):
        register(f"learner{n}@example.com")
        headers = login(f"learner{n}@example.com")
        dated_checks(client, session, headers, competency_ids, [manila(2025, 1, 5)], answer="not_familiar")
        dated_checks(client, session, headers, competency_ids, [manila(2025, 3, 5)], answer="confident")
    [row] = ask(mcp, partner, quarter="2025-Q1", qualification_code="SMAW-NC-II")["structuredContent"]["rows"]
    assert row["learners_checked_readiness"] == 5 and row["average_readiness"] == 100.0 and row["hidden"] == []


def test_quarter_boundaries_are_in_philippine_time(client, session, learner, competency_ids):
    dated_checks(client, session, learner, competency_ids,
                 [manila(2025, 3, 31, 23, 30), manila(2025, 4, 1, 0, 30)])
    def checked(label):
        return {r.qualification.code: r.checked_readiness for r in reports.qualification_demand_by_learners(
            session, reports.quarter_range(label))}["SMAW-NC-II"]
    assert checked("2025-Q1") == 1 and checked("2025-Q2") == 1


def test_bad_quarter_is_tool_error(mcp, partner):
    result = ask(mcp, partner, quarter="2025-Q9")
    assert result["isError"] is True and "2025-Q9" not in result["content"][0]["text"]


def test_demand_needs_reports_scope(mcp, partner):
    response = mcp.call(partner().headers, "tools/call",
                        {"name": "get_qualification_demand", "arguments": {"quarter": "2025-Q1"}})
    assert response.json()["error"]["code"] == -32602


def test_demand_has_no_date_range_inputs(mcp, partner):
    response = mcp.call(partner(scopes=REPORTS).headers, "tools/list")
    [tool] = [t for t in response.json()["result"]["tools"] if t["name"] == "get_qualification_demand"]
    properties = tool["inputSchema"]["properties"]
    assert "quarter" in properties and "date_from" not in properties and "date_to" not in properties
