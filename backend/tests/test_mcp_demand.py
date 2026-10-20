"""The quarterly demand tool: whole quarters only, and counts under five are never published."""
from datetime import date, datetime, timedelta

import pytest

from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.reports import QualificationDemand
from tesda_track.services import reports
from tesda_track.services.match_stats import PHILIPPINE_TIME


def demand(code, **counts):
    values = dict(top_match=0, chosen=0, readiness_checks=0, average_readiness=None, assessment_applications=0,
                  competent=0, certified=0)
    values.update(counts)
    return QualificationDemand(qualification=QualificationSummary(code=code, name=code, sector="Metals"), **values)


def test_hide_small_counts():
    assert reports.hide_small_counts({"a": 0, "b": 3, "c": 5}) == ({"a": 0, "b": None, "c": 5}, ["b"])


def test_quarter_range_bounds_and_errors():
    assert reports.quarter_range("2026-Q3").model_dump() == {"date_from": date(2026, 7, 1), "date_to": date(2026, 9, 30)}
    assert reports.quarter_range("2026-Q1").date_to == date(2026, 3, 31)
    assert reports.quarter_range("2026-Q4").date_to == date(2026, 12, 31)
    for bad in ("2026-Q5", "2026-Q0", "2026Q1", "26-Q1", "2026-q1", "2026-Q1 ", "", "2026-01-01"):
        with pytest.raises(ValueError):
            reports.quarter_range(bad)


def test_demand_tool_hides_and_drops(mcp, partner, monkeypatch):
    rows = [demand("LOW", top_match=1, chosen=2, certified=4),
            demand("MID", top_match=7, competent=2, readiness_checks=4, average_readiness=61.0)]
    seen = []
    monkeypatch.setattr(reports, "qualification_demand", lambda session, period: seen.append(period) or rows)
    result = mcp.tool(partner(scopes=("reports:read",)).headers, "get_qualification_demand", quarter="2025-Q1")
    assert not result.get("isError")
    out = result["structuredContent"]
    assert out["quarter"] == "2025-Q1" and out["date_from"] == "2025-01-01" and out["date_to"] == "2025-03-31"
    assert seen[0].date_from == date(2025, 1, 1)
    [row] = out["rows"]
    assert row["qualification"]["code"] == "MID" and row["top_match"] == 7
    assert row["competent"] is None and row["readiness_checks"] is None and row["average_readiness"] is None
    assert row["hidden"] == ["competent", "readiness_checks"]


def test_demand_tool_filters_by_code(mcp, partner, monkeypatch):
    monkeypatch.setattr(reports, "qualification_demand", lambda session, period: [
        demand("A", top_match=9), demand("B", top_match=10)])
    result = mcp.tool(partner(scopes=("reports:read",)).headers, "get_qualification_demand",
                      quarter="2025-Q1", qualification_code="B")
    assert [row["qualification"]["code"] for row in result["structuredContent"]["rows"]] == ["B"]


def test_future_quarter_is_tool_error(mcp, partner):
    future = datetime.now(PHILIPPINE_TIME).date() + timedelta(days=400)
    label = f"{future.year}-Q{(future.month - 1) // 3 + 1}"
    result = mcp.tool(partner(scopes=("reports:read",)).headers, "get_qualification_demand", quarter=label)
    assert result["isError"] is True
    assert label not in result["content"][0]["text"]


def test_bad_quarter_is_tool_error(mcp, partner):
    result = mcp.tool(partner(scopes=("reports:read",)).headers, "get_qualification_demand", quarter="2025-Q9")
    assert result["isError"] is True and "2025-Q9" not in result["content"][0]["text"]


def test_demand_needs_reports_scope(mcp, partner):
    response = mcp.call(partner().headers, "tools/call",
                        {"name": "get_qualification_demand", "arguments": {"quarter": "2025-Q1"}})
    assert response.json()["error"]["code"] == -32602


def test_demand_has_no_date_range_inputs(mcp, partner):
    response = mcp.call(partner(scopes=("reports:read",)).headers, "tools/list")
    [tool] = [t for t in response.json()["result"]["tools"] if t["name"] == "get_qualification_demand"]
    properties = tool["inputSchema"]["properties"]
    assert "quarter" in properties and "date_from" not in properties and "date_to" not in properties
