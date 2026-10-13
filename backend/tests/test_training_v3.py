"""V3 data integrity and training/export orchestration; no GPU/database required."""
import hashlib
import json
import zipfile
from collections import Counter

import pytest

from training import bundle, goals
from training.catalog import load_catalog
from training.evaluate import GoalResult, metrics
from training.finetune import attach_negatives, record_run_config, split_pairs
from training.pairs import HashedExclusions, eval_exclusions, load_synthetic, training_pairs
from training.v3 import enrich, records
from tesda_track.services.embeddings import qualification_text
from tesda_track.utils.helpers import normalize


def test_v3_covers_catalog_and_all_requested_languages_without_evaluation_leakage():
    qualifications, _ = load_catalog()
    exclusions = eval_exclusions()
    synthetic, report = enrich(qualifications, load_synthetic(), exclusions)
    pairs = training_pairs(qualifications, exclusions, synthetic)
    assert report["catalog_qualifications"] == len(qualifications)
    assert all(r["added_queries"] > 0 for r in report["qualification_coverage"].values())
    assert all(report["by_language"][lang] > 0 for lang in ("ceb", "ilo", "hil"))
    assert report["by_kind"]["multi_skill"] > 0 and report["by_kind"]["level_specific"] > 0
    assert sum(normalize(q) in exclusions for q, _ in pairs) == 0
    for split in ("dev", "sealed"):
        counts = Counter(g["lang"] for g in goals.load(split))
        assert all(counts[lang] >= 5 for lang in ("ceb", "ilo", "hil"))


def test_v3_rejects_unknown_qualification_or_language(tmp_path):
    qualifications, _ = load_catalog()
    path = tmp_path / "bad.json"
    for name, lang in (("Imaginary NC II", "ceb"), (qualifications[0].name, "unknown")):
        path.write_text(json.dumps([dict(qualification=name, lang=lang, query="test", kind="native_task")]))
        with pytest.raises(ValueError, match="Invalid v3"):
            records(qualifications, tmp_path)


def test_bundle_manifest_and_v3_pairs_match_local(tmp_path):
    path = bundle.build(tmp_path / "bundle.zip")
    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read("manifest.json"))
        assert set(manifest) == set(z.namelist()) - {"manifest.json"}
        assert all(hashlib.sha256(z.read(n)).hexdigest() == h for n, h in manifest.items())
        assert not any("goals_v2" in n or "eval_goals" in n for n in z.namelist())
        exclusions = HashedExclusions(json.loads(z.read("backend/training/data/exclusions.json")))
        assert all(normalize(r["query"]) not in exclusions
                   for r in json.loads(z.read("backend/training/data/v3/regional_tasks.json")))
        z.extractall(tmp_path / "unpacked")
    qualifications, _ = load_catalog()
    local, _ = enrich(qualifications, load_synthetic(), eval_exclusions())
    bundled, _ = enrich(qualifications, load_synthetic(tmp_path / "unpacked/backend/training/data/synthetic"),
                        exclusions, tmp_path / "unpacked/backend/training/data/v3")
    assert training_pairs(qualifications, exclusions, bundled) == training_pairs(qualifications, eval_exclusions(), local)


def test_normalized_query_and_all_its_owners_stay_in_one_split():
    pairs = [(f"Goal {i}", f"passage {j}") for i in range(60) for j in range(2)]
    pairs += [(q.lower(), p) for q, p in pairs]
    train, held = split_pairs(pairs, 42)
    assert train and held and len(train) + len(held) == len(pairs)
    assert not {normalize(q) for q, _ in train} & {normalize(q) for q, _ in held}
    assert split_pairs(pairs, 42) == (train, held)


def test_resume_requires_identical_data_and_settings_without_overwriting_config(tmp_path):
    signature = dict(profile="v3", pairs_sha256="abc", seed=42)
    with pytest.raises(SystemExit, match="missing"):
        record_run_config(tmp_path, signature, resume=True)
    record_run_config(tmp_path, signature, resume=False)
    original = (tmp_path / "run_config.json").read_bytes()
    record_run_config(tmp_path, signature, resume=True)
    with pytest.raises(SystemExit, match="differ"):
        record_run_config(tmp_path, dict(signature, pairs_sha256="changed"), resume=True)
    assert (tmp_path / "run_config.json").read_bytes() == original


def test_mined_negative_cannot_be_a_second_owner():
    qualifications, _ = load_catalog()
    by_name = {q.name: q for q in qualifications}
    names = ["Cookery NC II", "Food and Beverage Services NC II"]
    pairs = [("Shared query", qualification_text(by_name[n])) for n in names]
    rows = [dict(query="Shared query", positive_name=names[0], negative_name=names[1]),
            dict(query="Shared query", positive_name=names[1], negative_name=names[0])]
    triplets, missing = attach_negatives(pairs, rows, qualifications, 42)
    assert missing == 2
    assert all(t[2] not in {p for _, p in pairs} for t in triplets)


def test_language_metrics_include_denominators_and_do_not_invent_missing_scores():
    result = metrics([GoalResult(dict(lang="ceb", accept=["Cookery NC II"]), ["Cookery NC II"]),
                      GoalResult(dict(lang="ceb", accept=[]), []),
                      GoalResult(dict(lang="ilo", accept=[]), ["Cookery NC II"])])
    assert result.language_details["ceb"] == dict(related_n=1, unrelated_n=1, top1=1, top3=1, mrr=1, rejection=1)
    assert result.language_details["ilo"]["top1"] is None
    assert result.language_details["ilo"]["rejection"] == 0


def test_v3_notebook_compiles_and_has_clean_outputs():
    nb = json.loads((bundle.BACKEND / "training/colab/train_colab_v3.ipynb").read_text(encoding="utf-8"))
    sources = []
    for cell in nb["cells"]:
        if cell["cell_type"] == "code":
            assert cell["outputs"] == [] and cell["execution_count"] is None
            source = "".join(cell["source"])
            compile(source, cell["id"], "exec")
            sources.append(source)
    code = "\n".join(sources)
    for required in ('ROUND = "v3"', '"--profile", "v3"', "manifest.json", "torch.cuda.is_available()",
                     "training.v3", "--resume", "assert not SMOKE", "parity_cosine", "files.download"):
        assert required in code
