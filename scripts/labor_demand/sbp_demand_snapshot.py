"""Save Skills Bridge's aggregate job-post demand (read-only MCP tools) as one JSON snapshot.
Usage (repo root): python -I -X utf8 sbp_demand_snapshot.py <repo_root> <out_json> <date>"""
import json, os, sys
root, out, date = sys.argv[1:4]; sys.path.insert(0, os.path.join(root, "backend")); os.chdir(root)
from tesda_track.config import get_settings
from tesda_track.services.skills_bridge_mcp import SkillsBridgeMCPClient
CALLS = {"demand_by_occupation_all_statuses": ("demand_by_occupation", {"open_only": False, "limit": 50}),
         "demand_by_occupation_open": ("demand_by_occupation", {"limit": 50}),
         "occupation_demand_by_region": ("occupation_demand_by_region", {}),
         "area_demand": ("area_demand", {}),
         "job_post_trend_24_months": ("job_post_trend", {"months": 24})}
snapshot = {"source": "Skills Bridge MCP (mcp.skills-bridge.ph), read-only tools", "snapshot_date": date}
with SkillsBridgeMCPClient(get_settings()) as client:
    for key, (tool, args) in CALLS.items():
        result = client._rpc("tools/call", {"name": tool, "arguments": args})
        snapshot[key] = (result.get("structuredContent") or {}).get("result", result)
open(out, "w", encoding="utf-8").write(json.dumps(snapshot, indent=2))
trend = snapshot["job_post_trend_24_months"]
print("posts ever:", sum(p["value"] for p in trend), "| all-status occupations:", snapshot["demand_by_occupation_all_statuses"])
