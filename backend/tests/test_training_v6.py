"""v6 multi-positive data: Filipino/Taglish drafts, owner grouping, neutral sibling levels, evaluation exclusions."""
import json

import pytest

from tesda_track.utils.helpers import normalize
from training import v6, v6_train
from training.catalog import load_catalog
from training.pairs import eval_exclusions


@pytest.fixture(scope="module")
def catalog():
    return load_catalog()[0]


def test_v6_drafts_use_exact_names_and_cover_every_qualification(catalog):
    names = {q.name for q in catalog}
    rows = v6.load_v6_rows(names)
    assert len(rows) >= 18 * len(names) * 0.9
    covered = {name for row in rows for name in row["accept"]}
    assert covered == names
    assert {row["lang"] for row in rows} == {"tl", "taglish"}
    assert {row["kind"] for row in rows} == v6.KINDS
    assert all(row["review_status"] == "draft" for row in rows)
    assert len({normalize(row["query"]) for row in rows}) == len(rows)


def test_load_v6_rows_rejects_unknown_names(tmp_path, catalog):
    (tmp_path / "bad.json").write_text(json.dumps([{"query": "hinang", "accept": ["Welding NC 9"], "lang": "tl",
                                                    "kind": "short", "review_status": "draft"}]), encoding="utf-8")
    with pytest.raises(ValueError, match="unknown qualification"):
        v6.load_v6_rows({q.name for q in catalog}, tmp_path)


def test_build_groups_every_owner_and_keeps_evaluation_goals_out(catalog):
    exclusions = eval_exclusions()
    probes = v6.probe_texts()
    items, audit = v6.build(catalog, exclusions, probes)
    assert audit["qualifications_without_queries"] == []
    assert audit["new_keys_by_source"]["v6_drafts"] > 4000
    assert all(not v6._excluded(text, exclusions, probes) for text, _ in items)
    labels = {normalize(text): set(owners) for text, owners in items}
    # A job several qualifications list keeps all of them as positives, not one pair each.
    welder = labels[normalize("gusto kong maging welder")]
    assert {"Manual Metal Arc Welding (MMAW) NC II", "Gas Metal Arc Welding (GMAW) NC II"} <= welder
    assert all(len(owners) <= v6.MAX_OWNERS for _, owners in items)
    # Goals with no TESDA qualification stay in as unrelated (no owners), never as a related query too.
    unrelated = {normalize(text) for text, owners in items if not owners}
    assert audit["unrelated_queries"] >= 500 and set(audit["unrelated_by_kind"]) == v6.UNRELATED_KINDS
    assert not unrelated & {normalize(text) for text, owners in items if owners}


def test_acceptance_gate_goals_never_train(catalog):
    policy = json.loads(v6.ACCEPTANCE.read_text(encoding="utf-8"))
    items, _ = v6.build(catalog)
    trained = {normalize(text) for text, _ in items}
    assert not trained & {normalize(goal) for goal in [*policy["must_match"], *policy["must_reject"]]}


def test_unrelated_rows_reject_labels(tmp_path):
    (tmp_path / "u.json").write_text(json.dumps([{"query": "abogado", "lang": "tl", "kind": "no_tvet",
                                                  "review_status": "draft", "accept": ["Cookery NC II"]}]),
                                     encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid unrelated row"):
        v6.load_unrelated(tmp_path)


def test_other_levels_are_neutral_unless_the_query_names_a_level(tmp_path, catalog):
    names = ["Cookery NC II", "Cookery NC III", "Bartending NC II"]
    data = {"profile": "v6", "audit": {}, "names": names, "passages": ["a", "b", "c"],
            "families": ["cookery", "cookery", "bartending"],
            "items": [["gusto kong maging cook", [0], False, False], ["Cookery NC II po", [0], True, True]]}
    path = tmp_path / "data.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    _, texts, positives, neutral, held = v6_train.load_dataset(path)
    assert positives.tolist() == [[True, False, False], [True, False, False]]
    assert neutral.tolist() == [[False, True, False], [False, False, False]]
    assert held.tolist() == [False, True]


def test_unrelated_rows_push_the_top_z_score_down():
    torch = pytest.importorskip("torch")
    flat = torch.zeros(1, 50)
    peaked = flat.clone()
    peaked[0, 3] = 10.0
    assert float(v6_train.Trainer.top_z(peaked)) > 6 > float(v6_train.Trainer.top_z(flat + torch.rand(1, 50) * 1e-3))


def test_dataset_keeps_case_variants_together_and_marks_levels(catalog):
    items = [("Hinang", ["Manual Metal Arc Welding (MMAW) NC II"]),
             ("hinang", ["Manual Metal Arc Welding (MMAW) NC II"]),
             ("Cookery NC II po", ["Cookery NC II"])] + [(f"q{i}", ["Cookery NC II"]) for i in range(200)]
    data = v6.dataset(catalog, items, {})
    rows = {row[0]: row for row in data["items"]}
    assert rows["Hinang"][3] == rows["hinang"][3]
    assert rows["Cookery NC II po"][2] is True and rows["hinang"][2] is False
    assert data["names"][rows["Cookery NC II po"][1][0]] == "Cookery NC II"
    assert len(data["passages"]) == len(data["families"]) == len(catalog)
