from tesda_track.utils.helpers import normalize
from training.catalog import load_catalog
from training.pairs import eval_exclusions, training_pairs


def test_pairs_cover_jobs_keywords_and_templates_for_every_qualification():
    qualifications, _ = load_catalog()
    pairs = training_pairs(qualifications, exclude=set())
    passages = {passage for _, passage in pairs}
    assert len(passages) == len(qualifications)
    queries = {query for query, passage in pairs if passage.startswith("Cookery NC II.")}
    normalized = {normalize(query) for query in queries}
    assert {"karinderya", "cook", "gusto kong maging cook", "i want to work as a chef"} <= normalized
    assert {"I want to work as a Chef", "i want to work as a chef"} <= queries  # as typed in the catalog and lower case


def test_evaluation_goals_never_become_training_queries():
    qualifications, _ = load_catalog()
    exclude = eval_exclusions()
    assert exclude, "the evaluation set is loaded"
    # Counts only: a failure must not print goal text.
    assert len({normalize(query) for query, _ in training_pairs(qualifications, exclude)} & exclude) == 0


def test_only_core_competencies_become_queries():
    qualifications, _ = load_catalog()
    queries = {normalize(query) for query, _ in training_pairs(qualifications, exclude=set())}
    cookery = {normalize(query) for query, passage in training_pairs(qualifications, exclude=set())
               if passage.startswith("Cookery NC II.")}
    assert "participate in workplace communication" not in queries  # a Basic unit of 178 qualifications
    assert "prepare stocks, sauces and soups" in cookery  # a Core unit of Cookery NC II


# --- v2: synthetic queries, augmentation, evaluation exclusions -------------------------------------------------------

import json  # noqa: E402
import zlib  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402

from training import goals, pairs as pairs_module  # noqa: E402
from training.pairs import augment, load_synthetic  # noqa: E402

COOKERY = "Cookery NC II"


def _synthetic_pairs(synthetic, exclude=frozenset(), **kwargs):
    qualifications, _ = load_catalog()
    cookery = [q for q in qualifications if q.name == COOKERY]
    return training_pairs(cookery, set(exclude), synthetic, **kwargs)


def test_synthetic_queries_become_pairs_as_written_and_lower_cased():
    base = {q for q, _ in _synthetic_pairs(None)}
    pairs = _synthetic_pairs({COOKERY: ["Gusto ko magluto sa Barko"]}, augment_share=0)
    new = {q for q, passage in pairs if passage.startswith("Cookery NC II.")} - base
    assert new == {"Gusto ko magluto sa Barko", "gusto ko magluto sa barko"}


def test_synthetic_queries_equal_to_an_excluded_goal_are_dropped():
    pairs = _synthetic_pairs({COOKERY: ["Gusto ko magluto sa Barko", "isang ibang query"]},
                             exclude={"gusto ko magluto sa barko"}, augment_share=0)
    queries = {q for q, _ in pairs}
    assert "Gusto ko magluto sa Barko" not in queries and "gusto ko magluto sa barko" not in queries
    assert "isang ibang query" in queries


def test_augmented_copies_are_excluded_like_other_queries():
    query = "gusto ko magluto sa barko"
    typo = augment(query, zlib.crc32(query.encode("utf-8")))  # the seed training_pairs uses
    assert typo
    assert typo in {q for q, _ in _synthetic_pairs({COOKERY: [query]}, augment_share=1.0)}
    pairs = _synthetic_pairs({COOKERY: [query]}, exclude={typo}, augment_share=1.0)
    assert typo not in {q for q, _ in pairs}


def test_augment_share_adds_one_deterministic_copy_for_that_share():
    synthetic = {COOKERY: [f"gusto kong magluto number {i} sa restaurant" for i in range(200)]}
    none = _synthetic_pairs(synthetic, augment_share=0)
    some = _synthetic_pairs(synthetic, augment_share=0.15)
    extra = len(some) - len(none)
    assert 10 <= extra <= 50
    assert some == _synthetic_pairs(synthetic, augment_share=0.15)
    assert len(_synthetic_pairs(synthetic, augment_share=1.0)) - len(none) >= 150


def test_load_synthetic_merges_the_files_and_rejects_unknown_names(tmp_path):
    (tmp_path / "A.json").write_text(json.dumps({COOKERY: ["a one"]}), encoding="utf-8")
    (tmp_path / "B.json").write_text(json.dumps({COOKERY: ["b two", "a one"]}), encoding="utf-8")
    assert load_synthetic(tmp_path) == {COOKERY: ["a one", "b two"]}
    (tmp_path / "C.json").write_text(json.dumps({"Not A Qualification NC II": ["x"]}), encoding="utf-8")
    with pytest.raises(ValueError, match="Not A Qualification NC II"):
        load_synthetic(tmp_path)


def test_the_committed_synthetic_files_load():
    synthetic = load_synthetic()
    assert sum(len(v) for v in synthetic.values()) > 4000


@pytest.mark.parametrize("query", ["gusto ko maging welder", "I want to be a carpenter", "ako ay magluluto kasi masarap",
                                   "barista", "hilot"])
def test_augment_is_deterministic_and_never_equal_or_empty(query):
    for seed in range(20):
        first = augment(query, seed)
        assert first == augment(query, seed)
        if first is not None:
            assert first.strip() and first != query


def test_augment_returns_none_when_there_is_nothing_to_change():
    assert augment("a b", 1) is None
    assert augment("", 1) is None


def test_augment_changes_something_for_ordinary_queries():
    changed = [augment(f"gusto ko maging welder {i}", i) for i in range(50)]
    assert sum(c is not None for c in changed) >= 45


def _v1_dev_sealed_raw():
    data = Path(pairs_module.__file__).resolve().parent / "data"
    keys = {normalize(g["goal"]) for g in json.loads((data / "eval_goals.json").read_text(encoding="utf-8"))}
    for split in ("dev", "sealed"):
        for path in sorted((data / "goals_v2" / split).glob("*.json")):
            keys |= {normalize(g["goal"]) for g in json.loads(path.read_text(encoding="utf-8"))}
    return keys


def test_eval_exclusions_cover_v1_dev_and_sealed(monkeypatch):
    fake = {"dev": [{"goal": "  Gusto  ko Dev "}], "test_v1": [{"goal": "V1 Test"}], "sealed": [{"goal": "Sealed One"}]}
    monkeypatch.setattr(goals, "load", lambda split: fake[split])
    assert eval_exclusions() == {"gusto ko dev", "v1 test", "sealed one"}


def test_no_training_query_equals_any_goal_in_any_file():
    """Raw goal files, not the loader, so the check holds even while a goal-file fix is in progress."""
    qualifications, _ = load_catalog()
    keys = _v1_dev_sealed_raw()
    assert keys
    # The production path: exclusions from the loader, synthetic from the committed files. Counts only, never text.
    all_pairs = training_pairs(qualifications, eval_exclusions(), load_synthetic())
    assert len({normalize(q) for q, _ in all_pairs} & keys) == 0


def test_text_speak_gets_a_fair_share_of_variants():
    outputs = [augment("ako ay gustong magluto ng pagkain", seed) for seed in range(300)]
    speak = sum(("aq" in o.split() or "gsto" in o) for o in outputs if o)
    assert 60 <= speak <= 150


def test_family_and_level_cues():
    from training.pairs import family, names_a_level

    assert family("Cookery NC II") == family("Cookery NC III") == "Cookery"
    assert family("Rigging NC II (II-5)") == "Rigging"
    assert names_a_level("may NC II na ako") and names_a_level("nc3") and names_a_level("level 2")
    assert not names_a_level("gusto kong maging chef") and not names_a_level("ncaa sports")


def test_load_synthetic_rejects_values_that_are_not_lists_of_strings(tmp_path):
    (tmp_path / "A.json").write_text(json.dumps({COOKERY: "one string"}), encoding="utf-8")
    with pytest.raises(ValueError, match="list of strings"):
        load_synthetic(tmp_path)
