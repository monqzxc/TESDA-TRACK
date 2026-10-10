"""The Colab bundle: contents, and that hashed exclusions behave like the goal files. DB-free, torch-free."""
import hashlib
import json
import zipfile

import pytest

from tesda_track.utils.helpers import normalize
from training import bundle as bundle_module
from training.catalog import load_catalog
from training.pairs import HashedExclusions, eval_exclusions, load_synthetic, training_pairs


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    folder = tmp_path_factory.mktemp("bundle")
    negatives = folder / "hard-negatives-test.json"
    negatives.write_text("[]", encoding="utf-8")
    path = bundle_module.build(folder / "bundle.zip", negatives)
    with zipfile.ZipFile(path) as z:
        yield {name: z.read(name) for name in z.namelist()}


def test_bundle_has_what_training_needs(built):
    names = set(built)
    assert {"backend/seed/qualifications.json", "backend/training/finetune.py", "backend/training/pairs.py",
            "backend/training/requirements.txt", "backend/requirements.txt", "backend/training/data/exclusions.json",
            "backend/training/runs/hard-negatives-test.json", "backend/tesda_track/config.py"} <= names
    assert any(n.startswith("backend/training/data/synthetic/") for n in names)


def test_bundle_has_no_goal_files_secrets_models_or_bytecode(built):
    for name in built:
        assert "goals_v2" not in name and "eval_goals" not in name
        assert not name.endswith(".env") and not name.startswith("backend/models/") and "__pycache__" not in name
        assert not name.endswith((".pyc", ".onnx", ".safetensors"))


def test_every_goal_hash_is_in_the_bundle(built):
    hashes = set(json.loads(built["backend/training/data/exclusions.json"]))
    texts = bundle_module._goal_texts()
    assert texts
    missing = [t for t in texts if hashlib.sha256(normalize(t).encode("utf-8")).hexdigest() not in hashes]
    assert len(missing) == 0  # a count, never the goal text
    assert len(hashes) <= len(texts)


def test_pairs_from_hashes_equal_pairs_from_goal_files():
    qualifications, _ = load_catalog()
    synthetic = load_synthetic()
    from_files = training_pairs(qualifications, eval_exclusions(), synthetic)
    hashed = HashedExclusions(bundle_module.exclusion_hashes())
    assert from_files == training_pairs(qualifications, hashed, synthetic)
    assert len(hashed) > 0


def test_the_notebook_is_valid_and_has_the_expected_steps():
    path = bundle_module.BACKEND / "training" / "colab" / "train_colab.ipynb"
    nb = json.loads(path.read_text(encoding="utf-8"))
    assert nb["nbformat"] == 4
    code = "\n".join("".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code")
    assert any(c["cell_type"] == "markdown" for c in nb["cells"])
    for text in ('ROUND = "v2"', "EPOCHS = 3", "LR = 2e-5", "HARD_NEGATIVES = False", "MINI_BATCH = 16", "USE_DRIVE = True",
                 "SMOKE = True", "nvidia-smi", "sentence-transformers==6.1.0", "transformers==5.19.0", "fastembed==0.8.1",
                 "DATABASE_URL", "SECRET_KEY", "training.finetune", "--resume", "--max-steps", "PARITY CHECK",
                 "files.download", "checkpoints", ".safetensors"):
        assert text in code, text
    for cell in nb["cells"]:
        if cell["cell_type"] == "code":
            compile("".join(cell["source"]), "cell", "exec")
