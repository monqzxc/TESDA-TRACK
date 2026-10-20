"""Scripted partner traffic and a comparison with the admin usage report.

Run against a live server: python -m tesda_track.mcp.traffic_check --base-url URL --tsp-id ... --tsp-secret ...
--bsrs-id ... --bsrs-secret ... --admin-token ...
The TSP client needs catalog:read and recommend:run, the BSRS client catalog:read, and each a rate limit of at least 20
calls a minute. The script sends a few dozen calls, then exits non-zero if the report differs from what was sent.
Two limits of a live run. A live server's clients can't be revoked from here, so its denied_token call is an
unattributed garbage-token denial, counted against the report's unattributed_denials. And the BSRS leg sends one call
more than get_regional_supply's per-minute limit, so running it twice within a minute can trip that limit early and
show a false mismatch. --qualification must name an active qualification on the server (default MMAW-NC-II).
"""
import argparse
import sys
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass

from tesda_track.mcp.scopes import TOOL_LIMITS

PROTOCOL = "2026-07-28"
UNATTRIBUTED = "(no client)"
OUTCOMES = ("ok", "tool_error", "denied_scope", "rate_limited")
MATCH_GOAL = "gusto kong maging welder"
NO_TRADE_GOAL = "hello there my friend"
GOALS = (MATCH_GOAL, NO_TRADE_GOAL)
Tally = dict[tuple[str, str, str], int]
Call = Callable[[str, str, dict], dict]  # (token, tool, arguments) -> {"status": HTTP status, "body": JSON-RPC reply}


@dataclass(frozen=True)
class Credentials:
    name: str
    token: str


def outcome_of(reply: dict) -> str:
    """What the server did, read from its reply alone."""
    if reply["status"] == 401:
        return "denied_token"
    body = reply["body"]
    code = body.get("error", {}).get("code")
    if code == -32602:
        return "denied_scope"
    if code == -32000:
        return "rate_limited"
    if "error" in body or reply["status"] != 200:
        return "server_error"
    return "tool_error" if body["result"].get("isError") else "ok"


def run_traffic(call: Call, tsp: Credentials, bsrs: Credentials, qualification: str = "MMAW-NC-II") -> Tally:
    """Send the fixed script and count each call by (client, tool, outcome) as the replies describe it."""
    tally: Counter = Counter()

    def send(who: Credentials, tool: str, arguments: dict) -> None:
        tally[(who.name, tool, outcome_of(call(who.token, tool, arguments)))] += 1

    for _ in range(3):
        send(tsp, "match_qualifications", {"goal": MATCH_GOAL, "limit": 3})
    send(tsp, "match_qualifications", {"goal": NO_TRADE_GOAL})
    for _ in range(2):
        send(tsp, "get_qualification", {"code": qualification})
    send(tsp, "rank_training_programs", {"qualification_code": qualification, "goal": MATCH_GOAL})
    send(tsp, "get_qualification_demand", {"quarter": "2020-Q1"})
    for _ in range(2):
        send(bsrs, "search_training_programs", {"region_code": "NCR"})
    # One call more than the tool's per-minute limit, so exactly the last is refused.
    for _ in range(TOOL_LIMITS["get_regional_supply"] + 1):
        send(bsrs, "get_regional_supply", {})
    outcome = outcome_of(call("not-a-token", "get_qualification", {"code": qualification}))
    tally[(UNATTRIBUTED, "", outcome)] += 1
    return dict(tally)


def usage_counts(report: dict) -> Tally:
    """The admin report's counts as (client name, tool, outcome), plus denials with no client."""
    counts: Tally = {}
    for client in report["clients"]:
        for tool in client["tools"]:
            for outcome in OUTCOMES:
                if tool[outcome]:
                    counts[(client["name"], tool["tool"], outcome)] = tool[outcome]
        if client["by_outcome"].get("denied_token"):
            counts[(client["name"], "", "denied_token")] = client["by_outcome"]["denied_token"]
    if report["unattributed_denials"]:
        counts[(UNATTRIBUTED, "", "denied_token")] = report["unattributed_denials"]
    return counts


def differences(tally: Tally, before: Tally, after: Tally) -> list[str]:
    """One line for every (client, tool, outcome) where what was sent differs from what the report gained."""
    problems = []
    for key in sorted(set(tally) | set(before) | set(after)):
        sent, reported = tally.get(key, 0), after.get(key, 0) - before.get(key, 0)
        if sent != reported:
            problems.append(f"{key[0]} / {key[1] or '-'} / {key[2]}: sent {sent}, reported {reported}")
    return problems


def _live_call(base_url: str):
    import httpx

    def call(token: str, tool: str, arguments: dict) -> dict:
        meta = {"io.modelcontextprotocol/protocolVersion": PROTOCOL,
                "io.modelcontextprotocol/clientInfo": {"name": "traffic-check", "version": "1"},
                "io.modelcontextprotocol/clientCapabilities": {}}
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": tool, "arguments": arguments, "_meta": meta}}
        response = httpx.post(f"{base_url}/mcp", json=body, timeout=60, headers={
            "Authorization": f"Bearer {token}", "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": PROTOCOL, "Mcp-Method": "tools/call", "Mcp-Name": tool})
        try:
            reply = response.json()
        except ValueError:
            reply = {}
        return {"status": response.status_code, "body": reply}
    return call


def main(argv: list[str] | None = None) -> int:
    import httpx

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", required=True)
    for name in ("tsp", "bsrs"):
        parser.add_argument(f"--{name}-id", required=True)
        parser.add_argument(f"--{name}-secret", required=True)
    parser.add_argument("--qualification", default="MMAW-NC-II", help="an active qualification code on the server")
    parser.add_argument("--admin-token", required=True, help="an admin's bearer token for the usage report")
    args = parser.parse_args(argv)
    base = args.base_url.rstrip("/")
    admin = {"Authorization": f"Bearer {args.admin_token}"}

    def fetch_report() -> dict:
        response = httpx.get(f"{base}/api/v1/admin/mcp/usage", headers=admin, timeout=60)
        response.raise_for_status()
        return response.json()

    names = {item["id"]: item["name"] for item in
             httpx.get(f"{base}/api/v1/admin/mcp/clients", headers=admin, timeout=60).raise_for_status().json()}

    def credentials(client_id: str, secret: str) -> Credentials:
        response = httpx.post(f"{base}/api/v1/oauth/token", data={"grant_type": "client_credentials"},
                              auth=(client_id, secret), timeout=60)
        response.raise_for_status()
        return Credentials(names[client_id], response.json()["access_token"])

    tsp, bsrs = credentials(args.tsp_id, args.tsp_secret), credentials(args.bsrs_id, args.bsrs_secret)
    before = usage_counts(fetch_report())
    tally = run_traffic(_live_call(base), tsp, bsrs, args.qualification)
    after = usage_counts(fetch_report())
    for key, count in sorted(tally.items()):
        print(f"sent {count:3d}  reported {after.get(key, 0) - before.get(key, 0):3d}  {key[0]} / {key[1] or '-'} / {key[2]}")
    problems = differences(tally, before, after)
    print("The usage report matches the traffic." if not problems else "MISMATCH:\n" + "\n".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
