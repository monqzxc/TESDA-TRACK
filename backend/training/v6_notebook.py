"""Build colab/train_colab_v6.ipynb: a self-contained Colab notebook that trains v6 on a GPU runtime.

The notebook embeds the v6 dataset (training queries with all their owners and the public catalog passages; no
evaluation or probe text), training/v6_train.py and training/recover.py. It fetches the public v4 parent from
Hugging Face, checks its ONNX digest, recovers trainable weights from it, trains, verifies the ONNX export with
fastembed and downloads a zip with the serving files. Calibration stays local, on the dev goals.

From backend/:  python -m training.v6_notebook
"""
import argparse
import base64
import gzip
import json
from pathlib import Path

from training import v6
from training.catalog import load_catalog
from training.v5 import V4_SHA

HERE = Path(__file__).resolve().parent
PACKAGES = ["sentence-transformers==6.1.0", "transformers==5.19.0", "accelerate==1.15.0", "onnx==1.23.2",
            "onnxruntime==1.31.0", "fastembed==0.8.1"]
SERVING = ["config.json", "tokenizer.json", "tokenizer_config.json", "training.json", "run_config.json",
           "modules.json", "sentence_bert_config.json", "config_sentence_transformers.json", "1_Pooling/config.json",
           "onnx/model.onnx"]


def code(source: str, title: str) -> dict:
    return {"cell_type": "code", "metadata": {"cellView": "form"}, "execution_count": None, "outputs": [],
            "source": ("#@title " + title + "\n" + source.strip() + "\n").splitlines(True)}


def markdown(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip().splitlines(True)}


def notebook(data: bytes) -> dict:
    encoded = base64.b64encode(gzip.compress(data, mtime=0)).decode()
    audit = json.loads(data)["audit"]
    cells = [
        markdown(f"""
# TESDA learner matcher · v6 (every related qualification)

**Runtime → Change runtime type → T4 GPU**, then **Runtime → Run all**. Training takes roughly an hour on a T4.
Each cell stands on its own (settings are saved to disk), so after a session restart just choose Run all again.

v6 continues the published v4 model. Each training query is paired with **all** the qualifications it belongs to
(a job, Core skill or keyword several qualifications share keeps every owner), and is scored against the **whole
catalog**: every related qualification must outrank every unrelated one. Other levels of the same family are left
neutral unless the query names a level. The data adds {audit['v6_draft_rows']:,} hand-written Filipino and Taglish
drafts (jobs, everyday tasks, short searches, typos, experience and indirect goals) for all 319 qualifications.
So that matching more does not cost rejection, every batch also carries goals that must get **no** match
({audit['unrelated_queries']:,}: careers with no TESDA qualification, non-goals, vague requests), and their best
z-score against the catalog, the number the app rejects on, is pushed below its floor.

Everything is embedded here: {audit['queries']:,} training queries and the public catalog passages. Evaluation goals
and MVP probes were removed before building it. With **USE_DRIVE** on, checkpoints go to
`MyDrive/tesda-track-training/` every 100 steps; after a disconnect, run all again and it resumes.
The last cell downloads `tesda-e5-small-<ROUND>.zip` (ROUND defaults to `v6-colab`). Calibrate and evaluate it locally (see `backend/training/V6.md`).
"""),
        code(f"""
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q", {", ".join(repr(p) for p in PACKAGES)}], check=True)
import torch
assert torch.cuda.is_available(), "Choose Runtime > Change runtime type > T4 GPU, then run all again"
print(torch.__version__, torch.cuda.get_device_name(0))
print("If Colab asks to restart the session, restart it and choose Runtime > Run all again.")
""", "1. Install the pinned libraries (Colab's PyTorch) and require a GPU"),
        code("""
ROUND = "v6-colab"             # keep it to resume a run; use a new name (v6-colab-2, ...) for a new experiment
EPOCHS = 1.0
LR = 1e-5
BATCH_SIZE = 48
UNRELATED_PER_BATCH = 8        # goals that must get no match, added to every batch
CHUNK = 16                     # texts per forward pass; 8 if the GPU runs out of memory (does not change results)
TRAIN_WORD_EMBEDDINGS = False  # True also updates the 250k-token vocabulary table (an experiment, not the default)
USE_DRIVE = True               # checkpoints survive a disconnect
SMOKE = False                  # True: 30 steps only, to check the export before a full run

import json, re
from pathlib import Path
assert re.fullmatch(r"v6(?:-[A-Za-z0-9_-]+)?", ROUND), "Use v6 or v6-your-run-name"
WORK = Path("/content/tesda-v6"); WORK.mkdir(exist_ok=True)
# Saved to disk so a session restart between cells cannot lose them.
(WORK / "settings.json").write_text(json.dumps(dict(
    ROUND=ROUND, EPOCHS=EPOCHS, LR=LR, BATCH_SIZE=BATCH_SIZE, UNRELATED_PER_BATCH=UNRELATED_PER_BATCH, CHUNK=CHUNK,
    TRAIN_WORD_EMBEDDINGS=TRAIN_WORD_EMBEDDINGS, USE_DRIVE=USE_DRIVE, SMOKE=SMOKE), indent=2))
print((WORK / "settings.json").read_text())
""", "2. Settings"),
        code(f"""
from pathlib import Path
import base64, gzip, hashlib
WORK = Path("/content/tesda-v6"); WORK.mkdir(exist_ok=True)
(WORK / "v6-dataset.json").write_bytes(gzip.decompress(base64.b64decode("{encoded}")))
(WORK / "v6_train.py").write_text({(HERE / 'v6_train.py').read_text(encoding='utf-8')!r}, encoding="utf-8")
(WORK / "recover.py").write_text({(HERE / 'recover.py').read_text(encoding='utf-8')!r}, encoding="utf-8")
print("dataset sha256", hashlib.sha256((WORK / "v6-dataset.json").read_bytes()).hexdigest())
""", "3. Write the embedded training data and code"),
        code(f"""
import hashlib, shutil, subprocess, sys
from pathlib import Path
from huggingface_hub import snapshot_download
WORK = Path("/content/tesda-v6")
for needed in ("v6-dataset.json", "v6_train.py", "recover.py"):
    assert (WORK / needed).is_file(), "Run cell 3 (Write the embedded training data and code) first"
parent = WORK / "tesda-e5-small-v4"
snapshot_download("Nyanta19/tesda-e5-small-v4", local_dir=parent,
                  allow_patterns=["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"])
with open(parent / "onnx/model.onnx", "rb") as f:
    assert hashlib.file_digest(f, "sha256").hexdigest() == "{V4_SHA}", "Unexpected v4 parent ONNX"
BASE = WORK / "torch-v4"
if not (BASE / "recovered_from.txt").exists():
    shutil.rmtree(BASE, ignore_errors=True)
    subprocess.run([sys.executable, "-u", str(WORK / "recover.py"), "--onnx-folder", str(parent),
                    "--output", str(BASE)], cwd=WORK, check=True)
print((BASE / "recovered_from.txt").read_text())
""", "4. Fetch the published v4 parent, check it and recover trainable weights"),
        code("""
import json, subprocess, sys
from pathlib import Path
WORK = Path("/content/tesda-v6")
assert (WORK / "settings.json").is_file(), "Run cell 2 (Settings) first"
assert (WORK / "torch-v4" / "recovered_from.txt").is_file(), "Run cells 3 and 4 first"
S = json.loads((WORK / "settings.json").read_text())
if S["USE_DRIVE"]:
    from google.colab import drive
    drive.mount("/content/drive")
    RUNS = Path("/content/drive/MyDrive/tesda-track-training")
else:
    RUNS = WORK / "runs"
RUNS.mkdir(parents=True, exist_ok=True)
OUT = RUNS / (f"tesda-e5-small-{S['ROUND']}" + ("-smoke" if S["SMOKE"] else ""))
args = [sys.executable, "-u", str(WORK / "v6_train.py"), "--data", str(WORK / "v6-dataset.json"),
        "--base", str(WORK / "torch-v4"), "--output", str(OUT), "--epochs", str(S["EPOCHS"]), "--lr", str(S["LR"]),
        "--batch-size", str(S["BATCH_SIZE"]), "--unrelated-per-batch", str(S["UNRELATED_PER_BATCH"]),
        "--chunk", str(S["CHUNK"])]
if S["TRAIN_WORD_EMBEDDINGS"]: args.append("--train-word-embeddings")
if S["SMOKE"]: args += ["--max-steps", "30", "--save-steps", "20"]
if (OUT / "training.json").exists():
    print("Already trained:", OUT)
else:
    if (OUT / "checkpoint").exists(): args.append("--resume")
    run = subprocess.Popen(args, cwd=WORK, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in run.stdout:
        print(line, end="")
    assert run.wait() == 0, "Training failed: read the output above"
""", "5. Train v6 (resumes from Drive after a disconnect)"),
        code(f"""
import hashlib, json, zipfile
from pathlib import Path
from google.colab import files
WORK = Path("/content/tesda-v6")
assert (WORK / "settings.json").is_file(), "Run cell 2 (Settings) first"
S = json.loads((WORK / "settings.json").read_text())
if S["USE_DRIVE"]:
    from google.colab import drive
    drive.mount("/content/drive")
RUNS = Path("/content/drive/MyDrive/tesda-track-training") if S["USE_DRIVE"] else WORK / "runs"
OUT = RUNS / (f"tesda-e5-small-{{S['ROUND']}}" + ("-smoke" if S["SMOKE"] else ""))
assert (OUT / "training.json").is_file(), f"{{OUT}} has no finished model: run cell 5 (Train) first"
serving = {SERVING!r}
missing = [p for p in serving if not (OUT / p).is_file()]
assert not missing, f"Missing serving files: {{missing}}"
checksums = {{}}
for p in serving:
    with open(OUT / p, "rb") as f:
        checksums[p] = hashlib.file_digest(f, "sha256").hexdigest()
archive = Path("/content") / f"{{OUT.name}}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for p in serving:
        z.write(OUT / p, p)
    z.writestr("2_Normalize/.keep", "")
    z.writestr("checksums.json", json.dumps(checksums, indent=2))
# Check the archive before downloading: a truncated model.onnx would still have a valid size in Drive.
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert hashlib.sha256(z.read("onnx/model.onnx")).hexdigest() == checksums["onnx/model.onnx"]
meta = json.loads((OUT / "training.json").read_text())
print(json.dumps({{k: meta[k] for k in ("held_out_loss", "held_out_unrelated_below_z35")}}))
print("Downloading", archive, archive.stat().st_size // 2**20, "MB")
files.download(str(archive))
""", "6. Package the serving files with checksums and download them"),
    ]
    return {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4"},
                                         "kernelspec": {"display_name": "Python 3", "language": "python",
                                                        "name": "python3"}},
            "nbformat": 4, "nbformat_minor": 0}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--notebook", type=Path, default=HERE / "colab" / "train_colab_v6.ipynb")
    parser.add_argument("--dataset", type=Path, default=HERE / "runs" / "v6-dataset.json")
    args = parser.parse_args()
    qualifications, _ = load_catalog()
    items, audit = v6.build(qualifications)
    data = json.dumps(v6.dataset(qualifications, items, audit), ensure_ascii=False, separators=(",", ":")).encode()
    args.dataset.parent.mkdir(parents=True, exist_ok=True)
    args.dataset.write_bytes(data)
    args.notebook.write_text(json.dumps(notebook(data), ensure_ascii=False, indent=1) + "\n", encoding="utf-8",
                             newline="\n")
    print(f"Wrote {args.notebook} ({args.notebook.stat().st_size // 1024} KB) and {args.dataset}")


if __name__ == "__main__":
    main()
