"""V4 regional data, review metadata, Colab packaging and notebook checks; no GPU/DB."""
from collections import Counter
import hashlib
import json
import zipfile

import pytest

from tesda_track.utils.helpers import normalize
from training import bundle, goals, v4
from training.catalog import load_catalog
from training.pairs import HashedExclusions, eval_exclusions, load_synthetic, training_pairs


def test_v4_has_kapampangan_and_more_ilocano_without_evaluation_leakage():
    qualifications, _ = load_catalog()
    rows = v4.records(qualifications)
    tasks = [r for r in rows if r["kind"] == "native_task"]
    counts = Counter(r["lang"] for r in tasks)
    assert set(counts) == set(v4.LANGUAGES)
    assert all(count >= len(qualifications) for count in counts.values())
    assert all(r["english"] and r["review_status"] == "draft" for r in tasks)
    exclude = eval_exclusions()
    synthetic, report = v4.enrich(qualifications, load_synthetic(), exclude)
    pairs = training_pairs(qualifications, exclude, synthetic)
    assert all(normalize(q) not in exclude for q, _ in pairs)
    assert report["profile"] == "v4" and report["review_status"]["draft"] > 0
    assert all(report["by_language"][lang] > 0 for lang in ("pam", "ilo", "ceb", "hil"))
    assert all(r["added_queries"] > 0 for r in report["qualification_coverage"].values())
    for split in ("dev", "sealed"):
        regional = [g for g in goals.load(split) if g["lang"] == "pam"]
        assert len(regional) >= 5
        assert any(not g["accept"] for g in regional) and any(g["accept"] for g in regional)


def test_workplace_scenarios_cover_every_catalog_qualification_in_each_regional_language():
    catalog = json.loads((bundle.BACKEND / "seed/qualifications.json").read_text(encoding="utf-8"))
    by_name = {q["name"]: q for q in catalog}
    qualifications, _ = load_catalog()
    tasks = [r for r in v4.records(qualifications) if r["kind"] == "native_task"]
    scenarios = [r for r in tasks if r.get("query_style") == "code_switched_scenario"]
    # Job-title templates alone must not satisfy workplace-scenario coverage.
    assert Counter((r["qualification"], r["lang"]) for r in scenarios) == Counter(
        {(name, lang): 1 for name in by_name for lang in v4.LANGUAGES})
    assert len({normalize(r["query"]) for r in tasks}) == len(tasks)
    assert len({r["scenario_id"] for r in scenarios}) == len(catalog)
    exclude = eval_exclusions()
    for row in scenarios:
        q = by_name[row["qualification"]]
        assert row["source"] == q["source"]
        assert row["scenario_id"] == q["code"].lower() + "-workplace-01"
        assert row["core_competencies"]
        assert set(row["core_competencies"]) <= {
            c["name"] for c in q["competencies"] if c["category"] == "Core"}
        assert row["query"].endswith("?") and row["english"].endswith("?")
        assert q["name"].casefold() not in row["query"].casefold()
        assert normalize(row["query"]) not in exclude
    # Translations of one scenario share one intended meaning and source mapping.
    for name in by_name:
        family = [r for r in scenarios if r["qualification"] == name]
        assert len({r["english"] for r in family}) == 1
        assert len({tuple(r["core_competencies"]) for r in family}) == 1


@pytest.mark.parametrize("field,value", [("qualification", "Invented NC II"), ("lang", "unknown"),
                                       ("query", "  "), ("english", ""), ("review_status", "approved")])
def test_invalid_review_data_is_rejected(tmp_path, field, value):
    qualifications, _ = load_catalog()
    row = dict(qualification="Cookery NC II", lang="pam", query="Draft query", kind="native_task",
               english="Intended meaning", review_status="draft")
    row[field] = value
    (tmp_path / "reviewed.json").write_text(json.dumps([row]), encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid v4"):
        v4.records(qualifications, tmp_path)


def test_reviewed_rows_are_audited_but_english_gloss_is_not_trained(tmp_path):
    qualifications, _ = load_catalog()
    row = dict(qualification="Cookery NC II", lang="pam", query="A new reviewed regional query",
               kind="native_task", english="Gloss metadata must not become a query", review_status="reviewed")
    (tmp_path / "reviewed.json").write_text(json.dumps([row]), encoding="utf-8")
    synthetic, report = v4.enrich(qualifications, {}, set(), tmp_path)
    assert report["review_status"]["reviewed"] == 1
    assert row["query"] in synthetic[row["qualification"]]
    assert row["english"] not in {q for queries in synthetic.values() for q in queries}


def test_v4_bundle_matches_local_pairs_and_excludes_evaluation_and_template(tmp_path):
    path = bundle.build(tmp_path / "bundle.zip")
    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read("manifest.json"))
        assert all(hashlib.sha256(z.read(n)).hexdigest() == h for n, h in manifest.items())
        assert "backend/training/v4.py" in manifest
        assert not any("goals_v2" in n or "eval_goals" in n or "templates/" in n for n in manifest)
        hashed = HashedExclusions(json.loads(z.read("backend/training/data/exclusions.json")))
        rows = json.loads(z.read("backend/training/data/v4/regional_tasks.json"))
        assert all(normalize(r["query"]) not in hashed for r in rows)
        z.extractall(tmp_path / "unpacked")
    qualifications, _ = load_catalog()
    local, _ = v4.enrich(qualifications, load_synthetic(), eval_exclusions())
    data = tmp_path / "unpacked/backend/training/data"
    packed, _ = v4.enrich(qualifications, load_synthetic(data / "synthetic"), hashed, data / "v4")
    assert training_pairs(qualifications, hashed, packed) == training_pairs(qualifications, eval_exclusions(), local)


def test_v4_notebook_is_clean_and_smoke_never_downloads():
    nb = json.loads((bundle.BACKEND / "training/colab/train_colab_v4.ipynb").read_text(encoding="utf-8"))
    sources = []
    for cell in nb["cells"]:
        if cell["cell_type"] == "code":
            assert cell["outputs"] == [] and cell["execution_count"] is None
            source = "".join(cell["source"])
            compile(source, cell["id"], "exec")
            sources.append(source)
    # The smoke branch must work without even importing google.colab or opening a model.
    exec(sources[-1], {"SMOKE": True})
    code = "\n".join(sources)
    for required in ('ROUND = "v4"', '"--profile", "v4"', '"training.v4"', '"pam", "ilo"',
                     "torch.cuda.is_available()", "bundle_sha256.txt", "Settings changed", "--resume",
                     "score_matches", "No sufficiently relevant TESDA qualification found"):
        assert required in code
