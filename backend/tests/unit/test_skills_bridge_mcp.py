"""Database-free checks. Run with --confcutdir=backend/tests/unit."""
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tesda_track.config import Settings, get_settings
from tesda_track.db import get_session
from tesda_track.routers.skills_bridge import BridgeLimits, bridge_cache, bridge_client, router
from tesda_track.services.skills_bridge_mcp import SkillsBridgeMCPClient, SkillsBridgeMCPError


def settings(**kwargs):
    return Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                    skills_bridge_mcp_url="https://bridge.example.test/mcp", **kwargs)


class MCPServer:
    def __init__(self, *, sse=False, text=False, tool_result=None, session_id="test-session"):
        self.sse, self.text = sse, text
        self.tool_result = tool_result or (lambda name, args: {"input": args, "occupations": []})
        self.session_headers = {"Mcp-Session-Id": session_id} if session_id else {}
        self.requests = []
        self.deletes = []

    def __call__(self, request):
        if request.method == "DELETE":
            self.deletes.append(request)
            return httpx.Response(204)
        body = json.loads(request.content)
        self.requests.append((request, body))
        assert request.method == "POST"
        assert str(request.url) == "https://bridge.example.test/mcp"
        if body["method"] == "notifications/initialized":
            assert "id" not in body
            return httpx.Response(202)
        if body["method"] == "initialize":
            result = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}},
                      "serverInfo": {"name": "test", "version": "1"}}
        else:
            assert body["method"] == "tools/call"
            data = self.tool_result(body["params"]["name"], body["params"]["arguments"])
            result = {"content": [{"type": "text", "text": json.dumps(data)}]} if self.text else {"structuredContent": data}
        message = {"jsonrpc": "2.0", "id": body["id"], "result": result}
        if self.sse:
            # Provider framing and an unrelated event before the matching response.
            content = ': keepalive\r\r\nevent: message\r\r\ndata: {"jsonrpc":"2.0","method":"progress"}\r\r\n\r\r\n'
            content += 'event: message\r\r\ndata: ' + json.dumps(message) + '\r\r\n\r\r\n'
            return httpx.Response(200, text=content, headers={"Content-Type": "text/event-stream", **self.session_headers})
        return httpx.Response(200, json=message, headers=self.session_headers)


@pytest.mark.parametrize("sse,text", [(False, False), (False, True), (True, False), (True, True)])
def test_handshake_and_read_only_skill_lookup(sse, text):
    server = MCPServer(sse=sse, text=text)
    with SkillsBridgeMCPClient(settings(skills_bridge_api_token="legacy-secret"), httpx.MockTransport(server)) as client:
        data = client.match_skills(["JavaScript"], 3)
    assert data["input"] == {"skills": ["JavaScript"], "limit": 3, "promulgated_only": True}
    assert [body["method"] for _, body in server.requests] == ["initialize", "notifications/initialized", "tools/call"]
    assert all("authorization" not in request.headers for request, _ in server.requests)
    assert server.requests[-1][0].headers["Mcp-Session-Id"] == "test-session"
    assert client.http.is_closed


@pytest.mark.parametrize("token,expected", [("", None), ("mcp-secret", "Bearer mcp-secret")])
def test_optional_mcp_credential_is_separate(token, expected):
    server = MCPServer()
    with SkillsBridgeMCPClient(settings(skills_bridge_mcp_token=token), httpx.MockTransport(server)):
        pass
    assert server.requests[0][0].headers.get("authorization") == expected


def test_session_is_ended_with_delete_when_the_server_issued_one():
    server = MCPServer()
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        client.match_skills(["Welding"])
        assert not server.deletes
    assert len(server.deletes) == 1
    assert str(server.deletes[0].url) == "https://bridge.example.test/mcp"
    assert server.deletes[0].headers["Mcp-Session-Id"] == "test-session"
    assert client.http.is_closed


def test_no_delete_without_a_session_id():
    server = MCPServer(session_id=None)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        client.match_skills(["Welding"])
    assert not server.deletes
    assert client.http.is_closed


def test_failed_delete_does_not_hide_the_result():
    server = MCPServer()

    def handler(request):
        if request.method == "DELETE":
            raise httpx.ConnectError("private upstream detail", request=request)
        return server(request)

    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(handler)) as client:
        data = client.match_skills(["Welding"])
    assert data["input"]["skills"] == ["Welding"]
    assert client.http.is_closed


def test_session_is_ended_when_the_handshake_fails_after_it_started():
    server = MCPServer()

    def handler(request):
        response = server(request)
        if request.method == "POST" and json.loads(request.content)["method"] == "initialize":
            message = response.json()
            message["result"]["protocolVersion"] = "unsupported"
            return httpx.Response(200, json=message, headers=server.session_headers)
        return response

    client = SkillsBridgeMCPClient(settings(), httpx.MockTransport(handler))
    with pytest.raises(SkillsBridgeMCPError, match="protocol"):
        with client:
            pass
    assert len(server.deletes) == 1
    assert client.http.is_closed


def test_disabled_never_connects():
    def unexpected(request):
        pytest.fail("Disabled integration must not use the network")
    with pytest.raises(SkillsBridgeMCPError, match="disabled"):
        with SkillsBridgeMCPClient(settings(skills_bridge_mcp_enabled=False), httpx.MockTransport(unexpected)):
            pass


@pytest.mark.parametrize("sse", [False, True])
def test_batched_protocol_responses(sse):
    server = MCPServer()

    def handler(request):
        response = server(request)
        if response.status_code == 202:
            return response
        batch = [{"jsonrpc": "2.0", "method": "notifications/progress"}, response.json()]
        if sse:
            return httpx.Response(200, text="data: " + json.dumps(batch) + "\n\n",
                                  headers={"Content-Type": "text/event-stream"})
        return httpx.Response(200, json=batch)

    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(handler)) as client:
        assert client.match_skills(["JavaScript"])["occupations"] == []


def test_occupation_search_uses_bounded_graph_query_for_job_terms():
    def tool(name, args):
        assert name == "graph_query"
        query = args["cypher"]
        assert "Occupation" in query and "welder" in query and "programmer" in query
        assert "LIMIT 6" in query and "DELETE" not in query
        return {"rows": [{"occupation_id": 7, "title": "Welder", "sector": "Metals"}]}

    server = MCPServer(tool_result=tool)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.search_occupations(["welder", "programmer"])
    assert result["occupations"][0]["title"] == "Welder"
    assert result["unmatched"] == ["programmer"]
    assert result["resolution"][0]["matched_occupations"] == 1


@pytest.mark.parametrize("failure", ["http", "timeout", "invalid_json", "wrong_id", "protocol", "oversize", "rpc_error"])
def test_protocol_and_transport_failures_are_safe_and_close_client(failure):
    def handler(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("private upstream detail", request=request)
        if failure == "http":
            return httpx.Response(500, text="private upstream detail")
        if failure == "invalid_json":
            return httpx.Response(200, text="private upstream detail")
        if failure == "oversize":
            return httpx.Response(200, content=b"x" * (SkillsBridgeMCPClient.MAX_RESPONSE_BYTES + 1))
        body = json.loads(request.content)
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 99 if failure == "wrong_id" else body["id"],
                                        "result": {"protocolVersion": "unsupported"},
                                        **({"error": {"message": "private upstream detail"}} if failure == "rpc_error" else {})})
    client = SkillsBridgeMCPClient(settings(), httpx.MockTransport(handler))
    with pytest.raises(SkillsBridgeMCPError) as error:
        with client:
            pass
    assert "private upstream detail" not in str(error.value)
    assert client.http.is_closed


def test_occupation_uses_only_bounded_application_queries_and_keeps_partial_results():
    def tool(name, args):
        if name == "occupation_curriculum_profile":
            return {"occupation": {"occupation_id": 133, "title": "Front-end Web Developer"}}
        assert name == "graph_query" and set(args) == {"cypher"}
        assert "{id: 133}" in args["cypher"]
        if "NEEDS_SKILL" in args["cypher"]:
            assert "LIMIT 50" in args["cypher"]
            return {"rows": [{"skill_id": 1, "name": "JavaScript", "weight": 1}]}
        assert "LIMIT 20" in args["cypher"]
        return {"error": "private graph detail"}
    server = MCPServer(tool_result=tool)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.occupation(133)
        with pytest.raises(ValueError):
            client.occupation("133}) DELETE o")
        with pytest.raises(ValueError, match="not allowed"):
            client._call("write_graph", {})
    assert result["skills"][0]["name"] == "JavaScript"
    assert result["benchmarks"] == []
    assert len(result["warnings"]) == 1
    assert "private" not in str(result["warnings"])
    assert len(server.requests) == 5


def test_unknown_occupation_does_not_query_graph():
    server = MCPServer(tool_result=lambda name, args: {"did_you_mean": []})
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.occupation(999)
    assert result["skills"] == [] and len(server.requests) == 3


class FakeClient:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.warnings = []

    def __enter__(self):
        if self.fail:
            raise SkillsBridgeMCPError("Skills Bridge is currently disabled.")
        return self

    def __exit__(self, *_):
        pass

    def match_skills(self, skills, limit):
        self.calls.append((skills, limit))
        return {"occupations": []}

    def search_occupations(self, occupations, limit):
        self.calls.append(("search", occupations, limit))
        return {"occupations": []}

    def occupation(self, occupation_id):
        self.calls.append(occupation_id)
        return {"profile": {"occupation": {"occupation_id": occupation_id}}, "warnings": self.warnings}


class DictCache:
    """Stands in for the PostgreSQL cache, which backend/tests/test_integrations.py covers."""
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def put(self, key, value):
        self.values[key] = value


def make_api(**overrides):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.state.skills_bridge_limits = BridgeLimits()
    fake, response_cache = FakeClient(), DictCache()
    test_settings = settings(**overrides)
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[bridge_client] = lambda: fake
    app.dependency_overrides[bridge_cache] = lambda: response_cache
    return app, fake, response_cache


@pytest.fixture
def api():
    app, fake, _ = make_api()
    with TestClient(app) as client:
        yield client, fake


def test_routes_validate_terms_and_provenance_without_database(api):
    client, fake = api
    response = client.post("/api/v1/skills-bridge/matches", json={"skills": [" JavaScript ", "javascript", "Cooking"]})
    assert response.status_code == 200
    assert fake.calls == [(["JavaScript", "Cooking"], 6)]
    assert response.json()["source"] == "Skills Bridge"
    assert response.json()["retrieved_at"].endswith("+00:00")
    assert client.get("/api/v1/skills-bridge/occupations/133").status_code == 200
    assert fake.calls[-1] == 133
    response = client.post("/api/v1/skills-bridge/occupations/search", json={"occupations": ["welder"]})
    assert response.status_code == 200
    assert fake.calls[-1] == ("search", ["welder"], 6)


@pytest.mark.parametrize("body", [{"skills": []}, {"skills": [" "]}, {"skills": ["x" * 81]},
                                  {"skills": ["x"] * 26}, {"skills": ["x"], "limit": 11},
                                  {"skills": ["x"], "cypher": "DELETE n"}])
def test_invalid_match_requests_never_reach_provider(api, body):
    client, fake = api
    assert client.post("/api/v1/skills-bridge/matches", json=body).status_code == 422
    assert not fake.calls


@pytest.mark.parametrize("value", ["0", "-1", "2147483648", "query"])
def test_invalid_occupation_ids_never_reach_provider(api, value):
    client, fake = api
    assert client.get(f"/api/v1/skills-bridge/occupations/{value}").status_code == 422
    assert not fake.calls


def test_provider_failure_is_isolated_service_unavailable(api):
    client, fake = api
    fake.fail = True
    response = client.post("/api/v1/skills-bridge/matches", json={"skills": ["JavaScript"]})
    assert response.status_code == 503
    assert "Skills Bridge" in response.json()["detail"]


def test_repeated_lookups_are_served_from_the_cache(api):
    client, fake = api
    first = client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]})
    second = client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]})
    assert first.status_code == second.status_code == 200
    # The cached copy keeps the time it was really retrieved.
    assert first.json() == second.json()
    client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"], "limit": 3})
    client.post("/api/v1/skills-bridge/occupations/search", json={"occupations": ["Welding"]})
    client.get("/api/v1/skills-bridge/occupations/133")
    client.get("/api/v1/skills-bridge/occupations/133")
    assert fake.calls == [(["Welding"], 6), (["Welding"], 3), ("search", ["Welding"], 6), 133]


def test_cache_keys_do_not_contain_search_terms():
    app, _, response_cache = make_api()
    with TestClient(app) as client:
        client.post("/api/v1/skills-bridge/matches", json={"skills": ["Pagluluto ng adobo"]})
    [key] = response_cache.values
    assert key.startswith("sbmcp:") and "adobo" not in key.lower()


def test_failures_and_partial_results_are_not_cached(api):
    client, fake = api
    fake.fail = True
    assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 503
    fake.fail = False
    assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 200
    fake.warnings = ["The skills details could not be loaded."]
    client.get("/api/v1/skills-bridge/occupations/133")
    client.get("/api/v1/skills-bridge/occupations/133")
    assert fake.calls == [(["Welding"], 6), 133, 133]


class NoDatabase:
    def __getattr__(self, name):
        pytest.fail("A turned-off cache must not use the database")


def test_cache_can_be_turned_off():
    app, fake, _ = make_api(skills_bridge_cache_ttl_seconds=0)
    app.dependency_overrides.pop(bridge_cache)
    app.dependency_overrides[get_session] = NoDatabase
    with TestClient(app) as client:
        for _ in range(2):
            assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 200
    assert len(fake.calls) == 2


def test_each_client_gets_a_limited_number_of_lookups():
    app, fake, _ = make_api(skills_bridge_rate_limit_per_minute=2)
    with TestClient(app, client=("203.0.113.5", 50000)) as client:
        for _ in range(2):
            assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 200
        response = client.get("/api/v1/skills-bridge/occupations/133")
    assert response.status_code == 429
    assert "minute" in response.json()["detail"]
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    assert fake.calls == [(["Welding"], 6)]
    with TestClient(app, client=("203.0.113.6", 50000)) as other:
        assert other.get("/api/v1/skills-bridge/occupations/133").status_code == 200


def test_overall_provider_budget_still_serves_cached_lookups():
    app, fake, _ = make_api(skills_bridge_upstream_per_minute=1)
    with TestClient(app) as client:
        assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 200
        busy = client.post("/api/v1/skills-bridge/matches", json={"skills": ["Cookery"]})
        assert busy.status_code == 429
        assert "Skills Bridge" in busy.json()["detail"] and "Retry-After" in busy.headers
        assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 200
    assert fake.calls == [(["Welding"], 6)]


def test_invalid_requests_do_not_use_up_the_limit():
    app, _, _ = make_api(skills_bridge_rate_limit_per_minute=1)
    with TestClient(app) as client:
        assert client.post("/api/v1/skills-bridge/matches", json={"skills": []}).status_code == 422
        assert client.post("/api/v1/skills-bridge/matches", json={"skills": ["Welding"]}).status_code == 200
