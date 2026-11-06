"""Release gates must reject bad deployments and export only safe policy metadata."""
import json

from scripts import release_check


def configuration():
    env = {"DATABASE_URL": "PRIVATE_DATABASE_CREDENTIAL", "SECRET_KEY": "PRIVATE_SIGNING_KEY",
           "SEMANTIC_SEARCH_ENABLED": "false", "EMBEDDING_MODEL_PATH": "/app/finetuned/test"}
    for prefix, weights in (("PERSONALIZATION_WEIGHTS__", {"INTEREST": .35, "SKILL": .25, "CAREER": .15, "LOCATION": .15, "PREFERENCE": .1}),
                           ("RANKING_WEIGHTS__", {"SEMANTIC": .5, "PROXIMITY": .2, "ASSESSMENT": .15, "SCHEDULE": .1, "PREFERENCE": .05})):
        env.update({prefix + name: str(value) for name, value in weights.items()})
    return {"services": {"api": {"environment": env, "depends_on": {"migrate": {"condition": "service_completed_successfully"}}},
                         "migrate": {"environment": dict(env)}, "web": {}, "caddy": {"ports": [{}]}}}


def test_compose_report_never_exports_database_or_signing_credentials(monkeypatch):
    data = configuration()
    monkeypatch.setattr(release_check, "command", lambda *args, **kwargs: (0, json.dumps(data), "", 0))
    report = release_check.compose_check()
    assert report["passed"]
    assert "PRIVATE_DATABASE_CREDENTIAL" not in json.dumps(report)
    assert "PRIVATE_SIGNING_KEY" not in json.dumps(report)


def test_compose_rejects_invalid_weights_host_model_path_and_direct_api_ports(monkeypatch):
    data = configuration()
    data["services"]["api"]["environment"]["PERSONALIZATION_WEIGHTS__INTEREST"] = "0.9"
    data["services"]["api"]["environment"]["EMBEDDING_MODEL_PATH"] = "backend/models/test"
    data["services"]["api"]["ports"] = [{}]
    monkeypatch.setattr(release_check, "command", lambda *args, **kwargs: (0, json.dumps(data), "", 0))
    report = release_check.compose_check()
    assert not report["passed"]
    assert not report["checks"]["model_path_is_container_path"]
    assert not report["checks"]["only_proxy_publishes_ports"]
    assert not report["checks"]["personalization_weights__valid"]


def test_test_summary_preserves_failures_and_missing_results(tmp_path):
    path = tmp_path / "report.xml"
    assert release_check.test_summary(path)["report_missing"]
    path.write_text('<testsuites><testsuite><testcase classname="checks" name="good"/><testcase classname="checks" name="bad"><failure/></testcase><testcase classname="checks" name="skip"><skipped/></testcase></testsuite></testsuites>')
    report = release_check.test_summary(path)
    assert report["tests"] == 3 and report["passed_count"] == 1 and report["skipped"] == 1
    assert report["failed"] == ["checks.bad"]


def test_failure_boolean_cannot_be_overwritten_by_a_positive_pass_count(tmp_path):
    path = tmp_path / "report.xml"
    path.write_text('<testsuites><testsuite><testcase name="good"/><testcase name="bad"><failure/></testcase></testsuite></testsuites>')
    gate = {"passed": False, "exit_code": 1}
    gate.update(release_check.test_summary(path))
    assert gate["passed"] is False and gate["passed_count"] == 1


def test_a_pending_review_warns_on_routine_runs_but_fails_a_release():
    review = release_check.REVIEW_PENDING
    assert release_check.failing_blockers([review], review_warns=True) == []
    assert release_check.failing_blockers([review], review_warns=False) == [review]
    assert release_check.failing_blockers(["full_regression", review], review_warns=True) == ["full_regression"], \
        "only the review is downgraded"


def gates():
    return json.loads(release_check.SUGGESTION_GATES.read_text(encoding="utf-8"))


def every_gate(status):
    return {"gates": {gate["id"]: {"status": status} for gate in gates()["gates"]}}


def test_suggestions_need_a_report_passing_gates_and_assessors_who_agree():
    agreed = {"krippendorff_alpha_ordinal": 0.8}
    assert release_check.suggestion_blockers(None, agreed, gates()) == ["suggestion_evaluation_missing"]
    assert release_check.suggestion_blockers(every_gate("pass"), agreed, gates()) == []
    failed = every_gate("pass")
    failed["gates"]["adversarial_no_fit_abstains"] = {"status": "fail"}
    assert release_check.suggestion_blockers(failed, agreed, gates()) == ["suggestion_gate_failed:adversarial_no_fit_abstains"]
    assert release_check.suggestion_blockers(every_gate("pass"), {"krippendorff_alpha_ordinal": 0.5}, gates()) == [
        "suggestion_assessor_agreement_below_minimum"]


def test_unmeasured_suggestion_gates_warn_on_routine_runs_but_block_a_release():
    blocks = release_check.suggestion_blockers(every_gate("not_measured"), None, gates())
    assert blocks == [release_check.SUGGESTION_REVIEW_PENDING]
    assert release_check.failing_blockers(blocks, review_warns=True) == []
    assert release_check.failing_blockers(blocks, review_warns=False) == blocks


def test_optional_suggestion_gates_never_block():
    report = every_gate("pass")
    for gate in gates()["gates"]:
        if not gate["required"]:
            report["gates"][gate["id"]] = {"status": "fail"}
    assert release_check.suggestion_blockers(report, {"krippendorff_alpha_ordinal": 0.9}, gates()) == []
