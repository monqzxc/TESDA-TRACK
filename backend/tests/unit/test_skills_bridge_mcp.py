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
    """Answers like mcp.skills-bridge.ph: it echoes a protocol version it supports and returns each tool result
    both as JSON text and as structured content (``text=True`` drops the structured copy)."""
    PROTOCOLS = {"2025-06-18", "2025-03-26"}

    def __init__(self, *, sse=False, text=False, tool_result=None, session_id="test-session"):
        self.sse, self.text = sse, text
        self.tool_result = tool_result or (lambda name, args: MATCH_SKILLS)
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
            requested = body["params"]["protocolVersion"]
            result = {"protocolVersion": requested if requested in self.PROTOCOLS else "2025-06-18",
                      "capabilities": {"tools": {"listChanged": True}},
                      "serverInfo": {"name": "sbp-analytics", "version": "3.4.3"}}
        else:
            assert body["method"] == "tools/call"
            data = self.tool_result(body["params"]["name"], body["params"]["arguments"])
            result = {"content": [{"type": "text", "text": json.dumps(data)}], "isError": False}
            if not self.text:
                result["structuredContent"] = data
        message = {"jsonrpc": "2.0", "id": body["id"], "result": result}
        if self.sse:
            # Provider framing and an unrelated event before the matching response.
            content = ': keepalive\r\r\nevent: message\r\r\ndata: {"jsonrpc":"2.0","method":"progress"}\r\r\n\r\r\n'
            content += 'event: message\r\r\ndata: ' + json.dumps(message) + '\r\r\n\r\r\n'
            return httpx.Response(200, text=content, headers={"Content-Type": "text/event-stream", **self.session_headers})
        return httpx.Response(200, json=message, headers=self.session_headers)


def tool_calls(server):
    return [(body["params"]["name"], body["params"]["arguments"])
            for _, body in server.requests if body["method"] == "tools/call"]


# Response shapes captured from mcp.skills-bridge.ph (sbp-analytics 3.4.3) on 2026-10-07, shortened.
MATCH_SKILLS = {
    "input": {"skills": ["welding", "blueprint reading"], "skill_ids": []},
    "promulgated_only": True,
    "resolution": [
        {"term": "welding", "source": "name", "matched_skills": 133, "truncated": False, "best_similarity": 1.0,
         "strength": "strong", "sample": [{"skill_id": 13628, "name": "Performing Tack welding", "similarity": 1.0}]},
        {"term": "blueprint reading", "source": "name", "matched_skills": 8, "truncated": False,
         "best_similarity": 1.0, "strength": "strong",
         "sample": [{"skill_id": 3, "name": "Blueprint Reading", "similarity": 1.0}]}],
    "unmatched": [],
    "qualifications": [{
        "qualification_id": 371, "code": "HEA-NC3-0008", "title": "Ice Plant Refrigeration Servicing",
        "kind": "training_regulation", "kind_label": "Training Regulation", "level": "nc_3", "level_label": "NC III",
        "status": "promulgated", "sector": "Heating, Ventilation, Air-Conditioning and Refrigeration",
        "review_due_at": "2029-10-04", "score": 0.833, "terms_matched": ["welding", "blueprint reading"],
        "terms_missing": [], "matched_skills": 5, "total_skills": 225, "skill_share": 0.022,
        "evidence": [{"term": "welding", "skills": ["Inspecting welding tools and equipment"]},
                     {"term": "blueprint reading", "skills": ["Measuring tools and blueprint reading"]}],
        "occupations": [{"occupation_id": 760, "title": "Ice Plant Refrigeration Technician"}]}],
    "occupations": [{
        "occupation_id": 760, "title": "Ice Plant Refrigeration Technician", "code": None, "psoc_code": None,
        "psoc_title": None, "sector": "Heating, Ventilation, Air-Conditioning and Refrigeration", "score": 0.833,
        "terms_matched": ["welding", "blueprint reading"], "terms_missing": [], "via": ["standards"],
        "matched_skills": 5, "open_posts": 0,
        "qualifications": [{"qualification_id": 371, "code": "HEA-NC3-0008",
                            "title": "Ice Plant Refrigeration Servicing", "level_label": "NC III",
                            "status": "promulgated", "terms_matched": 2}]}],
    "note": "score (0-1) is the share of input skills an entry covers.",
}
WELDER = {  # occupation_curriculum_profile(occupation_name="welder"): an exact title
    "occupation": {"occupation_id": 37, "title": "Welder", "code": None, "psoc_code": "7212",
                   "psoc_title": "WELDERS AND FLAME CUTTERS", "sector": "Metals and Engineering",
                   "description": None, "is_verified": True},
    "demand": {"open_posts": 2, "total_posts": 5, "open_workers": 4,
               "monthly_trend": [{"period": "2026-10", "label": "Oct", "value": 2}]},
    "has_promulgated_standard": True,
    "standards": [{"qualification_id": 162, "code": "MET-NC2-0004", "title": "Gas Welding",
                   "kind": "training_regulation", "kind_label": "Training Regulation", "level": "nc_2",
                   "level_label": "NC II", "status": "promulgated", "promulgated_at": "2026-10-04T10:28:48",
                   "review_due_at": "2029-10-04"}],
    "pathway": [{"level": "nc_2", "label": "NC II", "promulgated": True, "any_status": True}],
    "top_skills": [{"skill_id": 13628, "name": "Performing Tack welding", "type": "technical", "category": "hard",
                    "demand": 2, "is_covered": True}],
    "area_demand": [{"region": "National Capital Region", "posts": 2, "workers": 4}],
}
PROFILE_BY_NAME = {
    "welder": WELDER,
    "programmer": {"error": "No exact occupation match for 'programmer'. Pick one and retry with its occupation_id.",
                   "did_you_mean": [{"occupation_id": 776, "title": "CNC Programmer", "open_posts": 0},
                                    {"occupation_id": 184, "title": "Java Programmer", "open_posts": 1}]},
    "xyzzy plumbus": {"error": "No occupation matches 'xyzzy plumbus'."},
}
GRAPH_SEARCH = {
    "welder": {"results": [{"type": "skill", "id": 14142, "label": "Use of arc welder"},
                           {"type": "occupation", "id": 421, "label": "Gas Welder (Oxy-Acetylene)"},
                           {"type": "occupation", "id": 37, "label": "Welder"}]},
    "programmer": {"results": [{"type": "occupation", "id": 776, "label": "CNC Programmer"},
                               {"type": "occupation", "id": 184, "label": "Java Programmer"},
                               {"type": "occupation", "id": 367,
                                "label": "Mechatronics and Automation Programmer-Technician"},
                               {"type": "qualification", "id": 60, "label": "INF-NC3-0006"}]},
    "xyzzy plumbus": {"results": []},
}


def title_lookup(name, args):
    if name == "occupation_curriculum_profile" and set(args) == {"occupation_name"}:
        return PROFILE_BY_NAME[args["occupation_name"]]
    if name == "graph_search" and set(args) == {"term"}:
        return GRAPH_SEARCH[args["term"]]
    raise AssertionError(f"Unexpected Skills Bridge call: {name} {args}")


FRONT_END_DEVELOPER = {  # occupation_curriculum_profile(occupation_id=133)
    "occupation": {"occupation_id": 133, "title": "Front-end Web Developer", "code": None, "psoc_code": "3514",
                   "psoc_title": "WEB TECHNICIANS", "sector": "Information and Communications Technology",
                   "description": None, "is_verified": True},
    "demand": {"open_posts": 1, "total_posts": 1, "open_workers": 10,
               "monthly_trend": [{"period": "2026-10", "label": "Oct", "value": 1}]},
    "has_promulgated_standard": True,
    "standards": [
        {"qualification_id": 47, "code": "INF-NC3-0004", "title": "Web Development", "kind": "training_regulation",
         "kind_label": "Training Regulation", "level": "nc_3", "level_label": "NC III", "status": "promulgated",
         "promulgated_at": "2026-09-10T05:51:29", "review_due_at": "2029-09-10"},
        {"qualification_id": 60, "code": "INF-NC3-0006", "title": "Programming (Java)", "kind": "training_regulation",
         "kind_label": "Training Regulation", "level": "nc_3", "level_label": "NC III", "status": "draft",
         "promulgated_at": None, "review_due_at": None},
        {"qualification_id": 287, "code": "INF-NC3-0009", "title": "Programming (Java)",
         "kind": "training_regulation", "kind_label": "Training Regulation", "level": "nc_3",
         "level_label": "NC III", "status": "superseded", "promulgated_at": "2026-10-04T10:46:17",
         "review_due_at": "2029-10-04"}],
    "pathway": [{"level": "nc_3", "label": "NC III", "promulgated": True, "any_status": True}],
    "top_skills": [],
    "area_demand": [{"region": "National Capital Region", "posts": 1, "workers": 10}],
}


def graph_rows(cypher, rows):
    return {"error": None, "cypher": cypher, "columns": list(rows[0]) if rows else [], "rows": rows,
            "truncated": False}


@pytest.mark.parametrize("sse,text", [(False, False), (False, True), (True, False), (True, True)])
def test_handshake_and_read_only_skill_lookup(sse, text):
    server = MCPServer(sse=sse, text=text)
    with SkillsBridgeMCPClient(settings(skills_bridge_api_token="legacy-secret"), httpx.MockTransport(server)) as client:
        data = client.match_skills(["JavaScript"], 3)
    assert tool_calls(server) == [("match_skills", {"skills": ["JavaScript"], "limit": 3, "promulgated_only": True})]
    assert data["qualifications"][0]["code"] == "HEA-NC3-0008"
    assert [body["method"] for _, body in server.requests] == ["initialize", "notifications/initialized", "tools/call"]
    negotiated = server.requests[0][1]["params"]["protocolVersion"]
    assert all(request.headers["MCP-Protocol-Version"] == negotiated for request, _ in server.requests)
    assert all("authorization" not in request.headers for request, _ in server.requests)
    assert server.requests[-1][0].headers["Mcp-Session-Id"] == "test-session"
    assert client.http.is_closed


def test_skill_matches_pass_on_only_what_the_portal_shows():
    server = MCPServer(tool_result=lambda name, args: MATCH_SKILLS)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.match_skills(["welding", "blueprint reading"], 3)
    assert result == {
        "unmatched": [],
        "resolution": [{"term": "welding", "matched_skills": 133, "strength": "strong"},
                       {"term": "blueprint reading", "matched_skills": 8, "strength": "strong"}],
        "occupations": [{"occupation_id": 760, "title": "Ice Plant Refrigeration Technician",
                         "sector": "Heating, Ventilation, Air-Conditioning and Refrigeration", "score": 0.833,
                         "terms_matched": ["welding", "blueprint reading"], "open_posts": 0}],
        "qualifications": [{"code": "HEA-NC3-0008", "title": "Ice Plant Refrigeration Servicing",
                            "level_label": "NC III", "status": "promulgated", "review_due_at": "2029-10-04",
                            "terms_matched": ["welding", "blueprint reading"], "skill_share": 0.022,
                            "evidence": [{"term": "welding", "skills": ["Inspecting welding tools and equipment"]},
                                         {"term": "blueprint reading",
                                          "skills": ["Measuring tools and blueprint reading"]}]}],
    }


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
    assert data["occupations"][0]["occupation_id"] == 760
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


def test_occupation_titles_are_sent_only_as_plain_tool_arguments():
    hostile = "welder' }) DETACH DELETE o //"

    def tools(name, args):
        if name == "occupation_curriculum_profile":
            return {"error": f"No occupation matches '{args['occupation_name']}'."}
        return {"results": []}

    server = MCPServer(tool_result=tools)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        client.search_occupations(["welder", hostile])
    assert tool_calls(server) == [
        ("occupation_curriculum_profile", {"occupation_name": "welder"}), ("graph_search", {"term": "welder"}),
        ("occupation_curriculum_profile", {"occupation_name": hostile}), ("graph_search", {"term": hostile})]


def test_exact_title_comes_first_and_every_term_is_accounted_for():
    server = MCPServer(tool_result=title_lookup)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.search_occupations(["welder", "programmer", "xyzzy plumbus"])
    # Open posts appear only where Skills Bridge counted them; graph_search hits carry no count.
    assert result == {
        "unmatched": ["xyzzy plumbus"],
        "resolution": [{"term": "welder", "matched_occupations": 2, "strength": "exact"},
                       {"term": "programmer", "matched_occupations": 3, "strength": "partial"},
                       {"term": "xyzzy plumbus", "matched_occupations": 0, "strength": "unmatched"}],
        "occupations": [
            {"occupation_id": 37, "title": "Welder", "sector": "Metals and Engineering", "score": 1.0,
             "terms_matched": ["welder"], "open_posts": 2},
            {"occupation_id": 776, "title": "CNC Programmer", "sector": None, "score": 0.8,
             "terms_matched": ["programmer"], "open_posts": 0},
            {"occupation_id": 184, "title": "Java Programmer", "sector": None, "score": 0.8,
             "terms_matched": ["programmer"], "open_posts": 1},
            {"occupation_id": 421, "title": "Gas Welder (Oxy-Acetylene)", "sector": None, "score": 0.733,
             "terms_matched": ["welder"]},
            {"occupation_id": 367, "title": "Mechatronics and Automation Programmer-Technician", "sector": None,
             "score": 0.7, "terms_matched": ["programmer"]},
        ],
    }


def test_each_term_keeps_a_place_within_the_limit():
    server = MCPServer(tool_result=title_lookup)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.search_occupations(["welder", "programmer"], limit=3)
    # By score alone the third place would go to Java Programmer, leaving welder with one result.
    assert [item["title"] for item in result["occupations"]] == [
        "Welder", "CNC Programmer", "Gas Welder (Oxy-Acetylene)"]


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


def test_occupation_details_keep_current_standards_and_shown_fields():
    def tool(name, args):
        if name == "occupation_curriculum_profile":
            return FRONT_END_DEVELOPER
        if "NEEDS_SKILL" in args["cypher"]:
            return graph_rows(args["cypher"], [{"skill_id": 2274, "name": "HTML5, CSS3 and JavaScript",
                                                "type": "digital", "weight": 3}])
        return graph_rows(args["cypher"], [{"benchmark_id": 2671, "title": "webmaster", "status": "confirmed",
                                            "score": 1.0, "source": "esco", "standard": "ESCO v1.2.1",
                                            "sample_skills": ["use markup languages"]}])
    server = MCPServer(tool_result=tool)
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.occupation(133)
    # Draft and superseded standards are left out, as match_skills leaves them out with promulgated_only.
    assert result == {
        "profile": {"occupation": {"occupation_id": 133, "title": "Front-end Web Developer",
                                   "sector": "Information and Communications Technology"},
                    "standards": [{"code": "INF-NC3-0004", "title": "Web Development", "level_label": "NC III",
                                   "status": "promulgated", "review_due_at": "2029-09-10"}]},
        "skills": [{"skill_id": 2274, "name": "HTML5, CSS3 and JavaScript", "type": "digital"}],
        "benchmarks": [{"title": "webmaster", "status": "confirmed", "source": "esco", "standard": "ESCO v1.2.1",
                        "sample_skills": ["use markup languages"]}],
        "warnings": [],
    }


def test_occupation_uses_only_bounded_application_queries_and_keeps_partial_results():
    def tool(name, args):
        if name == "occupation_curriculum_profile":
            assert args == {"occupation_id": 133}
            return FRONT_END_DEVELOPER
        assert name == "graph_query" and set(args) == {"cypher"}
        assert "{id: 133}" in args["cypher"]
        if "NEEDS_SKILL" in args["cypher"]:
            assert "LIMIT 50" in args["cypher"]
            return graph_rows(args["cypher"], [{"skill_id": 1, "name": "JavaScript", "type": "digital", "weight": 1}])
        assert "LIMIT 20" in args["cypher"]
        return {"error": "private graph detail", "cypher": args["cypher"]}
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


def test_unknown_occupation_is_an_empty_profile_not_an_outage():
    server = MCPServer(tool_result=lambda name, args: {"error": "Occupation 999 not found."})
    with SkillsBridgeMCPClient(settings(), httpx.MockTransport(server)) as client:
        result = client.occupation(999)
    assert result == {"profile": {}, "skills": [], "benchmarks": [], "warnings": []}
    assert tool_calls(server) == [("occupation_curriculum_profile", {"occupation_id": 999})]


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


@pytest.mark.parametrize("first,second,shared", [
    ("2001:db8::1", "2001:db8::2", True),              # one IPv6 host can use its whole /64
    ("2001:db8::1", "2001:db8:0:1::1", False),
    ("::ffff:203.0.113.5", "203.0.113.5", True),
    ("203.0.113.5", "203.0.113.6", False),
])
def test_clients_are_counted_by_address_and_ipv6_network(first, second, shared):
    app, _, _ = make_api(skills_bridge_rate_limit_per_minute=1)
    with TestClient(app, client=(first, 50000)) as client:
        assert client.get("/api/v1/skills-bridge/occupations/133").status_code == 200
    with TestClient(app, client=(second, 50000)) as client:
        status = client.get("/api/v1/skills-bridge/occupations/133").status_code
    assert status == (429 if shared else 200)
