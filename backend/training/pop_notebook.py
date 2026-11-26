"""Build colab/train_colab_pop.ipynb: teach the matcher pop-culture role-model goals ("I want to become like Tony
Stark", "gusto kong maging katulad ni Sanji") on top of v6-colab, the model production serves.

Self-contained: the notebook embeds data/pop_culture/pop_items.json (from training/pop_culture.py), the v6 dataset
(replayed so typed-goal search and rejection don't regress), training/v6_train.py and training/recover.py. It pulls
v6-colab from Hugging Face at a pinned revision, checks its ONNX digest, trains with the v6 objective (all owners vs
the whole catalog, unrelated goals pushed below the floor), compares before/after, exports the zip and can push the
model to a Hugging Face repo.

Standard library only. From backend/:
    python3 training/pop_culture.py                         # data/pop_culture/pop_items.json
    python -m training.v6 --dataset training/runs/v6-dataset.json   # in the backend image (see V6.md)
    python3 training/pop_notebook.py                        # colab/train_colab_pop.ipynb
"""
import base64
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "colab" / "train_colab_pop.ipynb"
V6_DATASET = HERE / "runs" / "v6-dataset.json"
POP_ITEMS = HERE / "data" / "pop_culture" / "pop_items.json"
# Same pin as skills_notebook.PUBLISHED["v6"]: production's v6-colab, digest from its checksums.json.
BASE_REPO = ("Nyanta19/tesda-e5-small-v6-colab", "a871a651887f25c598793411e9d1b8eed9177ec4",
             "0adef47feb648c7c1b902cf496ce4ceaf052de04784d155730b37b3127f489e1")
PACKAGES = ["sentence-transformers==6.1.0", "transformers==5.19.0", "accelerate==1.15.0", "onnx==1.23.2",
            "onnxruntime==1.31.0", "fastembed==0.8.1", "huggingface_hub"]
SERVING = ["config.json", "tokenizer.json", "tokenizer_config.json", "training.json", "run_config.json",
           "modules.json", "sentence_bert_config.json", "config_sentence_transformers.json", "1_Pooling/config.json",
           "onnx/model.onnx"]


def code(source: str, title: str) -> dict:
    return {"cell_type": "code", "metadata": {"cellView": "form"}, "execution_count": None, "outputs": [],
            "source": ("#@title " + title + "\n" + source.strip() + "\n").splitlines(True)}


def markdown(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip().splitlines(True)}


def bundle() -> str:
    files = {"v6-dataset.json": V6_DATASET, "pop_items.json": POP_ITEMS,
             "v6_train.py": HERE / "v6_train.py", "recover.py": HERE / "recover.py"}
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w") as tar:
        for name, path in files.items():
            data = path.read_bytes()
            info = tarfile.TarInfo(name)
            info.size, info.mtime = len(data), 0
            tar.addfile(info, io.BytesIO(data))
    encoded = base64.b64encode(gzip.compress(raw.getvalue(), compresslevel=9, mtime=0)).decode()
    return "\n".join(encoded[i:i + 100] for i in range(0, len(encoded), 100))  # short lines; b64decode skips newlines


def digests() -> dict:
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (V6_DATASET, POP_ITEMS)}


INTRO = """
# TESDA learner matcher · pop-culture round ("I want to become like …")

**Runtime → Change runtime type → T4 GPU**, then **Runtime → Run all**. Training takes about 1.5 hours on a T4
with the default settings. Each cell stands on its own (settings live on disk), so after a restart just Run all again.

Learners often describe a goal through a role model: *"I want to become like Tony Stark"*, *"gusto kong maging
katulad ni Sanji"*, *"idol ko si Bob the Builder, anong kurso?"*. This round teaches the matcher those goals.

- **Data**: __CHARS__ characters from the pop-culture skills directory (Marvel, anime, cartoons, films, TV
  personalities). Each one's suggested TVET areas were mapped to exact catalog qualifications
  (`data/pop_culture/area_map.json`), and __ROWS__ queries were written in English, Filipino and Taglish from name
  and skill templates, plus typo variants. Characters with **no catalog route** (sports coaching only, etc.) and
  superpower or small-talk goals (*"I want to fly like Superman"*) are goals that must get **no match**.
- **Base**: `v6-colab`, the model production serves, pinned by revision and ONNX digest.
- **Objective**: the v6 trainer (`v6_train.py`): every query is scored against the **whole catalog**, every
  qualification the character points to must beat every other one, and unrelated goals are pushed below the floor.
- **No regression**: a share of the v6 dataset (multilingual goals, jobs, tasks, 598 unrelated goals) is replayed in
  every run, and the before/after table checks the v6 held-out goals too.
- **Honest evaluation**: 15% of characters are never trained on (`eval_unseen`), and some templates are held out for
  the others (`eval_template`).

All pop queries are **synthetic drafts** and the area mapping is a draft: a TESDA subject reviewer should check it.
Scores here only show the model learned these patterns. Before serving it, calibrate and gate it locally on the
real dev goals (`backend/training/V6.md`, *After training*).
"""

SETTINGS = """
ROUND = "pop-v2"               # new name (pop-v3, ...) for every new experiment: embeddings are keyed by model name
EPOCHS = 1.0
LR = 1e-5
BATCH_SIZE = 48
UNRELATED_PER_BATCH = 8        # goals that must get no match, added to every batch
REPLAY_SHARE = 1.0             # share of the v6 related goals replayed (all v6 unrelated goals are always kept); pop-v1 used 0.3 and regressed on real goals
POP_REPEAT = 1                 # each pop training query appears this many times per epoch
CHUNK = 16                     # texts per forward pass; 8 if the GPU runs out of memory (does not change results)
Z_FLOOR = 2.86                 # v6-colab calibration (z_floor 2.0, ceiling 5.0, keyword weight 0.3, min score 20):
                               # a match with no keyword evidence is shown only from z = 2 + 0.2/0.7*3 = 2.86
USE_DRIVE = True               # checkpoints survive a disconnect
SMOKE = False                  # True: 30 steps only, to check the whole notebook end to end
HF_REPO = ""                   # e.g. "your-username/tesda-e5-small-pop-v2"; empty = skip the Hugging Face upload
HF_PRIVATE = True              # create the Hugging Face repo as private

import json, re
from pathlib import Path
assert re.fullmatch(r"pop(?:-[A-Za-z0-9_-]+)?", ROUND), "Use pop or pop-your-run-name"
WORK = Path("/content/tesda-pop"); WORK.mkdir(exist_ok=True)
(WORK / "settings.json").write_text(json.dumps({k: v for k, v in dict(globals()).items()
    if k.isupper() and isinstance(v, (str, int, float, bool))}, indent=2))
print((WORK / "settings.json").read_text())
"""

WRITE = """
import base64, gzip, hashlib, io, tarfile
from pathlib import Path
WORK = Path("/content/tesda-pop"); WORK.mkdir(exist_ok=True)
BLOB = \"\"\"
__BLOB__
\"\"\"
with tarfile.open(fileobj=io.BytesIO(gzip.decompress(base64.b64decode(BLOB)))) as tar:
    tar.extractall(WORK, filter="data")
for name, want in __DIGESTS__.items():
    got = hashlib.sha256((WORK / name).read_bytes()).hexdigest()
    assert got == want, f"{name} is damaged"
    print(f"{name:18s} {(WORK / name).stat().st_size:>10,} bytes  ok")
"""

COMMON = '''
from pathlib import Path
WORK = Path("/content/tesda-pop")
(WORK / "common.py").write_text(r"""
import json, re
from pathlib import Path
import numpy as np

WORK = Path("/content/tesda-pop")
S = json.loads((WORK / "settings.json").read_text())
V6 = json.loads((WORK / "v6-dataset.json").read_text(encoding="utf-8"))
POP = json.loads((WORK / "pop_items.json").read_text(encoding="utf-8"))
NAMES, PASSAGES, FAMILIES = V6["names"], V6["passages"], V6["families"]
INDEX = {n: i for i, n in enumerate(NAMES)}

def runs_dir():
    if S["USE_DRIVE"]:
        root = Path("/content/drive/MyDrive")
        if not root.exists():
            try:
                from google.colab import drive
                drive.mount("/content/drive")
            except Exception as error:
                print(f"Drive did not mount ({error}); saving in this session (a disconnect restarts training).")
        if root.exists():
            path = root / "tesda-track-training"; path.mkdir(parents=True, exist_ok=True); return path
    path = WORK / "runs"; path.mkdir(parents=True, exist_ok=True); return path

def out_dir():
    return runs_dir() / (f"tesda-e5-small-{S['ROUND']}" + ("-smoke" if S["SMOKE"] else ""))

def encode(model, texts, kind, batch=128):
    return model.encode([f"{kind}: {t}" for t in texts], batch_size=batch, normalize_embeddings=True,
                        convert_to_numpy=True, show_progress_bar=False)

def zscores(q, p):
    # The app ranks by cosine and abstains when the best z-score against the whole catalog is under its floor.
    s = q @ p.T
    return (s - s.mean(1, keepdims=True)) / s.std(1, keepdims=True)

def eval_sets():
    # name -> (texts, owner index lists). Pop held-out splits, plus v6's held-out goals as the regression check.
    sets = {}
    for split in ("eval_template", "eval_unseen"):
        rows = [r for r in POP["items"] if r["split"] == split]
        sets[f"pop {split}"] = ([r["query"] for r in rows], [[INDEX[n] for n in r["accept"]] for r in rows],
                                [r["lang"] for r in rows])
    held = [it for it in V6["items"] if it[3]]
    sets["v6 held-out (regression)"] = ([it[0] for it in held], [it[1] for it in held], ["-"] * len(held))
    return sets

def evaluate(model, texts, owners, langs=None, passages=None, z_floor=None):
    # A hit is any owner, or another level of an owner's family (the trainer leaves those neutral).
    z_floor = S["Z_FLOOR"] if z_floor is None else z_floor
    passages = encode(model, PASSAGES, "passage") if passages is None else passages
    z = zscores(encode(model, texts, "query"), passages)
    order = np.argsort(-z, axis=1)
    out, per_lang = dict(top1=0, top3=0, shown_top3=0, related=0, rejected=0, unrelated=0), {}
    for k, (own, ranks, zr) in enumerate(zip(owners, order, z)):
        lang = langs[k] if langs else "-"
        bucket = per_lang.setdefault(lang, dict(top3=0, related=0, rejected=0, unrelated=0))
        if not own:
            out["unrelated"] += 1; bucket["unrelated"] += 1
            hit = zr[ranks[0]] < z_floor; out["rejected"] += hit; bucket["rejected"] += hit
            continue
        fams = {FAMILIES[i] for i in own}
        pos = next(i for i, r in enumerate(ranks) if FAMILIES[r] in fams)
        out["related"] += 1; bucket["related"] += 1
        out["top1"] += pos == 0; out["top3"] += pos < 3; bucket["top3"] += pos < 3
        out["shown_top3"] += pos < 3 and zr[ranks[pos]] >= z_floor
    r, u = max(out["related"], 1), max(out["unrelated"], 1)
    result = {"top1": out["top1"] / r, "top3": out["top3"] / r, "shown_top3": out["shown_top3"] / r,
              "rejection": out["rejected"] / u if out["unrelated"] else None,
              "related": out["related"], "unrelated": out["unrelated"]}
    result["by_lang"] = {l: {"top3": b["top3"] / b["related"] if b["related"] else None,
                             "rejection": b["rejected"] / b["unrelated"] if b["unrelated"] else None}
                         for l, b in per_lang.items()}
    return result

def evaluate_all(model):
    passages = encode(model, PASSAGES, "passage")
    return {name: evaluate(model, t, o, l, passages) for name, (t, o, l) in eval_sets().items()}
""")
import sys; sys.path.insert(0, str(WORK))
print("common.py written")
'''

EXPLORE = """
import sys; sys.path.insert(0, "/content/tesda-pop")
import importlib, json, common; importlib.reload(common)
import pandas as pd
P = pd.DataFrame(common.POP["items"])
print(json.dumps({k: common.POP["audit"][k] for k in ("characters", "characters_with_route", "characters_without_route",
                                                      "unseen_characters")}, indent=1))
display(P.groupby(["split", "lang"]).size().unstack())
display(P.groupby("kind").size().to_frame("rows"))
C = pd.DataFrame(common.POP["characters"])
C["name"] = C.names.str.join(" / "); C["owners"] = C.owners.str.join("; ")
display(C[["name", "source", "owners"]].head(25))
display(P.sample(12, random_state=3)[["split", "lang", "query", "accept"]])
"""

BUILD = """
import sys, json, random, hashlib; sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
S, V6, POP = common.S, common.V6, common.POP
rng = random.Random(42)
items, replayed = [], 0
for it in V6["items"]:
    text, owners, level, held = it
    if held or not owners or rng.random() < S["REPLAY_SHARE"]:   # keep held-out and unrelated; sample the rest
        items.append(it); replayed += bool(owners) and not held
pop_train = pop_held = 0
for r in POP["items"]:
    owners = [common.INDEX[n] for n in r["accept"]]
    if r["split"] == "train":
        for _ in range(S["POP_REPEAT"] if owners else 1):
            items.append([r["query"], owners, False, False]); pop_train += 1
    else:   # held out: the trainer never steps on these, and reports their loss before and after
        items.append([r["query"], owners, False, True]); pop_held += 1
audit = dict(V6["audit"]); audit.update({"pop_round": POP["audit"], "replay_share": S["REPLAY_SHARE"],
             "v6_related_replayed": replayed, "pop_train_rows": pop_train, "pop_held_rows": pop_held})
data = {"profile": "pop-culture", "audit": audit, "names": V6["names"], "passages": V6["passages"],
        "families": V6["families"], "items": items}
blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
(common.WORK / "pop-dataset.json").write_bytes(blob)
n_train = sum(1 for it in items if it[1] and not it[3])
print(f"{len(items):,} rows: {replayed:,} v6 goals replayed, {pop_train:,} pop training rows, {pop_held:,} pop held out")
print(f"~{n_train // S['BATCH_SIZE']:,} steps per epoch; dataset sha256 {hashlib.sha256(blob).hexdigest()[:16]}")
"""

FETCH = """
import hashlib, shutil, subprocess, sys
from pathlib import Path
from huggingface_hub import snapshot_download
WORK = Path("/content/tesda-pop")
repo, revision, sha = __BASE__
parent = WORK / repo.split("/")[1]
snapshot_download(repo, revision=revision, local_dir=parent,
                  allow_patterns=["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"])
with open(parent / "onnx/model.onnx", "rb") as f:
    assert hashlib.file_digest(f, "sha256").hexdigest() == sha, "Unexpected v6-colab ONNX"
BASE = WORK / "torch-v6-colab"
if not (BASE / "recovered_from.txt").exists():   # published models hold only ONNX: rebuild trainable weights
    shutil.rmtree(BASE, ignore_errors=True)
    subprocess.run([sys.executable, "-u", str(WORK / "recover.py"), "--onnx-folder", str(parent),
                    "--output", str(BASE)], cwd=WORK, check=True)
print(f"Base: {repo} @ {revision[:12]}")
print((BASE / "recovered_from.txt").read_text())
"""

BEFORE = """
import sys, json; sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
from sentence_transformers import SentenceTransformer
model = SentenceTransformer(str(common.WORK / "torch-v6-colab"), device="cuda")
before = common.evaluate_all(model)
(common.WORK / "metrics_before.json").write_text(json.dumps(before, indent=2))
for name, m in before.items():
    print(f"{name:26s} top1 {m['top1']:.3f}  top3 {m['top3']:.3f}  shown_top3 {m['shown_top3']:.3f}  "
          f"rejection {m['rejection'] if m['rejection'] is None else round(m['rejection'], 3)}")
del model
"""

TRAIN = """
import json, subprocess, sys
sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
S, WORK = common.S, common.WORK
assert (WORK / "pop-dataset.json").is_file(), "Run cell 6 (Build the training set) first"
OUT = common.out_dir()
args = [sys.executable, "-u", str(WORK / "v6_train.py"), "--data", str(WORK / "pop-dataset.json"),
        "--base", str(WORK / "torch-v6-colab"), "--output", str(OUT), "--epochs", str(S["EPOCHS"]), "--lr", str(S["LR"]),
        "--batch-size", str(S["BATCH_SIZE"]), "--unrelated-per-batch", str(S["UNRELATED_PER_BATCH"]),
        "--chunk", str(S["CHUNK"])]
if S["SMOKE"]: args += ["--max-steps", "30", "--save-steps", "20"]
if (OUT / "training.json").exists():
    print("Already trained:", OUT, "(change ROUND for a new run)")
else:
    if (OUT / "checkpoint").exists(): args.append("--resume"); print("Resuming from Drive")
    run = subprocess.Popen(args, cwd=WORK, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in run.stdout:
        print(line, end="")
    assert run.wait() == 0, "Training failed: read the output above"
"""

AFTER = """
import sys, json; sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
import pandas as pd
from sentence_transformers import SentenceTransformer
OUT = common.out_dir()
model = SentenceTransformer(str(OUT), device="cuda")
after = common.evaluate_all(model)
before = json.loads((common.WORK / "metrics_before.json").read_text())
(common.WORK / "metrics_after.json").write_text(json.dumps(after, indent=2))
rows = []
for name in after:
    for metric in ("top1", "top3", "shown_top3", "rejection"):
        if after[name][metric] is not None:
            rows.append({"set": name, "metric": metric, "before (v6-colab)": before[name][metric],
                         "after": after[name][metric], "change": after[name][metric] - before[name][metric]})
display(pd.DataFrame(rows).set_index(["set", "metric"]).round(3))
print("Top-3 by language (before -> after):")
for name in after:
    for lang, m in after[name]["by_lang"].items():
        b = before[name]["by_lang"][lang]
        if m["top3"] is not None:
            print(f"  {name:26s} {lang:8s} {b['top3']:.3f} -> {m['top3']:.3f}")
reg_b, reg_a = before["v6 held-out (regression)"], after["v6 held-out (regression)"]
if reg_a["top3"] < reg_b["top3"] - 0.02:
    print("WARNING: v6 held-out top-3 dropped more than 2 points. Raise REPLAY_SHARE or lower LR before adopting.")
if reg_a["rejection"] is not None and reg_a["rejection"] < reg_b["rejection"] - 0.03:
    print("WARNING: rejection of unrelated goals dropped more than 3 points.")
"""

TRY = """
import sys; sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
import numpy as np
from sentence_transformers import SentenceTransformer
#@markdown Type a learner goal:
GOAL = "I want to become like Tony Stark"  #@param {type:"string"}
COMPARE_WITH_BASE = True  #@param {type:"boolean"}
models = [("after", str(common.out_dir()))] + ([("v6-colab", str(common.WORK / "torch-v6-colab"))] if COMPARE_WITH_BASE else [])
for label, path in models:
    m = SentenceTransformer(path, device="cuda")
    z = common.zscores(common.encode(m, [GOAL], "query"), common.encode(m, common.PASSAGES, "passage"))[0]
    top = np.argsort(-z)[:5]
    print(f"--- {label}")
    if z[top[0]] < common.S["Z_FLOOR"]:
        print("    no match (the app would show nothing)")
    for i in top:
        print(f"    {'shown ' if z[i] >= common.S['Z_FLOOR'] else 'hidden'}  z {z[i]:5.2f}  {common.NAMES[i]}")
"""

PACKAGE = """
import hashlib, json, shutil, zipfile, sys
sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
from pathlib import Path
from google.colab import files
OUT = common.out_dir()
assert (OUT / "training.json").is_file(), f"{OUT} has no finished model: run cell 8 (Train) first"
meta = json.loads((OUT / "training.json").read_text())
meta["pop_metrics"] = {"before": json.loads((common.WORK / "metrics_before.json").read_text()),
                       "after": json.loads((common.WORK / "metrics_after.json").read_text())}
meta["base_model"] = "Nyanta19/tesda-e5-small-v6-colab"
(OUT / "training.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
serving = __SERVING__
missing = [p for p in serving if not (OUT / p).is_file()]
assert not missing, f"Missing serving files: {missing}"
checksums = {p: hashlib.sha256((OUT / p).read_bytes()).hexdigest() for p in serving}
(OUT / "checksums.json").write_text(json.dumps(checksums, indent=2))
archive = Path("/content") / f"{OUT.name}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for p in serving:
        z.write(OUT / p, p)
    z.writestr("2_Normalize/.keep", "")
    z.writestr("checksums.json", json.dumps(checksums, indent=2))
with zipfile.ZipFile(archive) as z:   # a truncated model.onnx would still have a plausible size
    assert z.testzip() is None
    assert hashlib.sha256(z.read("onnx/model.onnx")).hexdigest() == checksums["onnx/model.onnx"]
print(json.dumps({k: meta[k] for k in ("held_out_loss", "held_out_unrelated_below_z35", "parity_cosine")}))
print("Downloading", archive, archive.stat().st_size // 2**20, "MB")
files.download(str(archive))
"""

UPLOAD = '''
import json, sys
sys.path.insert(0, "/content/tesda-pop")
import importlib, common; importlib.reload(common)
S, OUT = common.S, common.out_dir()
if not S["HF_REPO"]:
    print("HF_REPO is empty in cell 2: skipping the upload. Set it (e.g. your-username/tesda-e5-small-pop-v2), "
          "run cell 2 again, then this cell.")
else:
    assert (OUT / "checksums.json").is_file(), "Run cell 11 (Package) first"
    from huggingface_hub import HfApi, login
    # Use a WRITE token from https://huggingface.co/settings/tokens. Best: add it as the Colab secret HF_TOKEN
    # (key icon on the left); otherwise login() asks for it. Never paste a token into a cell.
    try:
        from google.colab import userdata
        login(token=userdata.get("HF_TOKEN"))
    except Exception:
        login()
    m = json.loads((OUT / "training.json").read_text())["pop_metrics"]
    rows = "\\n".join(f"| {name} | {m['before'][name]['top3']:.3f} | {m['after'][name]['top3']:.3f} | "
                      f"{'' if m['after'][name]['rejection'] is None else format(m['after'][name]['rejection'], '.3f')} |"
                      for name in m["after"])
    (OUT / "README.md").write_text(f"""---
language: [en, tl]
library_name: sentence-transformers
pipeline_tag: sentence-similarity
base_model: Nyanta19/tesda-e5-small-v6-colab
tags: [tesda, tvet, philippines, onnx, fastembed]
---
# tesda-e5-small-{S['ROUND']}

TESDA-TRACK learner-goal matcher, continued from `tesda-e5-small-v6-colab` with pop-culture role-model goals
("I want to become like Tony Stark", "gusto kong maging katulad ni Sanji") in English, Filipino and Taglish.
Queries use the `query: ` prefix and qualification texts `passage: `; vectors are mean-pooled and normalised.
`onnx/model.onnx` is what the TESDA-TRACK API serves with fastembed.

Training data is synthetic (draft character-to-qualification mapping); scores below are on held-out synthetic
queries, not real learners. Calibrate on real dev goals before serving.

| Held-out set | top-3 before | top-3 after | rejection after |
| --- | ---: | ---: | ---: |
{rows}
""", encoding="utf-8")
    api = HfApi()
    api.create_repo(S["HF_REPO"], private=S["HF_PRIVATE"], exist_ok=True)
    api.upload_folder(folder_path=str(OUT), repo_id=S["HF_REPO"],
                      allow_patterns=[*__SERVING__, "checksums.json", "README.md"],
                      commit_message=f"Upload tesda-e5-small-{S['ROUND']}")
    print(f"Uploaded: https://huggingface.co/{S['HF_REPO']}")
'''

NEXT = """
## After training

1. Unzip `tesda-e5-small-pop-v2.zip` into `backend/models/tesda-e5-small-pop-v2/` (git-ignored), or download it
   from your Hugging Face repo with `hf download <repo> --local-dir backend/models/tesda-e5-small-pop-v2`.
2. Calibrate and gate it locally, as in `backend/training/V6.md` (*After training*), with
   `--model-path models/tesda-e5-small-pop-v2`, comparing with v6-colab on `dev`, `test_v1` and the probes, and run
   `python -m training.round check pop-v2`. Pop scores alone don't justify a switch: adopt it only if the real
   goals hold up (watch Filipino top-3, where skills-v1 regressed).
3. To serve it, set `EMBEDDING_MODEL=tesda-track/tesda-e5-small-pop-v2` and
   `EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-pop-v2`, run `python -m tesda_track.embeddings sync`, and
   restart the API.
"""


def notebook() -> dict:
    audit = json.loads(POP_ITEMS.read_text(encoding="utf-8"))["audit"]
    cells = [
        markdown(INTRO.replace("__CHARS__", str(audit["characters"])).replace("__ROWS__", f"{audit['rows']:,}")),
        code(f"""
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q", {", ".join(repr(p) for p in PACKAGES)}], check=True)
import torch
assert torch.cuda.is_available(), "Choose Runtime > Change runtime type > T4 GPU, then run all again"
print(torch.__version__, torch.cuda.get_device_name(0))
print("If Colab asks to restart the session, restart it and choose Runtime > Run all again.")
""", "1. Install the pinned libraries and require a GPU"),
        code(SETTINGS, "2. Settings"),
        code(WRITE.replace("__BLOB__", bundle()).replace("__DIGESTS__", repr(digests())),
             "3. Unpack the embedded data and trainer"),
        code(COMMON, "4. Shared helpers"),
        markdown("## Look at the data"),
        code(EXPLORE, "5. Characters and queries"),
        code(BUILD, "6. Build the training set (pop queries + v6 replay)"),
        markdown("## Train"),
        code(FETCH.replace("__BASE__", repr(BASE_REPO)), "7a. Fetch v6-colab, check it, recover trainable weights"),
        code(BEFORE, "7b. Baseline: how v6-colab handles pop-culture goals"),
        code(TRAIN, "8. Fine-tune (resumes from Drive after a disconnect)"),
        code(AFTER, "9. Before vs after"),
        code(TRY, "10. Try it"),
        markdown("## Export"),
        code(PACKAGE.replace("__SERVING__", repr(SERVING)), "11. Package the serving files with checksums and download"),
        code(UPLOAD.replace("__SERVING__", repr(SERVING)), "12. Upload to Hugging Face (optional)"),
        markdown(NEXT),
    ]
    return {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                                         "kernelspec": {"display_name": "Python 3", "name": "python3"},
                                         "language_info": {"name": "python"}},
            "nbformat": 4, "nbformat_minor": 0}


if __name__ == "__main__":
    if not V6_DATASET.exists():
        raise SystemExit(f"{V6_DATASET} is missing: build it first (python -m training.v6 --dataset ..., see V6.md)")
    OUTPUT.write_text(json.dumps(notebook(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUTPUT} ({OUTPUT.stat().st_size / 1e6:.1f} MB)")
