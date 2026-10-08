"""Narrow read-only client for the Skills Bridge Streamable HTTP MCP service.

The verified endpoint negotiates MCP 2025-06-18. Tool names and queries are application-owned: learner terms
travel only as plain tool arguments, and the only Cypher sent is two fixed reads keyed by an integer id.
Responses are cut down to the fields TESDA-TRACK shows before anything is cached or returned.
"""
import json
from typing import Any

import httpx

from tesda_track.config import Settings


class SkillsBridgeMCPError(Exception):
    """An upstream error with a safe, learner-facing message."""


# What is kept of each kind of record; everything else Skills Bridge returns is dropped.
RESOLUTION_FIELDS = ("term", "matched_skills", "strength")
OCCUPATION_FIELDS = ("occupation_id", "title", "sector", "score", "terms_matched", "open_posts")
QUALIFICATION_FIELDS = ("code", "title", "level_label", "status", "review_due_at", "terms_matched", "skill_share",
                        "evidence")
STANDARD_FIELDS = ("code", "title", "level_label", "status", "review_due_at")
GRAPH_FIELDS = {"skills": ("skill_id", "name", "type"),
                "benchmarks": ("title", "status", "source", "standard", "sample_skills")}

# The only Cypher sent to Skills Bridge: fixed reads of one occupation. %d formats integers only.
OCCUPATION_QUERIES = {
    "skills": "MATCH (o:Occupation {id: %d})-[r:NEEDS_SKILL]->(s:Skill) "
              "RETURN s.id AS skill_id, s.name AS name, s.type AS type, r.weight AS weight "
              "ORDER BY weight DESC, name LIMIT 50",
    "benchmarks": "MATCH (o:Occupation {id: %d})-[m:BENCHMARKED_AS]->(b:BenchmarkOccupation) "
                  "OPTIONAL MATCH (standard:BenchmarkStandard)-[:DEFINES]->(b) "
                  "OPTIONAL MATCH (b)-[:DEMANDS]->(c:BenchmarkCompetency) "
                  "RETURN b.id AS benchmark_id, b.title AS title, m.status AS status, m.score AS score, "
                  "standard.source AS source, standard.title AS standard, "
                  "collect(DISTINCT c.title)[..10] AS sample_skills LIMIT 20",
}


def _records(data: dict, key: str) -> list[dict]:
    value = data.get(key)
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _pick(item: dict, fields: tuple[str, ...]) -> dict:
    return {field: item[field] for field in fields if field in item}


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _title_score(term: str, title: str) -> float:
    """0.6 for a title containing the term, rising to 1.0 as the term makes up more of it; 0.5 otherwise."""
    if term.casefold() not in title.casefold():
        return 0.5
    return round(min(1.0, 0.6 + 0.4 * len(term.split()) / max(len(title.split()), 1)), 3)


class SkillsBridgeMCPClient:
    PROTOCOL = "2025-06-18"
    ALLOWED_TOOLS = {"match_skills", "occupation_curriculum_profile", "graph_search", "graph_query"}
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
        # An event stream can carry notifications before the response; those have no matching id.
        if isinstance(message, dict) and message.get("id") == request_id:
            return SkillsBridgeMCPClient._result(message)
        return None

    @staticmethod
    def _result(message: dict) -> dict:
        if message.get("error") or not isinstance(message.get("result"), dict):
            raise SkillsBridgeMCPError("Skills Bridge could not complete this request. Please try again shortly.")
        return message["result"]

    def _call(self, name: str, arguments: dict, *, missing_ok: bool = False) -> dict[str, Any]:
        """Call one tool. Lookups by name or id report no match as ``{"error": ...}``; ``missing_ok`` hands
        that answer back to the caller instead of treating it as a failure."""
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
        if not isinstance(data, dict) or (data.get("error") and not missing_ok):
            raise SkillsBridgeMCPError("Skills Bridge could not complete this lookup. Please try again later.")
        return data

    def match_skills(self, skills: list[str], limit: int = 6) -> dict:
        data = self._call("match_skills", {"skills": skills, "limit": limit, "promulgated_only": True})
        unmatched = data.get("unmatched")
        return {"unmatched": [str(term) for term in unmatched] if isinstance(unmatched, list) else [],
                "resolution": [_pick(item, RESOLUTION_FIELDS) for item in _records(data, "resolution")],
                "occupations": [_pick(item, OCCUPATION_FIELDS) for item in _records(data, "occupations")],
                "qualifications": [_pick(item, QUALIFICATION_FIELDS) for item in _records(data, "qualifications")]}

    def search_occupations(self, occupations: list[str], limit: int = 6) -> dict:
        """Occupations by title: Skills Bridge's exact title or alias match first, then titles containing the
        term. Each term keeps a place within ``limit`` before the best remaining matches fill it."""
        limit = max(1, min(int(limit), 10))
        found: dict[int, dict] = {}
        ranked_ids, resolution, unmatched = [], [], []
        for term in occupations:
            matches, exact = self._title_matches(term)
            for item in matches:
                entry = found.setdefault(item["occupation_id"], {**item, "terms_matched": []})
                entry["terms_matched"].append(term)
                entry["score"] = max(entry["score"], item["score"])
                for key in ("sector", "open_posts"):
                    if entry.get(key) is None and item.get(key) is not None:
                        entry[key] = item[key]
            ranked_ids.append([item["occupation_id"] for item in matches])
            resolution.append({"term": term, "matched_occupations": len(matches),
                               "strength": "exact" if exact else "partial" if matches else "unmatched"})
            if not matches:
                unmatched.append(term)
        selected: list[int] = []
        for rank in range(max(map(len, ranked_ids), default=0)):
            for ids in ranked_ids:
                if rank < len(ids) and ids[rank] not in selected and len(selected) < limit:
                    selected.append(ids[rank])
        results = sorted((found[occupation_id] for occupation_id in selected),
                         key=lambda item: (-item["score"], item["title"]))
        return {"unmatched": unmatched, "resolution": resolution, "occupations": results}

    def _title_matches(self, term: str) -> tuple[list[dict], bool]:
        """One term's occupations, best first, and whether Skills Bridge matched a title or alias exactly."""
        profile = self._call("occupation_curriculum_profile", {"occupation_name": term}, missing_ok=True)
        search = self._call("graph_search", {"term": term})
        matches: dict[int, dict] = {}

        def add(occupation_id: Any, title: Any, score: float | None = None, **known: Any) -> bool:
            if not isinstance(occupation_id, int) or isinstance(occupation_id, bool) or occupation_id < 1 \
                    or not isinstance(title, str) or not title.strip():
                return False
            entry = matches.setdefault(occupation_id, {"occupation_id": occupation_id, "title": title, "sector": None,
                                                       "score": _title_score(term, title)})
            if score is not None:
                entry["score"] = score
            entry.update({key: value for key, value in known.items() if value is not None})
            return True

        exact = profile.get("occupation")
        is_exact = False
        if isinstance(exact, dict):
            demand = profile.get("demand") if isinstance(profile.get("demand"), dict) else {}
            is_exact = add(exact.get("occupation_id"), exact.get("title"), 1.0,
                           sector=exact.get("sector") if isinstance(exact.get("sector"), str) else None,
                           open_posts=_count(demand.get("open_posts")))
        for item in _records(profile, "did_you_mean"):
            add(item.get("occupation_id"), item.get("title"), open_posts=_count(item.get("open_posts")))
        for item in _records(search, "results"):
            if item.get("type") == "occupation":
                add(item.get("id"), item.get("label"))
        return sorted(matches.values(), key=lambda item: (-item["score"], item["title"])), is_exact

    def occupation(self, occupation_id: int) -> dict:
        occupation_id = int(occupation_id)
        if occupation_id < 1:
            raise ValueError("Occupation id must be positive")
        profile = self._call("occupation_curriculum_profile", {"occupation_id": occupation_id}, missing_ok=True)
        result = {"profile": {}, "skills": [], "benchmarks": [], "warnings": []}
        occupation = profile.get("occupation")
        if not isinstance(occupation, dict):
            return result  # Skills Bridge has no occupation with this id.
        # Learners see current standards only, as match_skills shows them with promulgated_only.
        result["profile"] = {"occupation": _pick(occupation, ("occupation_id", "title", "sector")),
                             "standards": [_pick(item, STANDARD_FIELDS) for item in _records(profile, "standards")
                                           if item.get("status") == "promulgated"]}
        for section, query in OCCUPATION_QUERIES.items():
            try:
                data = self._call("graph_query", {"cypher": query % occupation_id})
                if not isinstance(data.get("rows"), list):
                    raise SkillsBridgeMCPError("Unexpected graph response")
                result[section] = [_pick(row, GRAPH_FIELDS[section]) for row in _records(data, "rows")]
            except SkillsBridgeMCPError:
                result["warnings"].append(f"The {section} details could not be loaded. You can retry this occupation.")
        return result
