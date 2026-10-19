"""The partner MCP server: bearer tokens, scopes, transport checks and the catalog tools."""
import json
import logging
import time
import uuid

import jwt
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import Qualification
from tesda_track.services.partner_clients import mcp_signing_key, revoke_client

CATALOG_TOOLS = {"get_qualification", "search_training_programs", "get_regional_supply"}
ALL_SCOPES = ("catalog:read", "recommend:run", "reports:read")


def signed(client_id, **overrides):
    """Bearer headers for a token signed with the partner key, with any claim replaced."""
    now = int(time.time())
    claims = {"iss": "http://testserver", "aud": "http://testserver/mcp", "sub": str(client_id),
              "scope": "catalog:read", "ver": 1, "jti": uuid.uuid4().hex, "iat": now, "exp": now + 600, **overrides}
    return {"Authorization": f"Bearer {jwt.encode(claims, mcp_signing_key(get_settings()), algorithm='HS256')}"}


def text_of(result):
    return " ".join(part["text"] for part in result["content"])


def tool_names(response):
    assert response.status_code == 200, response.text
    return {tool["name"] for tool in response.json()["result"]["tools"]}


def test_mcp_requires_bearer_token(mcp):
    response = mcp.call({}, "tools/list")
    assert response.status_code == 401
    assert 'resource_metadata="http://testserver/.well-known/oauth-protected-resource/mcp"' in \
        response.headers["www-authenticate"]


def test_protected_resource_metadata(client):
    response = client.get("/.well-known/oauth-protected-resource/mcp")
    assert response.status_code == 200
    assert response.json()["resource"] == "http://testserver/mcp"
    assert response.json()["authorization_servers"] == ["http://testserver"]


def test_learner_token_rejected_at_mcp(mcp, learner):
    assert mcp.call(learner, "tools/list").status_code == 401


def test_wrong_audience_rejected(mcp, partner):
    made = partner()
    assert mcp.call(signed(made.id), "tools/list").status_code == 200
    assert mcp.call(signed(made.id, aud="http://testserver/other"), "tools/list").status_code == 401


def test_expired_token_is_401(mcp, partner):
    made = partner()
    response = mcp.call(signed(made.id, iat=int(time.time()) - 600, exp=int(time.time()) - 10), "tools/list")
    assert response.status_code == 401
    assert "resource_metadata=" in response.headers["www-authenticate"]


def test_revoked_client_refused_on_next_call(mcp, partner, session):
    made = partner()
    assert mcp.call(made.headers, "tools/list").status_code == 200
    revoke_client(session, made.id)
    session.flush()
    assert mcp.call(made.headers, "tools/list").status_code == 401


def test_foreign_host_is_rejected(client, partner):
    made = partner()
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    response = client.post("/mcp", json=body, headers={**made.headers, "Host": "evil.example",
                                                       "Accept": "application/json, text/event-stream"})
    assert response.status_code == 421


def test_tools_list_filtered_by_scope(mcp, partner):
    assert tool_names(mcp.call(partner(scopes=("catalog:read",)).headers, "tools/list")) == CATALOG_TOOLS
    assert tool_names(mcp.call(partner(name="BSRS", scopes=("recommend:run",)).headers, "tools/list")) == set()


def test_missing_scope_refuses_tool(mcp, partner):
    made = partner(scopes=("recommend:run",))
    response = mcp.call(made.headers, "tools/call", {"name": "get_qualification", "arguments": {"code": "SMAW-NC-II"}})
    assert response.json()["error"]["code"] == -32602
    assert response.json()["error"]["message"] == "Unknown tool: get_qualification"


def test_tools_are_annotated_and_typed(mcp, partner):
    response = mcp.call(partner(scopes=ALL_SCOPES).headers, "tools/list")
    tools = response.json()["result"]["tools"]
    assert {tool["name"] for tool in tools} == CATALOG_TOOLS
    for tool in tools:
        assert tool["annotations"]["readOnlyHint"] is True and tool["annotations"]["openWorldHint"] is False
        assert tool["outputSchema"]["type"] == "object"
        assert tool["description"].strip()
        for name, schema in tool["inputSchema"]["properties"].items():
            assert schema.get("description"), f"{tool['name']}.{name} has no description"


def test_older_protocol_client(mcp, partner):
    made = partner()
    initialize = mcp.call(made.headers, "initialize", {
        "protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "older-client", "version": "1"}},
        protocol="2025-11-25")
    assert initialize.status_code == 200, initialize.text
    assert initialize.json()["result"]["serverInfo"]["name"] == "tesda-track"
    assert CATALOG_TOOLS <= tool_names(mcp.call(made.headers, "tools/list", protocol="2025-11-25"))


def test_verifier_and_principal_describe_the_partner(app, partner):
    import anyio
    from mcp.server.auth.middleware.auth_context import auth_context_var
    from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser

    from tesda_track.mcp.auth import PartnerTokenVerifier
    from tesda_track.mcp.deps import CallerPrincipal, principal

    made = partner(expected_tools=("get_qualification",), rate_limit=30)
    verifier = PartnerTokenVerifier(app)
    token = anyio.run(verifier.verify_token, made.token)
    assert token.resource == "http://testserver/mcp" and token.scopes == ["catalog:read", "recommend:run"]
    assert token.claims == {"name": "TSP", "expected_tools": ["get_qualification"], "rate_limit_per_minute": 30}
    assert anyio.run(verifier.verify_token, "not-a-token") is None
    reset = auth_context_var.set(AuthenticatedUser(token))
    try:
        assert principal() == CallerPrincipal(client_id=made.id, scopes=frozenset({"catalog:read", "recommend:run"}),
                                              expected_tools=("get_qualification",), rate_limit_per_minute=30)
    finally:
        auth_context_var.reset(reset)


def test_every_lifespan_of_an_app_serves_mcp(app, mcp, partner):
    """The SDK runs a session manager once only; each TestClient, nested or one after another, still gets /mcp."""
    from fastapi.testclient import TestClient

    made = partner()
    for _ in range(2):
        with TestClient(app) as nested:
            assert tool_names(type(mcp)(nested).call(made.headers, "tools/list")) == CATALOG_TOOLS
    assert tool_names(mcp.call(made.headers, "tools/list")) == CATALOG_TOOLS


def test_mcp_can_be_turned_off(monkeypatch):
    from fastapi.testclient import TestClient

    from tesda_track.main import create_app

    monkeypatch.setattr(get_settings(), "mcp_enabled", False)
    off = create_app()
    assert getattr(off.state, "mcp_server", None) is None
    with TestClient(off) as client:
        assert client.post("/mcp", json={}).status_code == 404
        assert client.get("/.well-known/oauth-protected-resource/mcp").status_code == 404


def test_installing_mcp_keeps_the_logging_setup(monkeypatch):
    """The SDK calls logging.basicConfig(INFO), which would print every library's INFO records (httpx logs request
    URLs, and a directions request's URL holds the learner's coordinates)."""
    from tesda_track.main import create_app

    root = logging.getLogger()
    monkeypatch.setattr(root, "handlers", [])
    monkeypatch.setattr(root, "level", logging.WARNING)
    create_app()
    assert root.handlers == [] and root.level == logging.WARNING


def test_get_qualification_matches_rest(mcp, partner, client):
    result = mcp.tool(partner().headers, "get_qualification", code="SMAW-NC-II")
    rest = client.get("/api/v1/qualifications/SMAW-NC-II").json()
    assert result["isError"] is False
    detail = result["structuredContent"]
    assert detail["competencies"] == rest["competencies"]
    assert detail["possible_jobs"] == rest["possible_jobs"]
    assert detail["qualification"] == {"code": "SMAW-NC-II", "name": rest["name"], "sector": rest["sector"]}
    assert detail["other_levels"] == [{"code": "SMAW-NC-II", "name": rest["name"], "level": 2}]


def test_get_qualification_by_title_any_case(mcp, partner):
    result = mcp.tool(partner().headers, "get_qualification", title="  computer systems SERVICING nc ii ")
    assert result["isError"] is False
    assert result["structuredContent"]["qualification"]["code"] == "CSS-NC-II"


def test_other_levels_list_the_trade_by_level(mcp, partner, session):
    welding = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
    for code, level in (("SMAW-NC-I", "NC I"), ("SMAW-NC-III", "NC III")):
        session.add(Qualification(code=code, name=welding.name.replace("NC II", level), sector_id=welding.sector_id,
                                  skill_label=welding.skill_label))
    session.flush()
    result = mcp.tool(partner().headers, "get_qualification", code="SMAW-NC-III")
    levels = result["structuredContent"]["other_levels"]
    assert [(level["code"], level["level"]) for level in levels] == [("SMAW-NC-I", 1), ("SMAW-NC-II", 2),
                                                                     ("SMAW-NC-III", 3)]


def test_unknown_qualification_suggests_titles(mcp, partner):
    made = partner()
    asked = "Shielded Metal Arc Weldng NC 2 for Juan Dela Cruz 09171234567"
    result = mcp.tool(made.headers, "get_qualification", title=asked)
    assert result["isError"] is True
    message = text_of(result)
    assert "Closest titles" in message and "Shielded Metal Arc Welding (SMAW) NC II" in message
    assert asked not in message and "09171234567" not in message and "Juan" not in message
    by_code = mcp.tool(made.headers, "get_qualification", code="SMAW-NC-IV")
    assert by_code["isError"] is True and "Shielded Metal Arc Welding (SMAW) NC II" in text_of(by_code)
    nothing = mcp.tool(made.headers, "get_qualification", title="zzzz qqqq")
    assert nothing["isError"] is True and "No close titles." in text_of(nothing)


def test_get_qualification_needs_exactly_one_argument(mcp, partner):
    made = partner()
    for arguments in ({}, {"code": "SMAW-NC-II", "title": "Cookery NC II"}):
        result = mcp.tool(made.headers, "get_qualification", **arguments)
        assert result["isError"] is True and "exactly one of code or title" in text_of(result)


def test_search_programs_filters(mcp, partner, make_provider, make_program):
    made = partner(scopes=("catalog:read",))
    manila = make_provider(contact_email="office@manila-welding.example")
    cebu = make_provider(name="Cebu Welding Center", region_code="VII", location=(10.3157, 123.8854),
                         contact_email="hello@cebu-welding.example")
    granted = make_program(provider=manila, scholarship_available=True)
    paying = make_program(provider=manila, title="SMAW NC II Batch 2")
    elsewhere = make_program(provider=cebu, scholarship_available=True)

    def ids(**arguments):
        result = mcp.tool(made.headers, "search_training_programs", **arguments)
        assert result["isError"] is False, text_of(result)
        assert "contact_email" not in json.dumps(result)
        return [program["id"] for program in result["structuredContent"]["programs"]]

    assert ids(qualification_code="SMAW-NC-II") == [granted["id"], paying["id"], elsewhere["id"]]
    assert ids(qualification_code="SMAW-NC-II", scholarship_only=True) == [granted["id"], elsewhere["id"]]
    assert ids(provider_id=manila["id"]) == [granted["id"], paying["id"]]
    assert ids(provider_id=manila["id"], scholarship_only=True) == [granted["id"]]
    assert ids(region_code="VII") == [elsewhere["id"]]
    assert ids(qualification_code="COOKERY-NC-II") == []

    first_page = mcp.tool(made.headers, "search_training_programs", qualification_code="SMAW-NC-II", limit=2)
    assert first_page["structuredContent"]["next_offset"] == 2
    last_page = mcp.tool(made.headers, "search_training_programs", qualification_code="SMAW-NC-II", limit=2, offset=2)
    assert [p["id"] for p in last_page["structuredContent"]["programs"]] == [elsewhere["id"]]
    assert last_page["structuredContent"]["next_offset"] is None


def test_search_programs_rounds_the_point(mcp, partner, make_program, monkeypatch):
    from tesda_track.services import training

    made = partner()
    make_program()
    seen = []
    original = training.search_programs
    monkeypatch.setattr(training, "search_programs", lambda session, search: seen.append(search) or
                        original(session, search))
    result = mcp.tool(made.headers, "search_training_programs", qualification_code="SMAW-NC-II",
                      near_lat=14.5995, near_lon=120.9842, radius_km=50)
    assert result["isError"] is False
    assert (seen[0].near_lat, seen[0].near_lon) == (14.6, 121.0)
    assert result["structuredContent"]["programs"][0]["distance_km"] is not None
    half = mcp.tool(made.headers, "search_training_programs", qualification_code="SMAW-NC-II", near_lat=14.5995)
    assert half["isError"] is True and "14.5995" not in text_of(half)


def test_search_programs_needs_a_filter(mcp, partner):
    made = partner()
    result = mcp.tool(made.headers, "search_training_programs", scholarship_only=True)
    assert result["isError"] is True
    assert "Give a qualification_code, region_code or provider_id." in text_of(result)
    unknown = mcp.tool(made.headers, "search_training_programs", qualification_code="NOT-A-CODE")
    assert unknown["isError"] is True and "NOT-A-CODE" not in text_of(unknown)


def test_regional_supply_matches_admin_report(mcp, partner, client, admin, make_program):
    make_program()
    made = partner(scopes=("catalog:read",))
    result = mcp.tool(made.headers, "get_regional_supply")
    report = client.get("/api/v1/admin/reports/supply", headers=admin).json()
    assert result["isError"] is False
    assert result["structuredContent"]["regions"] == report
    ncr = mcp.tool(made.headers, "get_regional_supply", region_code="NCR")
    assert ncr["structuredContent"]["regions"] == [row for row in report if row["region_code"] == "NCR"]
    unknown = mcp.tool(made.headers, "get_regional_supply", region_code="XYZ")
    assert unknown["isError"] is True and "NCR" in text_of(unknown) and "CAR" in text_of(unknown)
