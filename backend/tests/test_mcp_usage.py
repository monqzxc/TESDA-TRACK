"""The MCP usage log (shapes only), per-client and per-tool rate limits, retention and the admin usage report."""
import contextvars
import hashlib
import uuid
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


def test_unknown_tool_is_logged_as_unknown(mcp, partner, session):
    headers = partner().headers
    mcp.call(headers, "tools/call", {"name": "no_such_tool", "arguments": {}})
    mcp.call(headers, "tools/call", {"name": "Juan Dela Cruz 0917", "arguments": {}})
    first, second = rows(session, method="tools/call")
    assert first.outcome == "denied_scope" and first.tool == "unknown"
    assert second.outcome == "denied_scope" and second.tool == "unknown"


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


def test_every_method_is_rate_limited_not_only_tool_calls(mcp, partner, session):
    headers = partner(rate_limit=3).headers
    for _ in range(3):
        assert "result" in mcp.call(headers, "tools/list").json()
    assert mcp.call(headers, "tools/list").json()["error"]["code"] == -32000
    assert mcp.call(headers, "ping").json()["error"]["code"] == -32000
    assert [row.outcome for row in rows(session)] == ["ok"] * 3 + ["rate_limited"] * 2
    assert {row.method for row in rows(session)} == {"tools/list", "ping"}


def test_notifications_are_logged_under_budget_and_not_written_over_it(app, partner, session):
    """The SDK runs the middleware chain for notifications too, so the middleware is driven directly here."""
    import asyncio
    from types import SimpleNamespace

    from mcp.server.auth.middleware.auth_context import auth_context_var
    from mcp.server.auth.provider import AccessToken

    from tesda_track.mcp.usage import UsageMiddleware

    made = partner(rate_limit=3)
    token = AccessToken(token="x", client_id=str(made.id), scopes=["catalog:read"], expires_at=None,
                        claims={"expected_tools": [], "rate_limit_per_minute": 3})
    ctx = SimpleNamespace(method="notifications/initialized", params={}, protocol_version="2026-07-28")

    async def next_(_ctx):
        return None

    async def send(times):
        reset = auth_context_var.set(SimpleNamespace(access_token=token))
        try:
            for _ in range(times):
                assert await UsageMiddleware(app)(ctx, next_) is None  # never raises, even over budget
        finally:
            auth_context_var.reset(reset)

    asyncio.run(send(3))
    assert len(rows(session, method="notifications/initialized")) == 3
    asyncio.run(send(5))
    assert len(rows(session)) == 3


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
    assert supply["p50_ms"] == 30 and supply["p95_ms"] >= 40
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


def test_admin_tool_catalog_is_scoped(client, admin, learner):
    from tesda_track.mcp.scopes import TOOL_SCOPES

    response = client.get("/api/v1/admin/mcp/tools", headers=admin)
    assert response.status_code == 200 and response.json() == TOOL_SCOPES
    assert client.get("/api/v1/admin/mcp/tools", headers=learner).status_code == 403


def test_admin_manages_partner_client_lifecycle(client, session, admin):
    created = client.post("/api/v1/admin/mcp/clients", headers=admin, json={
        "name": "eTESDA", "organisation": "TESDA", "contact_email": "mcp@example.gov.ph",
        "declared_purpose": "Recommend qualifications", "scopes": ["catalog:read", "recommend:run"],
        "expected_tools": ["match_qualifications"], "rate_limit_per_minute": 45,
    })
    assert created.status_code == 201
    body = created.json()
    assert body["client"]["name"] == "eTESDA" and body["client_secret"]
    assert "secret_hash" not in body["client"]
    client_id = body["client"]["id"]

    duplicate = client.post("/api/v1/admin/mcp/clients", headers=admin, json={
        "name": "eTESDA", "organisation": "Other", "declared_purpose": "Duplicate",
        "scopes": ["catalog:read"],
    })
    assert duplicate.status_code == 409

    rotated = client.post(f"/api/v1/admin/mcp/clients/{client_id}/rotate-secret", headers=admin)
    assert rotated.status_code == 200 and rotated.json()["client_secret"] != body["client_secret"]
    revoked = client.post(f"/api/v1/admin/mcp/clients/{client_id}/revoke", headers=admin)
    assert revoked.status_code == 200 and revoked.json()["is_active"] is False


def test_partner_client_writes_are_admin_only(client, learner, admin):
    request = {"name": "Blocked", "organisation": "Test", "declared_purpose": "Test",
               "scopes": ["catalog:read"]}
    assert client.post("/api/v1/admin/mcp/clients", headers=learner, json=request).status_code == 403
    assert client.post("/api/v1/admin/mcp/clients", json=request).status_code == 401
    assert client.post(f"/api/v1/admin/mcp/clients/{uuid.uuid4()}/revoke", headers=admin).status_code == 404


def test_cli_folds_old_calls(session, partner):
    import io

    from tesda_track.cli import build_parser, run_mcp_usage_command

    add_call(session, partner().id, days_ago=400)
    out = io.StringIO()
    run_mcp_usage_command(session, build_parser().parse_args(["mcp-usage", "fold", "--days", "30"]), out)
    assert "Folded 1 MCP calls" in out.getvalue()


def logged_text(session):
    return " ".join(session.execute(text("SELECT row_to_json(t)::text FROM mcp_call_log t")).scalars().all())


def test_unresolved_codes_are_not_logged(mcp, partner, session, make_program):
    make_program()
    headers = partner().headers
    text_sent = "Juan-Dela-Cruz-09171234567"
    mcp.tool(headers, "get_qualification", code=text_sent)
    mcp.tool(headers, "get_regional_supply", region_code="Juan-0917")
    mcp.tool(headers, "get_qualification", code="SMAW-NC-II")
    mcp.tool(headers, "get_regional_supply", region_code="NCR")
    dumped = logged_text(session)
    assert "Juan" not in dumped and "0917" not in dumped
    assert [row.qualification_code for row in rows(session, tool="get_qualification")] == [None, "SMAW-NC-II"]
    assert [row.region_code for row in rows(session, tool="get_regional_supply")] == [None, "NCR"]


def test_partner_chosen_text_never_reaches_the_log(mcp, partner, session):
    headers = partner().headers
    mcp.tool(headers, "get_regional_supply", **{"Juan 09171234567": "x", "region_code": "NCR"})
    mcp.call(headers, "Juan.Dela.Cruz/0917", {})
    dumped = logged_text(session)
    assert "Juan" not in dumped and "0917" not in dumped
    supply = rows(session, tool="get_regional_supply")[0]
    assert supply.inputs_sent == ["region_code"] and supply.region_code == "NCR"
    assert rows(session, method="other")


def write_failure_leaves_the_session_usable(session, caplog, **fields):
    base = {"method": "tools/call", "latency_ms": 1, "outcome": "ok"}
    mcp_usage.record_call(session, **{**base, **fields})
    assert "IntegrityError" in caplog.text and "bogus" not in caplog.text
    session.add(McpCallLog(**base))
    session.flush()
    assert len(rows(session)) == 1


def test_write_failing_at_flush_leaves_the_session_usable(session, caplog):
    write_failure_leaves_the_session_usable(session, caplog, outcome="bogus")


def test_write_failing_on_a_foreign_key_leaves_the_session_usable(session, caplog):
    write_failure_leaves_the_session_usable(session, caplog, client_id=uuid.uuid4())


def test_unexpected_exception_is_logged_as_server_error(mcp, partner, session, monkeypatch):
    from tesda_track.mcp.scopes import ScopeMiddleware

    async def boom(self, ctx, call_next):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(ScopeMiddleware, "__call__", boom)
    headers = partner().headers
    try:
        response = mcp.call(headers, "tools/call", {"name": "get_regional_supply", "arguments": {}})
        assert "error" in response.json() or response.status_code >= 500
    except RuntimeError:
        pass
    [row] = rows(session, tool="get_regional_supply")
    assert row.outcome == "server_error" and row.error_code == "RuntimeError"


def test_sdk_invalid_params_error_is_invalid_request_not_denied_scope(mcp, partner, session, monkeypatch):
    from mcp.shared.exceptions import MCPError

    from tesda_track.mcp.scopes import ScopeMiddleware

    async def refuse(self, ctx, call_next):
        raise MCPError(code=-32602, message="Invalid params")

    monkeypatch.setattr(ScopeMiddleware, "__call__", refuse)
    response = mcp.call(partner().headers, "tools/call", {"name": "get_regional_supply", "arguments": {}})
    assert response.json()["error"]["code"] == -32602
    assert rows(session, tool="get_regional_supply")[0].outcome == "invalid_request"


def test_arguments_failing_validation_are_logged(mcp, partner, session):
    result = mcp.tool(partner().headers, "match_qualifications", goal=GOAL, limit="Juan")
    assert result["isError"]
    [row] = rows(session, tool="match_qualifications")
    assert row.outcome in ("tool_error", "invalid_request") and "Juan" not in logged_text(session)


def test_missing_client_row_is_an_unattributed_denial(mcp, session):
    from backend.tests.test_mcp_server import signed

    assert mcp.call(signed(uuid.uuid4()), "tools/list").status_code == 401
    [row] = rows(session, outcome="denied_token")
    assert row.client_id is None


def test_latency_percentiles_ignore_refused_calls(session, partner):
    made = partner()
    for latency in (100, 200):
        add_call(session, made.id, latency_ms=latency)
    for _ in range(5):
        add_call(session, made.id, outcome="rate_limited", latency_ms=0)
    [tool] = mcp_usage.usage_report(session, DateRange()).clients[0].tools
    assert tool.calls == 7 and tool.p50_ms == 150


def test_suppressed_unattributed_denials_are_counted_not_dropped(mcp, partner, session, monkeypatch):
    from tesda_track.mcp import auth
    from tesda_track.services.rate_limit import RateLimiter

    now = [0.0]
    monkeypatch.setattr(auth, "_unattributed_denials", RateLimiter(clock=lambda: now[0]))
    monkeypatch.setattr(auth, "_suppressed", 0)
    monkeypatch.setattr(auth, "_attributed_denials", RateLimiter(clock=lambda: now[0]))
    monkeypatch.setattr(auth, "_suppressed_attributed", {})
    monkeypatch.setattr(auth, "UNATTRIBUTED_DENIALS_PER_MINUTE", 3)
    monkeypatch.setattr(auth, "ATTRIBUTED_DENIALS_PER_MINUTE", 3)
    garbage = {"Authorization": "Bearer nonsense"}
    for _ in range(10):
        assert mcp.call(garbage, "tools/list").status_code == 401
    assert len(rows(session, outcome="denied_token")) == 3
    # Attributed denials have a budget of their own, and are counted too.
    made = partner()
    revoke_client(session, made.id)
    session.flush()
    for _ in range(5):
        assert mcp.call(made.headers, "tools/list").status_code == 401
    assert len(rows(session, client_id=made.id)) == 3
    now[0] = 61.0
    assert mcp.call(garbage, "tools/list").status_code == 401
    summaries = rows(session, error_code="suppressed")
    assert [(row.client_id, row.result_count) for row in summaries] == [(None, 7)]
    assert mcp_usage.usage_report(session, DateRange()).unattributed_denials == 11
    # The next denied request of the revoked client carries its own summary of the 2 it did not write.
    assert mcp.call(made.headers, "tools/list").status_code == 401
    assert [(row.client_id, row.result_count) for row in rows(session, error_code="suppressed")] == [
        (None, 7), (made.id, 2)]
    attributed = [client for client in mcp_usage.usage_report(session, DateRange()).clients if client.client_id == made.id]
    assert attributed[0].by_outcome["denied_token"] == 6
    # Folding keeps the total.
    session.execute(text("UPDATE mcp_call_log SET called_at = now() - interval '400 days'"))
    mcp_usage.fold_old_rows(session, 180)
    assert mcp_usage.usage_report(session, DateRange()).unattributed_denials == 11
