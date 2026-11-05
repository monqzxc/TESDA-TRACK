"""V5 demand-title data: grouping, fixed splits, validation, held-out goals and Colab packaging; no GPU/DB."""
from collections import Counter
import json
import zipfile

import pytest

from tesda_track.utils.helpers import normalize
from training import bundle, demand_labeled as demand, goals, v4, v5_demand as v5
from training.catalog import load_catalog
from training.pairs import HashedExclusions, eval_exclusions, load_synthetic, profile_enrich, training_pairs


requires_demand_data = pytest.mark.skipif(
    not demand.DEMAND_PATH.is_file(),
    reason="The V5 worktree did not include data/v5/demand_jobs.json; build the labeled dataset first.",
)

DEMAND_FIELDS = {"philjobnet_postings", "philjobnet_employers", "ncr_postings", "regions", "education",
                 "careerinfo_lists", "jlmf_sectors"}


def test_v5_profile_keeps_the_local_projection_workflow():
    from training import demand as local_demand, v5 as local_v5

    assert profile_enrich("v5") is v5.enrich
    assert profile_enrich("v2") is None
    assert callable(local_demand.build) and callable(local_v5.train)
    with pytest.raises(ValueError, match="unknown profile"):
        profile_enrich("v9")


def test_bundle_filters_labeled_demand_without_external_dataset():
    row = {"key": "cook", "title": "cook", "variants": ["cook"], "accept": ["Cookery NC II"],
           "split": "train", "demand": {"philjobnet_postings": 0, "careerinfo_lists": [], "jlmf_sectors": []}}
    rows = [row, {**row, "split": "dev"}, {**row, "split": "sealed"}, {**row, "accept": []}]
    assert json.loads(bundle._clean_demand(json.dumps(rows), set())) == [row]
    assert json.loads(bundle._clean_demand(json.dumps(rows), {bundle.exclusion_hash("cook")})) == []


def test_title_key_groups_spellings_and_clean_title_drops_only_general():
    assert demand.title_key("Electrician (General)") == demand.title_key("electrician") == "electrician"
    assert demand.title_key("Mason, Carpenter, Scaffolder") == "mason carpenter scaffolder"
    assert demand.title_key("Bartender / Barista") == "bartender/barista"
    assert demand.title_key("(general)") == "(general)"  # never an empty key
    assert demand.clean_title("cook (general)") == "cook"
    assert demand.clean_title("cook (hotel)") == "cook (hotel)"


def test_split_depends_only_on_the_key_and_keeps_the_shares():
    keys = [f"title {i}" for i in range(3000)]
    splits = Counter(demand.hash_split(key) for key in keys)
    assert [demand.hash_split(key) for key in keys] == [demand.hash_split(key) for key in keys]
    assert 0.66 < splits["train"] / len(keys) < 0.74
    assert 0.12 < splits["dev"] / len(keys) < 0.18 and 0.12 < splits["sealed"] / len(keys) < 0.18


@requires_demand_data
def test_committed_demand_titles_are_valid_and_keep_their_splits():
    rows = demand.load()
    assert len(rows) > 900
    for row in rows:
        assert row["split"] == ("train" if row["catalog_known"] else demand.hash_split(row["key"]))
        assert row["review_status"] == "draft"
        # Counts only: no employer names or places finer than the region count.
        assert set(row["demand"]) == DEMAND_FIELDS
    assert {r["relation"] for r in rows} == set(demand.RELATIONS)
    assert sum(r["demand"]["philjobnet_postings"] for r in rows) == 4237


@pytest.mark.parametrize("change,message", [
    ({"accept": ["Invented NC II"]}, "unknown qualification"),
    ({"relation": "none"}, "go together"),
    ({"accept": [], "relation": "direct"}, "go together"),
    ({"relation": "maybe"}, "relation"),
    ({"split": "test"}, "split"),
    ({"review_status": "approved"}, "review_status"),
    ({"accept": ["Cookery NC II", "Cookery NC II"]}, "without repeats"),
])
def test_invalid_demand_rows_are_rejected(change, message):
    row = {"key": "cook", "title": "cook", "variants": ["cook"], "accept": ["Cookery NC II"], "relation": "direct",
           "split": "train", "review_status": "draft"}
    with pytest.raises(ValueError, match=message):
        demand.validate([{**row, **change}], {q.name for q in load_catalog()[0]})
    with pytest.raises(ValueError, match="more than once"):
        demand.validate([row, row], {q.name for q in load_catalog()[0]})


@requires_demand_data
def test_only_trainable_train_titles_give_queries_and_high_demand_gets_more():
    rows = demand.load()
    assert all(not v5.queries(r) for r in rows if r["split"] != "train" or r["relation"] == "none")
    busy = next(r for r in rows if r["split"] == "train" and r["accept"] and r["demand"]["philjobnet_postings"] >= 20)
    quiet = next(r for r in rows if r["split"] == "train" and r["accept"] and not demand.is_high_demand(r))
    assert len(v5.queries(busy)) > len(v5.queries(quiet))
    assert any(q.startswith("Buri kung maging") for q in v5.queries(busy))  # v4 Kapampangan job pattern
    exclude = {normalize(busy["title"])}
    assert v5.trainable(busy, set()) and not v5.trainable(busy, exclude)


@requires_demand_data
def test_v5_adds_demand_pairs_to_v4_without_evaluation_leakage():
    qualifications, _ = load_catalog()
    exclude = eval_exclusions()
    synthetic, report = v5.enrich(qualifications, load_synthetic(), exclude)
    base, _ = v4.enrich(qualifications, load_synthetic(), exclude)
    pairs = training_pairs(qualifications, exclude, synthetic)
    assert len(pairs) > len(training_pairs(qualifications, exclude, base))
    assert all(normalize(q) not in exclude for q, _ in pairs)
    assert report["profile"] == "v5" and report["demand"]["query_rows"] > 1000
    assert profile_enrich("v5") is v5.enrich and profile_enrich("v2") is None
    with pytest.raises(ValueError, match="unknown profile"):
        profile_enrich("v9")


@requires_demand_data
def test_demand_goals_are_held_out_titles_and_load_in_dev_and_sealed():
    rows = {r["key"]: r for r in demand.load()}
    by_title = {}
    for split in ("dev", "sealed"):
        loaded = [g for g in goals.load(split) if g["group"] == "demand"]
        assert len(loaded) > 80 and all("demand" in g["tags"] for g in loaded)
        assert any(not g["accept"] for g in loaded) and any(g["accept"] for g in loaded)
        for goal in loaded:
            by_title.setdefault(goal["goal"], split)
    held_out = [r for r in rows.values() if r["split"] != "train"]
    assert len(by_title) <= len(held_out)
    for row in held_out:
        # every phrasing is "<prefix> <title>" or the title itself
        matches = [g for g in by_title if g.endswith(row["title"])]
        assert matches, row["key"]


@requires_demand_data
def test_v5_bundle_has_only_trainable_titles_and_the_same_pairs(tmp_path):
    path = bundle.build(tmp_path / "bundle.zip")
    with zipfile.ZipFile(path) as z:
        assert "backend/training/v5_demand.py" in z.namelist() and "backend/training/demand_labeled.py" in z.namelist()
        hashed = HashedExclusions(json.loads(z.read("backend/training/data/exclusions.json")))
        packed_rows = json.loads(z.read("backend/training/data/v5/demand_jobs.json"))
        z.extractall(tmp_path / "unpacked")
    assert packed_rows and all(r["split"] == "train" and v5.trainable(r, hashed) for r in packed_rows)
    texts = {normalize(t) for r in packed_rows for t in [r["title"], *r["variants"]]}
    assert not any(t in hashed for t in texts)
    qualifications, _ = load_catalog()
    local, _ = v5.enrich(qualifications, load_synthetic(), eval_exclusions())
    data = tmp_path / "unpacked/backend/training/data"
    packed, _ = v5.enrich(qualifications, load_synthetic(data / "synthetic"), hashed, data / "v5" / "demand_jobs.json",
                          data / "v4")
    assert training_pairs(qualifications, hashed, packed) == training_pairs(qualifications, eval_exclusions(), local)
