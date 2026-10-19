"""Produce a reproducible release report. Never deploys or modifies the live database.

Run: .venv/Scripts/python.exe scripts/release_check.py --build-images
Tests rebuild only TEST_DATABASE_URL, which the existing fixtures require to end in _test.
"""
import argparse
import hashlib
import json
import math
import os
import platform
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def command(args, *, cwd=ROOT, env=None, timeout=1200):
    start = time.perf_counter()
    try:
        result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=timeout)
        return result.returncode, result.stdout, result.stderr, round(time.perf_counter() - start, 3)
    except (OSError, subprocess.TimeoutExpired) as error:
        return -1, "", type(error).__name__, round(time.perf_counter() - start, 3)


def test_summary(path):
    if not path.is_file():
        return {"report_missing": True}
    cases = list(ET.parse(path).iter("testcase"))
    return {"tests": len(cases), "passed_count": sum(not any(c.find(t) is not None for t in ("failure", "error", "skipped")) for c in cases),
            "failed": [f"{c.get('classname')}.{c.get('name')}" for c in cases if c.find("failure") is not None],
            "errors": [f"{c.get('classname')}.{c.get('name')}" for c in cases if c.find("error") is not None],
            "skipped": sum(c.find("skipped") is not None for c in cases)}


def fingerprint():
    _, commit, _, _ = command(["git", "rev-parse", "HEAD"])
    _, listing, _, _ = command(["git", "ls-files", "--cached", "--others", "--exclude-standard"])
    digest = hashlib.sha256()
    for name in sorted(set(listing.splitlines())):
        path = ROOT / name
        if path.is_file() and (path.suffix in (".py", ".json", ".yml", ".toml", ".txt") or path.name == "Dockerfile") and name != ".env":
            digest.update(name.encode())
            digest.update(path.read_bytes())
    return {"git_commit": commit.strip(), "source_sha256": digest.hexdigest(), "python": platform.python_version(),
            "platform": platform.platform()}


def compose_check():
    # The expanded document contains secrets. Keep it in memory, export only policy/build metadata.
    code, stdout, _, duration = command(["docker", "compose", "config", "--format", "json"])
    if code:
        return {"passed": False, "reason": "Docker Compose configuration unavailable or invalid", "seconds": duration}
    data = json.loads(stdout)
    services = data["services"]
    api = services["api"]["environment"]
    keys = [k for k in api if k.startswith(("PERSONALIZATION_WEIGHTS__", "RANKING_WEIGHTS__"))]
    public_services = [k for k, v in services.items() if v.get("ports")]
    checks = {"only_proxy_publishes_ports": public_services == ["caddy"],
              "scoring_weights_present": len(keys) == 10,
              "semantic_toggle_present": "SEMANTIC_SEARCH_ENABLED" in api,
              "migration_uses_same_policy": all(services["migrate"]["environment"].get(k) == api[k] for k in keys),
              "api_waits_for_migration": services["api"]["depends_on"]["migrate"]["condition"] == "service_completed_successfully"}
    for prefix in ("PERSONALIZATION_WEIGHTS__", "RANKING_WEIGHTS__"):
        try:
            weights = [float(api[k]) for k in keys if k.startswith(prefix)]
            checks[prefix.lower() + "valid"] = len(weights) == 5 and all(0 <= w <= 1 for w in weights) and math.isclose(sum(weights), 1)
        except (TypeError, ValueError):
            checks[prefix.lower() + "valid"] = False
    model_path = api.get("EMBEDDING_MODEL_PATH")
    checks["model_path_is_container_path"] = not model_path or model_path.startswith("/app/finetuned/")
    return {"passed": all(checks.values()), "checks": checks, "seconds": duration,
            "policy_environment": {k: api[k] for k in keys}, "semantic_search_enabled": api.get("SEMANTIC_SEARCH_ENABLED"),
            "model_path": model_path,
            "model_path_remedy": "Set DOCKER_EMBEDDING_MODEL_PATH=/app/finetuned/<folder> when EMBEDDING_MODEL_PATH is a host path." if not checks["model_path_is_container_path"] else None}


def build_check(name, args):
    print(f"Building {name} release-check image…", flush=True)
    code, _, _, duration = command(["docker", "build", *args], timeout=1800)
    result = {"passed": code == 0, "seconds": duration}
    if code:
        result["reason"] = "Image build failed; rebuild locally to inspect Docker diagnostics. Secrets are not copied into this report."
    return result


def image_smoke():
    # Read only the test DB's credentials. Never put their values in process arguments or reports.
    from dotenv import dotenv_values
    from sqlalchemy import make_url
    import httpx

    values = dotenv_values(ROOT / ".env")
    raw = os.environ.get("TEST_DATABASE_URL") or values.get("TEST_DATABASE_URL")
    if not raw or not (make_url(raw).database or "").endswith("_test"):
        return {"passed": False, "reason": "A disposable TEST_DATABASE_URL is required"}
    code, db_id, _, _ = command(["docker", "compose", "-f", "docker-compose.dev.yml", "ps", "-q", "db"])
    if code or not db_id.strip():
        return {"passed": False, "reason": "Development database container is required for isolated image smoke"}
    code, inspected, _, _ = command(["docker", "inspect", db_id.strip()])
    if code:
        return {"passed": False, "reason": "Cannot inspect the disposable database network"}
    network = next(iter(json.loads(inspected)[0]["NetworkSettings"]["Networks"]))
    environment = os.environ.copy()
    environment.pop("TESDA_MODEL_TESTS", None)
    environment.update(DATABASE_URL=make_url(raw).set(host="db", port=5432).render_as_string(hide_password=False),
                       SECRET_KEY="isolated-release-container-secret-only-0123456789", ENVIRONMENT="test",
                       SEMANTIC_SEARCH_ENABLED="false", SKILLS_BRIDGE_MCP_ENABLED="false")
    containers, checks = [], {}
    try:
        for name, port in (("backend", 8000), ("web", 8501)):
            args = ["docker", "run", "--rm", "-d", "--network", network, "-p", f"127.0.0.1::{port}"]
            if name == "backend":
                for key in ("DATABASE_URL", "SECRET_KEY", "ENVIRONMENT", "SEMANTIC_SEARCH_ENABLED", "SKILLS_BRIDGE_MCP_ENABLED"):
                    args.extend(["-e", key])
            else:
                args.extend(["-e", "API_BASE_URL=http://127.0.0.1:1"])
            args.append(f"tesda-track-{name}:release-check")
            code, container_id, _, _ = command(args, env=environment, timeout=60)
            if code:
                checks[name] = False
                continue
            container_id = container_id.strip()
            containers.append(container_id)
            _, inspected, _, _ = command(["docker", "inspect", container_id])
            assigned = json.loads(inspected)[0]["NetworkSettings"]["Ports"][f"{port}/tcp"][0]["HostPort"]
            base = f"http://127.0.0.1:{assigned}"
            deadline, healthy = time.monotonic() + 45, False
            while time.monotonic() < deadline:
                try:
                    healthy = httpx.get(base + ("/health" if name == "backend" else "/_stcore/health"), timeout=2).status_code == 200
                    if healthy:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.5)
            checks[f"{name}_health"] = healthy
            if name == "backend" and healthy:
                request = {"qualification_code": "SMAW-NC-II", "assessment": {"interests": ["welding"]}}
                response = httpx.post(base + "/api/v1/recommendations/assessments", json=request, timeout=20)
                checks["assessment_endpoint"] = response.status_code == 200 and response.json().get("result_type") == "assessment"
                response = httpx.post(base + "/api/v1/recommendations/qualifications", json={"assessment": {"interests": ["welding"]}}, timeout=20)
                checks["structured_qualification_endpoint"] = response.status_code == 200 and bool(response.json().get("matches"))
        return {"passed": len(containers) == 2 and bool(checks) and all(checks.values()), "checks": checks,
                "profile": "Model disabled; isolated test database; ephemeral ports; containers removed after checks"}
    finally:
        for container_id in containers:
            command(["docker", "rm", "-f", container_id], timeout=30)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output-dir", type=Path, default=ROOT / "reports")
    parser.add_argument("--build-images", action="store_true")
    parser.add_argument("--skip-model", action="store_true", help="Reports the optional real-model guard as not run")
    args = parser.parse_args(argv)
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    # Never reuse stale metrics when a later run fails before producing its report.
    for filename in ("regression.xml", "model.xml", "qualification-evaluation.json", "service-evaluation.json"):
        (output / filename).unlink(missing_ok=True)
    report = {"release_check_version": "release-check-v1", "started_at": datetime.now(timezone.utc).isoformat(),
              "source": fingerprint(), "checks": {}}
    checks = report["checks"]
    environment = os.environ.copy()
    environment.pop("TESDA_MODEL_TESTS", None)
    environment["TESDA_SERVICE_EVALUATION_REPORT"] = str(output / "service-evaluation.json")

    def run_gate(name, args, **kwargs):
        print(f"Running {name}…", flush=True)
        code, _, _, duration = command(args, **kwargs)
        checks[name] = {"passed": code == 0, "exit_code": code, "seconds": duration}
        return code

    run_gate("dependency_consistency", [sys.executable, "-m", "pip", "check"])
    run_gate("whitespace", ["git", "diff", "--check"])
    run_gate("full_regression", [sys.executable, "-m", "pytest", "-q", "--tb=no", f"--junitxml={output / 'regression.xml'}"], env=environment)
    checks["full_regression"].update(test_summary(output / "regression.xml"))
    run_gate("migration_drift", [sys.executable, "-m", "alembic", "check"], cwd=ROOT / "backend")
    run_gate("qualification_evaluation", [sys.executable, "-m", "evaluation.qualifications", "--output", str(output / "qualification-evaluation.json")], cwd=ROOT / "backend")
    report["qualification_evaluation"] = json.loads((output / "qualification-evaluation.json").read_text()) if (output / "qualification-evaluation.json").is_file() else None
    report["service_evaluation"] = json.loads((output / "service-evaluation.json").read_text()) if (output / "service-evaluation.json").is_file() else None
    checks["compose_configuration"] = compose_check()
    # Schema rebuilds occur in separate processes sequentially, never concurrently.
    if not args.skip_model:
        environment.update(TESDA_MODEL_TESTS="1", HF_HUB_OFFLINE="1")
        run_gate("optional_model_guard", [sys.executable, "-m", "pytest", "backend/tests/test_semantic.py::test_real_model_on_the_real_catalog", "-q", "--tb=no", f"--junitxml={output / 'model.xml'}"], env=environment)
        checks["optional_model_guard"].update(test_summary(output / "model.xml"))
    else:
        checks["optional_model_guard"] = {"passed": None, "status": "not_run"}
    if args.build_images:
        checks["backend_image_build"] = build_check("backend", ["--build-arg", "SEMANTIC_SEARCH_ENABLED=false", "-t", "tesda-track-backend:release-check", "backend"])
        checks["web_image_build"] = build_check("web", ["-t", "tesda-track-web:release-check", "classic"])
        if checks["backend_image_build"]["passed"] and checks["web_image_build"]["passed"]:
            checks["image_smoke"] = image_smoke()
    else:
        checks["container_builds"] = {"passed": None, "status": "not_run"}
    model_enabled = checks["compose_configuration"].get("semantic_search_enabled", "false").lower() == "true"
    blocks = [name for name, result in checks.items() if result.get("passed") is False and
              (name != "optional_model_guard" or model_enabled)]
    if model_enabled and checks["optional_model_guard"].get("passed") is not True:
        blocks.append("enabled_model_not_validated")
    if not report["qualification_evaluation"] or not report["qualification_evaluation"]["expert_review_complete"]:
        blocks.append("expert_relevance_review_pending")
    if not report["service_evaluation"]:
        blocks.append("service_evaluation_missing")
    if not args.build_images:
        blocks.append("container_builds_not_checked")
    report.update(completed_at=datetime.now(timezone.utc).isoformat(), blockers=blocks,
                  release_ready=not blocks, limitations=["Source records and relevance judgments need expert review before a production rollout.",
                    "Sequential latency measurements are not a concurrent-load SLA.", "No production deployment was performed."])
    destination = output / "release-check.json"
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(destination), "release_ready": report["release_ready"], "blockers": blocks,
                      "regression": checks["full_regression"]}, indent=2), flush=True)
    return 0 if report["release_ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
