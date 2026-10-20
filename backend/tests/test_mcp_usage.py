"""The MCP usage log (shapes only), per-client and per-tool rate limits, retention and the admin usage report."""
import contextvars
import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.mcp import deps
from tesda_track.mcp.scopes import TOOL_LIMITS
from tesda_track.models import NO_CLIENT, McpCallDaily, McpCallLog
from tesda_track.schemas.reports import DateRange
from tesda_track.services import mcp_usage
from tesda_track.services.ranking import goal_fingerprint
from tesda_track.services.partner_clients import revoke_client

GOAL = "gusto kong maging welder"


def rows(session, **filters):
    statement = select(McpCallLog).order_by(McpCallLog.id)
    for key, value in filters.items():
        statement = statement.where(getattr(McpCallLog, key) == value)
    return list(session.exec(statement))


def test_one_row_per_call_with_shape_only(mcp, partner, session):
    made = partner()
    result = mcp.tool(made.headers, "match_qualifications", goal=GOAL, limit=3)
    assert not result["isError"]
    [row] = rows(session, tool="match_qualifications")
    assert row.client_id == made.id and row.method == "tools/call" and row.outcome == "ok"
    assert row.inputs_sent == ["goal", "limit"]
    assert row.qualification_code is None and row.region_code is None
    assert row.result_count >= 1 and row.latency_ms >= 0
    assert row.protocol_version == "2026-07-28"


def test_goal_text_never_stored(mcp, partner, session, make_program):
    make_program()
    goal = "Ako si Juan Dela Cruz 09171234567, gusto kong maging welder"
    headers = partner().headers
    mcp.tool(headers, "match_qualifications", goal=goal)
    mcp.tool(headers, "rank_training_programs", qualification_code="SMAW-NC-II", goal=goal)
    for table in ("mcp_call_log", "ranking_audit"):
        dumped = session.execute(text(f"SELECT row_to_json(t)::text FROM {table} t")).scalars().all()
        assert dumped and not any("Juan" in row or "0917" in row for row in dumped)
    expected = goal_fingerprint(goal, get_settings().secret_key.get_secret_value())
    assert expected != hashlib.sha256(goal.encode()).hexdigest()
    ranked = rows(session, tool="rank_training_programs")[0]
    assert ranked.goal_fingerprint == expected
    assert ranked.ranking_audit_id is not None
    assert rows(session, tool="match_qualifications")[0].goal_fingerprint == expected


def test_coordinates_not_stored(mcp, partner, session, make_program):
    make_program()
    mcp.tool(partner().headers, "rank_training_programs", qualification_code="SMAW-NC-II",
             near_lat=14.59951, near_lon=120.98421)
    [row] = rows(session, tool="rank_training_programs")
    assert "near_lat" in row.inputs_sent and row.qualification_code == "SMAW-NC-II"
    dumped = session.execute(text("SELECT row_to_json(t)::text FROM mcp_call_log t")).scalars().all()
    assert not any("14.5995" in line or "120.9842" in line for line in dumped)


def test_tool_error_logged(mcp, partner, session):
    assert mcp.tool(partner().headers, "get_qualification", code="NOPE")["isError"]
    [row] = rows(session, tool="get_qualification")
    assert row.outcome == "tool_error"


def test_denied_scope_logged(mcp, partner, session):
    response = mcp.call(partner().headers, "tools/call", {"name": "get_qualification_demand", "arguments": {}})
    assert response.json()["error"]["code"] == -32602
    [row] = rows(session, tool="get_qualification_demand")
    assert row.outcome == "denied_scope"


def test_unknown_tool_logged_by_a_plain_name_only(mcp, partner, session):
    headers = partner().headers
    mcp.call(headers, "tools/call", {"name": "no_such_tool", "arguments": {}})
    mcp.call(headers, "tools/call", {"name": "Juan Dela Cruz 0917", "arguments": {}})
    first, second = rows(session, method="tools/call")
    assert first.outcome == "denied_scope" and first.tool == "no_such_tool"
    assert second.outcome == "denied_scope" and second.tool is None


def test_tools_list_logged_with_count(mcp, partner, session):
    mcp.call(partner().headers, "tools/list")
    [row] = rows(session, method="tools/list")
    assert row.outcome == "ok" and row.tool is None and row.result_count == 8


def test_revoked_token_logged_with_client(mcp, partner, session):
    made = partner()
    revoke_client(session, made.id)
    session.flush()
    assert mcp.call(made.headers, "tools/list").status_code == 401
    [row] = rows(session, outcome="denied_token")
    assert row.client_id == made.id and row.error_code == "revoked" and row.method == "http"


def test_garbage_token_logged_without_client(mcp, session):
    assert mcp.call({"Authorization": "Bearer nonsense"}, "tools/list").status_code == 401
    [row] = rows(session, outcome="denied_token")
    assert row.client_id is None and row.error_code == "malformed"


def test_per_tool_rate_limit(mcp, partner, session, monkeypatch):
    monkeypatch.setitem(TOOL_LIMITS, "get_regional_supply", 2)
    headers = partner().headers
    for _ in range(2):
        assert not mcp.tool(headers, "get_regional_supply")["isError"]
    error = mcp.call(headers, "tools/call", {"name": "get_regional_supply", "arguments": {}}).json()["error"]
    assert error["code"] == -32000 and error["data"]["retry_after"] > 0
    assert error["message"].startswith("Rate limit exceeded; retry in ")
    assert [row.outcome for row in rows(session, tool="get_regional_supply")] == ["ok", "ok", "rate_limited"]


def test_client_rate_limit(mcp, partner, session):
    headers = partner(rate_limit=3).headers
    mcp.tool(headers, "get_regional_supply")
    mcp.tool(headers, "get_qualification", code="SMAW-NC-II")
    mcp.tool(headers, "search_training_programs")
    response = mcp.call(headers, "tools/call", {"name": "get_qualification", "arguments": {"code": "SMAW-NC-II"}})
    assert response.json()["error"]["code"] == -32000
    assert rows(session)[-1].outcome == "rate_limited"


def test_rate_limits_are_per_client(mcp, partner):
    first, second = partner("First", rate_limit=1), partner("Second", rate_limit=1)
    assert not mcp.tool(first.headers, "get_regional_supply")["isError"]
    assert not mcp.tool(second.headers, "get_regional_supply")["isError"]


def test_log_failure_does_not_break_call(mcp, partner, monkeypatch, caplog):
    def broken(**fields):
        raise RuntimeError("disk full with Juan inside")

    monkeypatch.setattr(mcp_usage, "McpCallLog", broken)
    result = mcp.tool(partner().headers, "get_regional_supply")
    assert not result["isError"] and result["structuredContent"]
    assert "RuntimeError" in caplog.text and "Juan" not in caplog.text


def test_taking_the_ranking_audit_clears_it():
    deps.begin_ranking_audit()
    contextvars.copy_context().run(deps.note_ranking_audit, 7)
    assert deps.take_ranking_audit() == 7
    assert deps.take_ranking_audit() is None


def test_every_tool_hides_its_inputs_in_errors(app, client):
    tools = app.state.mcp_server._tool_manager.list_tools()
    assert len(tools) >= 8
    for tool in tools:
        assert tool.fn_metadata.arg_model.model_config.get("hide_input_in_errors") is True, tool.name


def add_call(session, client_id, *, days_ago=0, tool="get_regional_supply", outcome="ok", latency_ms=10, **extra):
    session.add(McpCallLog(client_id=client_id, called_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
                           latency_ms=latency_ms, method="tools/call", tool=tool, outcome=outcome, **extra))
    session.flush()


def test_fold_old_rows(session, partner):
    made = partner()
    add_call(session, made.id, days_ago=200)
    add_call(session, made.id, days_ago=200)
    add_call(session, made.id, days_ago=200, outcome="tool_error")
    add_call(session, None, days_ago=200, tool=None, outcome="denied_token")
    add_call(session, made.id, days_ago=1)
    assert mcp_usage.fold_old_rows(session, 180) == 4
    assert mcp_usage.fold_old_rows(session, 180) == 0
    assert len(rows(session)) == 1
    daily = {(row.client_id, row.tool, row.outcome): row.calls for row in session.exec(select(McpCallDaily))}
    assert daily == {(made.id, "get_regional_supply", "ok"): 2, (made.id, "get_regional_supply", "tool_error"): 1,
                     (NO_CLIENT, "", "denied_token"): 1}
    add_call(session, made.id, days_ago=300)
    assert mcp_usage.fold_old_rows(session, 180) == 1
    session.expire_all()
    report = mcp_usage.usage_report(session, DateRange())
    usage = next(item for item in report.clients if item.client_id == made.id)
    assert usage.calls == 5
    assert usage.by_outcome["ok"] == 4 and usage.by_outcome["tool_error"] == 1
    assert report.unattributed_denials == 1
    [tool] = usage.tools
    assert tool.calls == 5 and tool.p50_ms == 10


def test_usage_report_is_admin_only(client, learner, admin):
    assert client.get("/api/v1/admin/mcp/usage", headers=learner).status_code == 403
    assert client.get("/api/v1/admin/mcp/clients", headers=learner).status_code == 403
    assert client.get("/api/v1/admin/mcp/usage").status_code == 401
    assert client.get("/api/v1/admin/mcp/usage", headers=admin).status_code == 200


def test_usage_report_counts_and_flags(client, session, partner, admin):
    expected = ("get_regional_supply", "search_training_programs")
    made = partner("TSP", expected_tools=expected)
    silent = partner("Quiet", expected_tools=expected)
    for latency in (10, 20, 30, 40, 100):
        add_call(session, made.id, latency_ms=latency)
    add_call(session, made.id, outcome="rate_limited")
    add_call(session, made.id, tool="get_qualification")
    add_call(session, made.id, tool="search_training_programs", page_offset=0)
    add_call(session, made.id, tool="search_training_programs", page_offset=200)
    add_call(session, made.id, tool="search_training_programs", page_offset=400)
    add_call(session, None, tool=None, outcome="denied_token")
    body = client.get("/api/v1/admin/mcp/usage", headers=admin).json()
    assert body["unattributed_denials"] == 1
    usage = next(item for item in body["clients"] if item["client_id"] == str(made.id))
    assert usage["name"] == "TSP" and usage["declared_purpose"] == "Tests" and usage["is_active"]
    assert usage["calls"] == 10 and usage["by_outcome"] == {"ok": 9, "rate_limited": 1}
    assert usage["unexpected_tool_calls"] == 1 and usage["deep_paging_calls"] == 2
    supply = next(item for item in usage["tools"] if item["tool"] == "get_regional_supply")
    assert supply["calls"] == 6 and supply["ok"] == 5 and supply["rate_limited"] == 1 and supply["expected"]
    assert supply["p50_ms"] == 25 and supply["p95_ms"] >= 40
    assert not next(item for item in usage["tools"] if item["tool"] == "get_qualification")["expected"]
    assert [day["calls"] for day in usage["days"]] == [10]
    quiet = next(item for item in body["clients"] if item["client_id"] == str(silent.id))
    assert quiet["calls"] == 0 and quiet["tools"] == []
    future = client.get("/api/v1/admin/mcp/usage", headers=admin, params={"date_from": "2999-01-01"}).json()
    assert all(item["calls"] == 0 for item in future["clients"]) and future["unattributed_denials"] == 0


def test_client_list_hides_the_secret_hash(client, partner, admin):
    made = partner()
    body = client.get("/api/v1/admin/mcp/clients", headers=admin).json()
    found = next(item for item in body if item["id"] == str(made.id))
    assert "secret_hash" not in found and found["name"] == "TSP" and found["scopes"]


def test_cli_folds_old_calls(session, partner):
    import io

    from tesda_track.cli import build_parser, run_mcp_usage_command

    add_call(session, partner().id, days_ago=400)
    out = io.StringIO()
    run_mcp_usage_command(session, build_parser().parse_args(["mcp-usage", "fold", "--days", "30"]), out)
    assert "Folded 1 MCP calls" in out.getvalue()
