import base64
import gzip
import json

from training.catalog import load_catalog
from training.demand import build
from training.v5_notebook import HERE, write_notebook


def test_aliases_share_splits_and_excluded_variants_are_not_trained():
    qs, _ = load_catalog()
    rows, audit = build(qs, {"electrician", "waiter"})
    by_title = {r["title"]: r for r in rows}
    assert not {"electrician", "electrician (general)", "waitress", "waiter"} & by_title.keys()
    assert by_title["warehouseman"]["labels"] == ["Warehousing Services NC II"]
    assert by_title["security guard"]["labels"] == ["Security Services NC I", "Security Services NC II"]
    assert audit["observed_postings"] == 4237
    splits = {s: {r["group"] for r in rows if r["split"] == s} for s in ("train", "held")}
    assert splits["held"] and splits["train"] and splits["held"].isdisjoint(splits["train"])


def test_colab_runs_same_trainer_and_materializes_only_filtered_public_inputs(tmp_path):
    notebook, data = tmp_path/"v5.ipynb", tmp_path/"data.json"
    write_notebook(notebook, data)
    cells = json.loads(notebook.read_text(encoding="utf-8"))["cells"]
    for cell in cells[1:]:
        compile("".join(cell["source"]), "notebook", "exec")
    source = "".join(cells[2]["source"])
    payload = source.split("base64.b64decode('", 1)[1].split("')", 1)[0]
    assert gzip.decompress(base64.b64decode(payload)) == data.read_bytes()
    assert repr((HERE/"v5.py").read_text(encoding="utf-8")) in source
    assert {r["split"] for r in json.loads(data.read_bytes())["rows"]} == {"held", "train"}


def test_mvp_examples_exclude_demand_holdout_owners_and_probe_queries(tmp_path):
    notebook, data = tmp_path/"mvp.ipynb", tmp_path/"data.json"
    write_notebook(notebook, data, mvp=True)
    rows = json.loads(data.read_bytes())["rows"]
    held_labels = {label for row in rows if row["split"] == "held" for label in row["labels"]}
    learner = [row for row in rows if "lang" in row]
    assert len({row["lang"] for row in learner}) == 10
    assert {row["kind"] for row in learner} == {"goal", "qualification", "job", "skill"}
    assert all(held_labels.isdisjoint(row["labels"]) for row in learner)
    for cell in json.loads(notebook.read_text(encoding="utf-8"))["cells"][1:]:
        compile("".join(cell["source"]), "notebook", "exec")
