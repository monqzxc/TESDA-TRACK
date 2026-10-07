"""Narrow read-only client for the Skills Bridge Streamable HTTP MCP service.

The verified endpoint negotiates MCP 2025-03-26. Queries are application-owned;
neither tool names, arbitrary Cypher, nor destination URLs come from learners.
"""
import json
from typing import Any

import httpx

from tesda_track.config import Settings


class SkillsBridgeMCPError(Exception):
    """An upstream error with a safe, learner-facing message."""


class SkillsBridgeMCPClient:
    PROTOCOL = "2025-03-26"
    ALLOWED_TOOLS = {"match_skills", "occupation_curriculum_profile", "graph_query"}
    MAX_RESPONSE_BYTES = 2_000_000
    CLOSE_TIMEOUT_SECONDS = 3

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.transport = transport
        self.http: httpx.Client | None = None
        self.request_id = 0

    def __enter__(self):
        if not self.settings.skills_bridge_mcp_enabled:
            raise SkillsBridgeMCPError("Skills Bridge is currently disabled. Your TESDA Track pathways are still available.")
        headers = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": self.PROTOCOL}
        token = self.settings.skills_bridge_mcp_token
        if token and token.get_secret_value():
            headers["Authorization"] = f"Bearer {token.get_secret_value()}"
        self.http = httpx.Client(headers=headers, timeout=self.settings.skills_bridge_timeout_seconds,
                                 transport=self.transport, follow_redirects=False)
        try:
            result = self._rpc("initialize", {"protocolVersion": self.PROTOCOL, "capabilities": {},
                                               "clientInfo": {"name": "tesda-track", "version": "1.0"}})
            if result.get("protocolVersion") != self.PROTOCOL:
                raise SkillsBridgeMCPError("Skills Bridge changed its connection protocol. Please contact the portal administrator.")
            self._rpc("notifications/initialized", notification=True)
            return self
        except Exception:
            self._close()
            raise

    def __exit__(self, *_):
        if self.http:
            self._close()

    def _close(self) -> None:
        """End the server-side session, if the server started one, then close the connection."""
        try:
            if "Mcp-Session-Id" in self.http.headers:
                self.http.delete(str(self.settings.skills_bridge_mcp_url), timeout=self.CLOSE_TIMEOUT_SECONDS)
        except httpx.HTTPError:
            pass  # Best effort: the server expires idle sessions itself.
        finally:
            self.http.close()

    def _rpc(self, method: str, params: dict | None = None, *, notification: bool = False) -> dict:
        self.request_id += 1
        request_id = self.request_id
        payload = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        if not notification:
            payload["id"] = request_id
        try:
            with self.http.stream("POST", str(self.settings.skills_bridge_mcp_url), json=payload) as response:
                response.raise_for_status()
                if method == "initialize" and response.headers.get("mcp-session-id"):
                    self.http.headers["Mcp-Session-Id"] = response.headers["mcp-session-id"]
                if notification:
                    return {}
                if "text/event-stream" in response.headers.get("content-type", ""):
                    data_lines, size = [], 0
                    for line in response.iter_lines():
                        size += len(line.encode("utf-8"))
                        if size > self.MAX_RESPONSE_BYTES:
                            raise ValueError("Response too large")
                        if line.startswith("data:"):
                            data_lines.append(line[5:].lstrip())
                        elif not line and data_lines:
                            message = json.loads("\n".join(data_lines))
                            data_lines = []
                            result = self._matching_result(message, request_id)
                            if result is not None:
                                return result
                    # Some proxies omit the final event separator.
                    if data_lines:
                        message = json.loads("\n".join(data_lines))
                        result = self._matching_result(message, request_id)
                        if result is not None:
                            return result
                    raise ValueError("Missing RPC response")
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > self.MAX_RESPONSE_BYTES:
                        raise ValueError("Response too large")
                    chunks.append(chunk)
                message = json.loads(b"".join(chunks))
                result = self._matching_result(message, request_id)
                if result is None:
                    raise ValueError("Mismatched RPC response")
                return result
        except (httpx.HTTPError, ValueError, TypeError, AttributeError) as error:
            raise SkillsBridgeMCPError("Skills Bridge is unavailable right now. Please try again shortly.") from error

    @staticmethod
    def _matching_result(message: Any, request_id: int) -> dict | None:
        # MCP 2025-03-26 can batch responses together with unrelated notifications.
        messages = message if isinstance(message, list) else [message]
        for item in messages:
            if isinstance(item, dict) and item.get("id") == request_id:
                return SkillsBridgeMCPClient._result(item)
        return None

    @staticmethod
    def _result(message: dict) -> dict:
        if message.get("error") or not isinstance(message.get("result"), dict):
            raise SkillsBridgeMCPError("Skills Bridge could not complete this request. Please try again shortly.")
        return message["result"]

    def _call(self, name: str, arguments: dict) -> dict[str, Any]:
        if name not in self.ALLOWED_TOOLS:
            raise ValueError("Tool is not allowed")
        result = self._rpc("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError"):
            raise SkillsBridgeMCPError("Skills Bridge could not complete this lookup. Please try a different search.")
        data = result.get("structuredContent")
        if data is None:
            try:
                data = json.loads(next(block["text"] for block in result.get("content", []) if block.get("type") == "text"))
            except (ValueError, StopIteration, KeyError, TypeError) as error:
                raise SkillsBridgeMCPError("Skills Bridge returned an unreadable response. Please try again later.") from error
        if not isinstance(data, dict) or data.get("error"):
            raise SkillsBridgeMCPError("Skills Bridge could not complete this lookup. Please try again later.")
        return data

    def match_skills(self, skills: list[str], limit: int = 6) -> dict:
        return self._call("match_skills", {"skills": skills, "limit": limit, "promulgated_only": True})

    def search_occupations(self, occupations: list[str], limit: int = 6) -> dict:
        """Search occupation titles with a bounded, application-owned graph query.

        Skills Bridge currently exposes ``match_skills`` for capability terms and the read-only
        ``graph_query`` tool for graph lookups; it does not expose a dedicated occupation-search tool.
        The query shape is fixed here so learner text can never become arbitrary Cypher.
        """
        terms = [str(term).strip().casefold() for term in occupations if str(term).strip()]
        if not terms:
            return {"input": {"occupations": []}, "occupations": [], "unmatched": [], "resolution": []}
        terms_literal = json.dumps(terms, ensure_ascii=True)
        bounded_limit = max(1, min(int(limit), 10))
        query = (
            "MATCH (o:Occupation) "
            f"WHERE any(term IN {terms_literal} WHERE toLower(coalesce(o.title, o.name, '')) CONTAINS term) "
            "RETURN o.id AS occupation_id, coalesce(o.title, o.name) AS title, o.sector AS sector "
            f"ORDER BY title LIMIT {bounded_limit}"
        )
        data = self._call("graph_query", {"cypher": query})
        rows = data.get("rows")
        if not isinstance(rows, list):
            raise SkillsBridgeMCPError("Unexpected occupation search response")
        results = []
        matched_terms = set()
        for row in rows:
            if not isinstance(row, dict) or not row.get("occupation_id") or not row.get("title"):
                continue
            title = str(row["title"])
            title_lower = title.casefold()
            terms_matched = [term for term in terms if term in title_lower]
            matched_terms.update(terms_matched)
            score = max((min(1.0, 0.6 + 0.4 * len(term.split()) / max(len(title.split()), 1))
                         for term in terms_matched), default=0.0)
            results.append({"occupation_id": int(row["occupation_id"]), "title": title,
                            "sector": row.get("sector"), "score": round(score, 3),
                            "terms_matched": terms_matched, "open_posts": 0})
        results.sort(key=lambda item: (-item["score"], item["title"]))
        return {"input": {"occupations": occupations}, "occupations": results,
                "unmatched": [term for term in occupations if str(term).casefold() not in matched_terms],
                "resolution": [{"term": term, "matched_occupations": sum(term.casefold() in str(row.get("title", "")).casefold() for row in results),
                                "strength": "strong" if str(term).casefold() in matched_terms else "unmatched"}
                               for term in occupations]}

    def occupation(self, occupation_id: int) -> dict:
        occupation_id = int(occupation_id)
        if occupation_id < 1:
            raise ValueError("Occupation id must be positive")
        profile = self._call("occupation_curriculum_profile", {"occupation_id": occupation_id})
        result = {"profile": profile, "skills": [], "benchmarks": [], "warnings": [], "skills_limit": 50}
        if not profile.get("occupation"):
            return result
        queries = {
            "skills": f"MATCH (o:Occupation {{id: {occupation_id}}})-[r:NEEDS_SKILL]->(s:Skill) "
                      "RETURN s.id AS skill_id, s.name AS name, s.type AS type, r.weight AS weight "
                      "ORDER BY weight DESC, name LIMIT 50",
            "benchmarks": f"MATCH (o:Occupation {{id: {occupation_id}}})-[m:BENCHMARKED_AS]->(b:BenchmarkOccupation) "
                          "OPTIONAL MATCH (standard:BenchmarkStandard)-[:DEFINES]->(b) "
                          "OPTIONAL MATCH (b)-[:DEMANDS]->(c:BenchmarkCompetency) "
                          "RETURN b.id AS benchmark_id, b.title AS title, m.status AS status, m.score AS score, "
                          "standard.source AS source, standard.title AS standard, "
                          "collect(DISTINCT c.title)[..10] AS sample_skills LIMIT 20",
        }
        for section, query in queries.items():
            try:
                data = self._call("graph_query", {"cypher": query})
                if not isinstance(data.get("rows"), list):
                    raise SkillsBridgeMCPError("Unexpected graph response")
                result[section] = data["rows"]
            except SkillsBridgeMCPError:
                result["warnings"].append(f"The {section} details could not be loaded. You can retry this occupation.")
        return result
