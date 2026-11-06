"""The suggestion evaluation: its arithmetic, its case files, and that it ranks with the API's own function."""
import json
import math
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from evaluation import suggestions as S
from tesda_track.schemas.analysis import Profile
from tesda_track.services import analysis, catalog, embeddings

TRAINING_DATA = Path(__file__).resolve().parents[1] / "training" / "data"


def case(judgments=None, expect_empty=False, skills=("welding",), **extra):
    return S.Case("c", "test", extra.pop("kind", "single"), "en", list(skills), judgments or {}, expect_empty, **extra)


def test_distribution_shows_collapse_onto_few_qualifications():
    cases = [case() for _ in range(4)]
    spread = S.distribution(cases, [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"], ["J", "K", "L"]], 12)
    collapsed = S.distribution(cases, [["A", "B", "C"]] * 4, 12)
    assert spread["catalog_coverage"] == 1 and collapsed["catalog_coverage"] == 0.25
    assert spread["entropy_normalised"] == pytest.approx(1.0)
    assert collapsed["entropy_normalised"] == pytest.approx(math.log(3) / math.log(12))
    assert collapsed["top5_share"] == 1 and collapsed["max_single_share"] == pytest.approx(1 / 3)


def test_distribution_ignores_profiles_with_nothing_to_suggest_from():
    result = S.distribution([case(skills=[]), case()], [[], []], 10)
    assert result["cases_with_signal"] == 1 and result["abstention_rate"] == 1


def test_labeled_metrics_separate_abstention_from_wrong_answers():
    cases = [case({"A": 3, "B": 2}), case({"A": 3}), case(expect_empty=True, skills=["communication"])]
    row = S.labeled(cases, [["B", "X"], [], []])
    assert row["recall_at_3"] == pytest.approx((0.5 + 0) / 2)
    assert row["abstained_on_positive"] == 0.5 and row["abstention_on_expected_empty"] == 1
    assert row["hit_at_3"] == 0.5
    assert row["shown_judged_grade2plus"] == 1 and row["shown_slots_unjudged"] == 1


def test_paired_bootstrap_interval_excludes_zero_only_for_a_real_difference():
    better = S.paired_bootstrap([1.0] * 40, [0.0] * 20 + [1.0] * 20)
    same = S.paired_bootstrap([1.0, 0.0] * 20, [0.0, 1.0] * 20)
    assert better["ci95"][0] > 0
    assert same["ci95"][0] < 0 < same["ci95"][1]


def test_gates_report_pass_fail_and_not_measured():
    report = {"sources": {"x": {"value": 0.5}}, "derived": {}}
    gates = {"gates": [{"id": "high", "metric": "sources.x.value", "minimum": 0.4},
                       {"id": "low", "metric": "sources.x.value", "maximum": 0.4},
                       {"id": "absent", "metric": "sources.y.value", "minimum": 0.1}]}
    assert {k: v["status"] for k, v in S.check_gates(report, gates).items()} == {
        "high": "pass", "low": "fail", "absent": "not_measured"}


def test_slices_smaller_than_k_are_suppressed():
    cases = [case({"A": 3}, region="NCR")] * 5 + [case({"A": 3}, region="CAR")]
    result = S.slices(cases, [["A"]] * 6, lambda c: c.region, k_min=5)
    assert result["NCR"]["n"] == 5 and result["CAR"] == {"n": "<5"}


@pytest.mark.parametrize("bad", [
    {"id": "x", "kind": "k", "language": "en", "skills": ["a"], "expect_empty": True, "judgments": {"A": 2}},
    {"id": "x", "kind": "k", "language": "en", "skills": ["a"], "judgments": {}},
    {"id": "x", "kind": "k", "language": "en", "skills": ["a"], "judgments": {"A": 4}},
    {"id": "x", "kind": "k", "language": "en", "skills": ["a"], "judgments": {"A": 2}, "origin": "guess"},
])
def test_case_files_reject_inconsistent_cases(bad):
    with pytest.raises(ValidationError):
        S.FileCase.model_validate(bad)


def test_expert_review_needs_named_reviewers():
    good = {"id": "x", "kind": "k", "language": "en", "skills": ["a"], "judgments": {"A": 2}}
    with pytest.raises(ValidationError):
        S.CaseFile(version="v", review_status="expert_reviewed", provenance="p", cases=[good])


def test_adversarial_cases_name_real_catalog_codes_and_cover_every_kind():
    from training.catalog import load_catalog

    _, items = load_catalog()
    data, cases = S.file_cases(S.ADVERSARIAL, "adversarial", {item.code for item in items})
    assert data.review_status == "engineering_draft"
    assert {c.kind for c in cases} >= {"empty", "generic", "taglish", "typo", "no_fit", "multi_skill", "mixed"}


def test_adversarial_skills_are_not_in_any_training_or_goal_data():
    """Held out: a skill the model trained on, or a goal the team already evaluates, would flatter the result."""
    def norm(text):
        return re.sub(r"\s+", " ", text.casefold()).strip()

    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict):
            for item in value.values():
                yield from strings(item)
        elif isinstance(value, list):
            for item in value:
                yield from strings(item)

    cases = json.loads(S.ADVERSARIAL.read_text(encoding="utf-8"))["cases"]
    mine = {norm(s) for c in cases for s in c["skills"] if s.strip()}
    mine |= {norm(", ".join(c["skills"])) for c in cases if c["skills"]}
    seen = {norm(s) for path in TRAINING_DATA.rglob("*.json")
            for s in strings(json.loads(path.read_text(encoding="utf-8")))}
    assert not mine & seen


def test_goal_set_cases_keep_labels_and_expected_empties_apart():
    from training.catalog import load_catalog

    _, items = load_catalog()
    cases = S.goal_set_cases("dev", {item.summary.name: item.code for item in items})
    kinds = {c.kind for c in cases}
    assert {"short", "job_title", "typo", "multi_skill", "mixed", "no_tvet"} <= kinds
    assert all(not c.judgments for c in cases if c.expect_empty)
    assert all(c.positive for c in cases if not c.expect_empty)
    assert all(len(c.skills) >= 2 for c in cases if c.kind in ("multi_skill", "mixed"))


def test_offline_ranking_is_the_api_suggestion(session, semantic):
    """The evaluator calls rank_suggestions with what suggest() would look up; both give the same suggestions."""
    profile = Profile(existing_skills=["welding", "reading drawings"])
    _, api = analysis.suggest(session, profile, semantic)
    current = catalog.snapshot(session)
    refined, = [Profile.model_validate(p) for p in [analysis.refine_profile(profile.model_dump())]]
    text = analysis.suggestion_text(refined)
    keyword = analysis.suggestion_keyword(text, refined, current.rule_views)
    similarities = embeddings.qualification_similarities(session, semantic, text)
    offline = analysis.rank_suggestions(current.items, keyword, similarities, analysis.match_params(semantic))
    assert [(m.qualification.code, m.score, m.reason) for m in offline] == \
        [(m.qualification.code, m.score, m.reason) for m in api]
    assert api, "the welding fixture should suggest something"


def test_offline_keyword_path_is_the_api_without_a_model(session):
    profile = Profile(existing_skills=["welding"])
    _, api = analysis.suggest(session, profile, None)
    current = catalog.snapshot(session)
    prepared = S.prepare([case(skills=["welding"])], list(current.items), None, None)
    assert S.ranked(prepared[0], list(current.items), None, use_model=False) == [m.qualification.code for m in api]
