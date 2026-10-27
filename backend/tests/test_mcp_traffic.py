"""The scripted partner traffic and the usage report must agree call for call."""
from sqlalchemy import text

from tesda_track.mcp import traffic_check
from tesda_track.mcp.scopes import TOOL_LIMITS
from tesda_track.mcp.traffic_check import Credentials


def test_traffic_tally_matches_usage_report(mcp, partner, client, admin, session, monkeypatch, make_program):
    make_program()
    monkeypatch.setitem(TOOL_LIMITS, "get_regional_supply", 2)
    tsp = partner("TSP", scopes=("catalog:read", "recommend:run"))
    bsrs = partner("BSRS", scopes=("catalog:read",))

    def call(token, tool, arguments):
        headers = {"Authorization": f"Bearer {token}"}
        response = mcp.call(headers, "tools/call", {"name": tool, "arguments": arguments})
        return {"status": response.status_code, "body": response.json()}

    def fetch_report():
        response = client.get("/api/v1/admin/mcp/usage", headers=admin)
        assert response.status_code == 200, response.text
        return response.json()

    before = traffic_check.usage_counts(fetch_report())
    tally = traffic_check.run_traffic(call, Credentials("TSP", tsp.token), Credentials("BSRS", bsrs.token), "SMAW-NC-II")
    after = traffic_check.usage_counts(fetch_report())

    assert tally == {
        ("TSP", "match_qualifications", "ok"): 3,
        ("TSP", "match_qualifications", "tool_error"): 1,
        ("TSP", "get_qualification", "ok"): 2,
        ("TSP", "rank_training_programs", "ok"): 1,
        ("TSP", "get_qualification_demand", "denied_scope"): 1,
        ("BSRS", "search_training_programs", "ok"): 2,
        ("BSRS", "get_regional_supply", "ok"): 2,
        ("BSRS", "get_regional_supply", "rate_limited"): 1,
        (traffic_check.UNATTRIBUTED, "", "denied_token"): 1,
    }
    assert traffic_check.differences(tally, before, after) == []

    for table in ("mcp_call_log", "ranking_audit"):
        dumped = " ".join(session.execute(text(f"SELECT row_to_json(t)::text FROM {table} t")).scalars().all())
        assert dumped, f"{table} is empty, so the privacy check would prove nothing"
        assert not any(goal in dumped for goal in traffic_check.GOALS)
    audits = session.execute(text("SELECT query_hash FROM ranking_audit")).scalars().all()
    assert len(audits) == 1 and audits[0] and traffic_check.MATCH_GOAL not in audits[0]


def test_differences_name_every_mismatch():
    tally = {("TSP", "get_qualification", "ok"): 2, ("BSRS", "get_regional_supply", "ok"): 1}
    before = {("TSP", "get_qualification", "ok"): 5}
    after = {("TSP", "get_qualification", "ok"): 6, ("BSRS", "get_regional_supply", "ok"): 1}
    [problem] = traffic_check.differences(tally, before, after)
    assert "TSP" in problem and "get_qualification" in problem and "sent 2" in problem and "reported 1" in problem


def test_empty_token_secret_means_unset(monkeypatch):
    from tesda_track.config import Settings

    monkeypatch.setenv("MCP_TOKEN_SECRET", "")
    assert Settings(secret_key="x" * 40).mcp_token_secret is None
