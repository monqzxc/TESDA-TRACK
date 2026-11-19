"""Build colab/train_colab_skills.ipynb: fine-tune the matcher on synthetic TSP skill profiles, add a 2023-2026
demand trend and a training-or-assessment route model. Self-contained: the notebook embeds the synthetic data from
training/skills_profile.py, the public catalog and training/recover.py.

Standard library only. From backend/:
    python3 training/skills_profile.py      # writes training/data/skills_profile/
    python3 training/skills_notebook.py     # writes training/colab/train_colab_skills.ipynb
"""
import base64
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "skills_profile"
OUTPUT = HERE / "colab" / "train_colab_skills.ipynb"
# (repo, pinned revision, sha256 of onnx/model.onnx). v6-colab is what production serves (backend/models/README.md);
# its digest matches the repo's checksums.json and Hugging Face's LFS hash. v4's is training/v5.V4_SHA.
PUBLISHED = {
    "v6": ("Nyanta19/tesda-e5-small-v6-colab", "a871a651887f25c598793411e9d1b8eed9177ec4",
           "0adef47feb648c7c1b902cf496ce4ceaf052de04784d155730b37b3127f489e1"),
    "v4": ("Nyanta19/tesda-e5-small-v4", "main", "76cbab6ba7b27672b1f3b5e0b48260b5a4bc0d5d942d4ccaeb625948ab2e5600"),
}
PACKAGES = ["sentence-transformers==6.1.0", "transformers==5.19.0", "accelerate==1.15.0", "onnx==1.23.2",
            "onnxruntime==1.31.0", "fastembed==0.8.1", "datasets", "scikit-learn", "joblib"]


def code(source: str, title: str) -> dict:
    return {"cell_type": "code", "metadata": {"cellView": "form"}, "execution_count": None, "outputs": [],
            "source": ("#@title " + title + "\n" + source.strip() + "\n").splitlines(True)}


def markdown(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip().splitlines(True)}


def bundle() -> str:
    """The generator and its inputs (~90 KB), not the generated data (~20 MB): a multi-megabyte line blanks Colab."""
    files = {"training/skills_profile.py": HERE / "skills_profile.py",
             "seed/qualifications.json": HERE.parent / "seed" / "qualifications.json",
             "seed/regions.json": HERE.parent / "seed" / "regions.json", "recover.py": HERE / "recover.py"}
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w") as tar:
        for name, path in files.items():
            data = path.read_bytes()
            info = tarfile.TarInfo(name)
            info.size, info.mtime = len(data), 0
            tar.addfile(info, io.BytesIO(data))
    encoded = base64.b64encode(gzip.compress(raw.getvalue(), compresslevel=9, mtime=0)).decode()
    return "\n".join(encoded[i:i + 100] for i in range(0, len(encoded), 100))  # short lines; b64decode skips newlines


def data_digests() -> dict:
    return {name: hashlib.sha256((DATA / name).read_bytes()).hexdigest() for name in ("profiles.jsonl", "demand_quarterly.csv")}


INTRO = """
# TESDA learner matcher · skills-profile round (synthetic TSP skills + 2023–2026 demand)

**Runtime → Change runtime type → T4 GPU**, then **Runtime → Run all**. Training takes roughly 20–40 minutes on a T4.

What this notebook does:

1. **Looks at the data**: about 8,000 synthetic Skill Passport profiles (skills, experience, certificates, region) and a
   synthetic demand table (job postings, vacancies, applicants) for every qualification × region × quarter,
   2023-Q1 to 2026-Q4 (2026-Q4 is a projection).
2. **Fine-tunes the matcher** so a learner's TSP skills (`"cooking, baking, customer service"`, exactly the text the
   app embeds for a TSP suggestion) rank the right qualification first. It continues **v6-colab**, the model production serves now, so its
   multilingual goal search is the starting point.
3. **Trains a route model**: should this learner go to an **assessment center** (already skilled) or a **training
   center**?
4. **Blends in demand**: among qualifications that already match, rising and in-demand ones in the learner's
   region move up. Demand never adds a qualification that doesn't match.
5. **Exports** the ONNX model the API serves (checked against fastembed), the route model and the demand features
   as one zip.

**All data here is synthetic**, generated from the public TESDA catalog by `backend/training/skills_profile.py`.
Demand figures are invented trends, not DOLE/PhilJobNet numbers: never show them to learners as real. Scores
measured here only show the model learned the synthetic patterns. Before adoption, calibrate and evaluate the model
locally on the real dev goals and the acceptance gate (`backend/training/README.md`).
"""

SETTINGS = """
ROUND = "skills-v1"          # new name (skills-v2, ...) for a new experiment
BASE = "v6"                  # "v6": continue v6-colab (what production serves); "v4": the older v4; "e5": plain multilingual-e5-small
EPOCHS = 2
LR = 2e-5
BATCH_SIZE = 128             # in-batch negatives; memory is bounded by MINI_BATCH
MINI_BATCH = 16              # lower to 8 if the GPU runs out of memory
CATALOG_REPLAY = True        # also train on catalog names/jobs/keywords so goal-style search does not regress
Z_FLOOR = 3.5                # the app's semantic_z_floor: below it, nothing is shown
USE_DRIVE = True             # checkpoints survive a disconnect
SMOKE = False                # True: 30 steps only, to check the whole notebook end to end

import json
from pathlib import Path
WORK = Path("/content/tesda-skills"); WORK.mkdir(exist_ok=True)
(WORK / "settings.json").write_text(json.dumps({k: v for k, v in globals().items()
    if k.isupper() and isinstance(v, (str, int, float, bool))}, indent=2))
(WORK / "runs_dir.txt").unlink(missing_ok=True)   # re-decide the runs folder with these settings
print((WORK / "settings.json").read_text())
if USE_DRIVE:
    print("Connecting Google Drive: accept the sign-in popup (it can hide behind this window).")
    try:
        from google.colab import drive
        drive.mount("/content/drive")
    except Exception as error:
        print(f"Drive did not mount ({error}); training will save in this session instead.")
"""

WRITE_DATA = """
import base64, gzip, hashlib, io, shutil, subprocess, sys, tarfile
from pathlib import Path
WORK = Path("/content/tesda-skills"); WORK.mkdir(exist_ok=True)
BLOB = \"\"\"
__BLOB__
\"\"\"
with tarfile.open(fileobj=io.BytesIO(gzip.decompress(base64.b64decode(BLOB)))) as tar:
    tar.extractall(WORK, filter="data")
shutil.copy2(WORK / "seed" / "qualifications.json", WORK / "qualifications.json")
# Generate the synthetic profiles and demand table here (deterministic, a few seconds).
subprocess.run([sys.executable, "-I", str(WORK / "training" / "skills_profile.py"), "--output", str(WORK)], check=True)
EXPECTED = __DIGESTS__
for name, want in EXPECTED.items():
    got = hashlib.sha256((WORK / name).read_bytes()).hexdigest()
    print(f"{name:24s} {(WORK / name).stat().st_size:>12,} bytes  {'same as the repo' if got == want else 'DIFFERS from the repo copy (fine, but numbers will differ slightly)'}")
"""

COMMON = '''
# Shared helpers, saved as a module so every later cell can import them after a restart.
from pathlib import Path
WORK = Path("/content/tesda-skills")
(WORK / "common.py").write_text(r"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

WORK = Path("/content/tesda-skills")
S = json.loads((WORK / "settings.json").read_text())

def catalog():
    return json.loads((WORK / "qualifications.json").read_text(encoding="utf-8"))

def qualification_text(q):
    # Same text the API embeds (tesda_track/services/embeddings.qualification_text).
    comps = "; ".join(c["name"] for c in q["competencies"])
    return (f"{q['name']}. Sector: {q['sector']}. Jobs: {', '.join(q['possible_jobs'])}. "
            f"Skills: {q['skill_label']}. Keywords: {', '.join(q['career_keywords'])}. Competencies: {comps}.")

def profiles():
    return pd.read_json(WORK / "profiles.jsonl", lines=True)

def demand():
    return pd.read_csv(WORK / "demand_quarterly.csv")

def runs_dir():
    # Decided once per session and remembered, so training and export always use the same folder.
    chosen = WORK / "runs_dir.txt"
    if chosen.exists():
        return Path(chosen.read_text())
    path = WORK / "runs"
    if S["USE_DRIVE"]:
        drive_root = Path("/content/drive/MyDrive")
        if not drive_root.exists():
            try:
                from google.colab import drive
                drive.mount("/content/drive")
            except Exception as error:
                print(f"Google Drive did not mount ({error}). Saving checkpoints in this session instead: "
                      "a disconnect restarts training. To use Drive, run cell 2 again and accept the sign-in popup.")
        if drive_root.exists():
            path = drive_root / "tesda-track-training"
    path.mkdir(parents=True, exist_ok=True)
    chosen.write_text(str(path))
    print("Runs folder:", path)
    return path

def out_dir():
    return runs_dir() / (f"tesda-e5-small-{S['ROUND']}" + ("-smoke" if S["SMOKE"] else ""))

def encode(model, texts, kind, batch=128):
    return model.encode([f"{kind}: {t}" for t in texts], batch_size=batch, normalize_embeddings=True,
                        convert_to_numpy=True, show_progress_bar=False)

def zscores(q_vecs, p_vecs):
    # The app ranks by cosine and abstains when the best z-score against the whole catalog is under its floor.
    s = q_vecs @ p_vecs.T
    return (s - s.mean(1, keepdims=True)) / s.std(1, keepdims=True)

def evaluate(model, frame, codes, passages_vecs=None, z_floor=None):
    z_floor = S["Z_FLOOR"] if z_floor is None else z_floor
    if passages_vecs is None:
        passages_vecs = encode(model, [qualification_text(q) for q in catalog()], "passage")
    z = zscores(encode(model, frame["query"].tolist(), "query"), passages_vecs)
    index = {c: i for i, c in enumerate(codes)}
    order = np.argsort(-z, axis=1)
    top1 = top3 = mrr = shown3 = 0.0
    related = rejected = unrelated = 0
    for row, ranks, zrow in zip(frame.itertuples(), order, z):
        if not row.targets:
            unrelated += 1
            rejected += zrow[ranks[0]] < z_floor
            continue
        related += 1
        wanted = {index[c] for c in row.targets}
        pos = next(i for i, r in enumerate(ranks) if r in wanted)
        top1 += pos == 0
        top3 += pos < 3
        mrr += 1 / (pos + 1)
        shown3 += pos < 3 and zrow[ranks[pos]] >= z_floor   # correct AND above the floor, so the app shows it
    return {"top1": top1 / related, "top3": top3 / related, "mrr": mrr / related,
            "shown_top3": shown3 / related, "rejection": rejected / max(unrelated, 1),
            "related": related, "unrelated": unrelated}
""")
import sys; sys.path.insert(0, str(WORK))
print("common.py written")
'''

EXPLORE = """
import sys; sys.path.insert(0, "/content/tesda-skills")
import importlib, common; importlib.reload(common)
import matplotlib.pyplot as plt
P = common.profiles()
print(f"{len(P):,} profiles"); display(P.groupby(["kind", "split"]).size().unstack())
print("Route labels:"); display(P["route"].value_counts(dropna=False))
display(P[["query", "experience_years", "targets", "route", "region_code"]].sample(8, random_state=1))
P["n_skills"] = P["skills"].str.len()
P["n_skills"].plot.hist(bins=8, title="Skills per profile"); plt.show()
"""

TRENDS = """
import sys; sys.path.insert(0, "/content/tesda-skills")
import common
import matplotlib.pyplot as plt
D = common.demand()
print(f"{len(D):,} demand rows · periods {D.period.min()} to {D.period.max()} · 2026-Q4 is a projection")

# 1. National vacancies by sector per year (top 8 sectors)
year = D.groupby(["year", "sector"])["vacancies"].sum().unstack()
top = year.loc[2026].sort_values(ascending=False).index[:8]
ax = year[top].plot(marker="o", figsize=(11, 5), title="National vacancies by sector, 2023–2026 (synthetic; 2026 includes projected Q4)")
ax.set_xticks([2023, 2024, 2025, 2026]); ax.legend(bbox_to_anchor=(1, 1)); plt.show()

# 2. Growth 2023 -> trailing four quarters (2025-Q4..2026-Q3), per qualification, nationally
last4 = ["2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"]
q23 = D[D.year == 2023].groupby("qualification_name")["vacancies"].sum()
qlast = D[D.period.isin(last4)].groupby("qualification_name")["vacancies"].sum()
cagr = ((qlast / q23) ** (1 / 2.75) - 1).sort_values()
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
cagr.tail(15).plot.barh(ax=axes[0], color="tab:green", title="Fastest rising (yearly growth)")
cagr.head(15).plot.barh(ax=axes[1], color="tab:red", title="Declining or slowest")
plt.tight_layout(); plt.show()

# 3. Quarterly trend for a few well-known qualifications
pick = [n for n in D.qualification_name.unique() if any(k in n for k in ("Cookery", "Contact Center", "Electrical Installation", "Caregiving", "Housekeeping"))][:6]
D[D.qualification_name.isin(pick)].groupby(["period", "qualification_name"])["vacancies"].sum().unstack().plot(
    figsize=(12, 5), marker=".", title="Quarterly vacancies, national (synthetic)").legend(bbox_to_anchor=(1, 1)); plt.show()

# 4. Demand/supply by region and sector, latest four quarters
heat = D[D.period.isin(last4)].groupby(["region_code", "sector"])[["vacancies", "applicants"]].sum()
ratio = (heat.vacancies / heat.applicants).unstack()[top]
plt.figure(figsize=(12, 7)); plt.imshow(ratio, cmap="RdYlGn", aspect="auto")
plt.yticks(range(len(ratio)), ratio.index); plt.xticks(range(len(top)), [t[:22] for t in top], rotation=45, ha="right")
plt.colorbar(label="vacancies per applicant"); plt.title("Where employers need more workers than apply (latest 4 quarters)")
plt.tight_layout(); plt.show()
"""

DEMAND_FEATURES = """
import sys; sys.path.insert(0, "/content/tesda-skills")
import common
import numpy as np
D = common.demand()
last4 = ["2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"]
key = ["region_code", "qualification_code"]
base = D[D.year == 2023].groupby(key)[["vacancies", "applicants"]].sum()
latest = D[D.period.isin(last4)].groupby(key).agg(vacancies=("vacancies", "sum"), applicants=("applicants", "sum"),
                                                  demand_index=("demand_index", "mean"))
F = latest.join(base, rsuffix="_2023")
F["trend_cagr"] = (F.vacancies / F.vacancies_2023.clip(lower=1)) ** (1 / 2.75) - 1
F["demand_supply_ratio"] = F.vacancies / F.applicants.clip(lower=1)
F["trend_label"] = np.select([F.trend_cagr > 0.05, F.trend_cagr < -0.01], ["rising", "declining"], "stable")
# One standardised number per region and qualification: half current demand, half trend, a little shortage.
zs = lambda s: (s - s.mean()) / s.std()
F["demand_score"] = 0.45 * zs(F.demand_index) + 0.4 * zs(F.trend_cagr.clip(-0.3, 0.6)) + 0.15 * zs(np.log(F.demand_supply_ratio))
F = F.reset_index()
F.to_csv(common.WORK / "demand_features.csv", index=False)
print(F.trend_label.value_counts()); display(F.sort_values("demand_score", ascending=False).head(10))
"""

FETCH_BASE = """
import hashlib, json, shutil, subprocess, sys
from pathlib import Path
WORK = Path("/content/tesda-skills")
S = json.loads((WORK / "settings.json").read_text())
BASE = WORK / "base-model"
# Published TESDA models hold only their ONNX export: pin the revision, check the file, recover trainable weights.
PUBLISHED = __PUBLISHED__
marker = BASE / "base.txt"
if marker.exists() and marker.read_text() != S["BASE"]:
    shutil.rmtree(BASE)          # BASE changed in the settings: rebuild from the new parent
if S["BASE"] in PUBLISHED:
    repo, revision, sha = PUBLISHED[S["BASE"]]
    from huggingface_hub import snapshot_download
    parent = WORK / repo.split("/")[1]
    snapshot_download(repo, revision=revision, local_dir=parent,
                      allow_patterns=["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"])
    with open(parent / "onnx/model.onnx", "rb") as f:
        assert hashlib.file_digest(f, "sha256").hexdigest() == sha, f"Unexpected {S['BASE']} parent ONNX"
    if not (BASE / "recovered_from.txt").exists():
        shutil.rmtree(BASE, ignore_errors=True)
        subprocess.run([sys.executable, "-u", str(WORK / "recover.py"), "--onnx-folder", str(parent),
                        "--output", str(BASE)], cwd=WORK, check=True)
    print(f"Base: {repo} @ {revision[:12]}")
    print((BASE / "recovered_from.txt").read_text())
elif S["BASE"] == "e5":
    from sentence_transformers import SentenceTransformer
    if not BASE.exists():
        SentenceTransformer("intfloat/multilingual-e5-small").save_pretrained(str(BASE))
    print("Base: intfloat/multilingual-e5-small")
else:
    raise SystemExit(f"Unknown BASE {S['BASE']!r}: use v6, v4 or e5")
marker.write_text(S["BASE"])
"""

BASELINE = """
import sys, json; sys.path.insert(0, "/content/tesda-skills")
import common
from sentence_transformers import SentenceTransformer
P = common.profiles(); codes = [q["code"] for q in common.catalog()]
model = SentenceTransformer(str(common.WORK / "base-model"), device="cuda")
before = {split: common.evaluate(model, P[P.split == split], codes) for split in ("val", "test")}
(common.WORK / "metrics_before.json").write_text(json.dumps(before, indent=2))
for split, m in before.items():
    print(split, {k: round(v, 3) if isinstance(v, float) else v for k, v in m.items()})
"""

TRAIN = """
import sys, json, random; sys.path.insert(0, "/content/tesda-skills")
import common
import torch
from datasets import Dataset
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments
try:   # sentence-transformers 6 moved these; the old paths still work but warn
    from sentence_transformers.sentence_transformer import losses
    from sentence_transformers.sentence_transformer.training_args import BatchSamplers
except ImportError:
    from sentence_transformers import losses
    from sentence_transformers.training_args import BatchSamplers

S = common.S
P = common.profiles()
cat = {q["code"]: q for q in common.catalog()}
text = {c: "passage: " + common.qualification_text(q) for c, q in cat.items()}
rng = random.Random(42)

anchors, positives = [], []
for row in P[(P.split == "train") & (P.kind != "unrelated")].itertuples():
    for code in row.targets:      # a two-qualification profile is a positive for both
        anchors.append("query: " + row.query); positives.append(text[code])
replay = 0
if S["CATALOG_REPLAY"]:
    for code, q in cat.items():
        for t in [q["name"], q["skill_label"], *q["possible_jobs"][:3], *rng.sample(q["career_keywords"], min(3, len(q["career_keywords"])))]:
            if t:
                anchors.append("query: " + t); positives.append(text[code]); replay += 1
train = Dataset.from_dict({"anchor": anchors, "positive": positives}).shuffle(seed=42)
val = P[(P.split == "val") & (P.kind != "unrelated")]
val_ds = Dataset.from_dict({"anchor": ["query: " + q for q in val["query"]],
                            "positive": [text[t[0]] for t in val["targets"]]})
print(f"{len(train):,} training pairs ({replay:,} catalog replay), {len(val_ds):,} validation pairs")

OUT = common.out_dir(); CKPT = OUT / "checkpoints"
model = SentenceTransformer(str(common.WORK / "base-model"), device="cuda")
model.max_seq_length = 512
model[0].auto_model.embeddings.word_embeddings.weight.requires_grad_(False)   # keep the multilingual vocabulary
loss = losses.CachedMultipleNegativesRankingLoss(model, mini_batch_size=S["MINI_BATCH"])
args = SentenceTransformerTrainingArguments(
    output_dir=str(CKPT), num_train_epochs=S["EPOCHS"], per_device_train_batch_size=S["BATCH_SIZE"],
    per_device_eval_batch_size=S["BATCH_SIZE"], learning_rate=S["LR"], weight_decay=0.01,
    warmup_steps=max(1, int(0.05 * S["EPOCHS"] * len(train) / S["BATCH_SIZE"])),
    fp16=True, batch_sampler=BatchSamplers.NO_DUPLICATES,   # same qualification twice in a batch = false negative
    eval_strategy="steps", eval_steps=100, save_strategy="steps", save_steps=100, save_total_limit=2,
    logging_steps=20, max_steps=30 if S["SMOKE"] else -1, report_to="none", seed=42)
trainer = SentenceTransformerTrainer(model=model, args=args, train_dataset=train, eval_dataset=val_ds, loss=loss)
resume = CKPT.exists() and any(CKPT.glob("checkpoint-*"))
if resume: print("Resuming from the last checkpoint on Drive")
trainer.train(resume_from_checkpoint=resume or None)
FINAL = common.WORK / "trained"
model.save_pretrained(str(FINAL))
print("saved", FINAL)
"""

AFTER = """
import sys, json; sys.path.insert(0, "/content/tesda-skills")
import common
import pandas as pd
from sentence_transformers import SentenceTransformer
P = common.profiles(); codes = [q["code"] for q in common.catalog()]
model = SentenceTransformer(str(common.WORK / "trained"), device="cuda")
after = {split: common.evaluate(model, P[P.split == split], codes) for split in ("val", "test")}
before = json.loads((common.WORK / "metrics_before.json").read_text())
(common.WORK / "metrics_after.json").write_text(json.dumps(after, indent=2))
table = pd.DataFrame({f"{split} {when}": m for when, d in (("before", before), ("after", after)) for split, m in d.items()})
display(table.loc[["top1", "top3", "mrr", "shown_top3", "rejection"]].round(3))
for kind in ("single", "two_qualifications"):
    m = common.evaluate(model, P[(P.split == "test") & (P.kind.isin([kind, "unrelated"]))], codes)
    print(f"test · {kind:18s} top1 {m['top1']:.3f}  top3 {m['top3']:.3f}")
if after["test"]["rejection"] < before["test"]["rejection"] - 0.05:
    print("WARNING: rejection of unrelated skills dropped by more than 5 points; check before adopting.")
"""

ROUTE = """
import sys; sys.path.insert(0, "/content/tesda-skills")
import common
import numpy as np, joblib
from sentence_transformers import SentenceTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report

P = common.profiles(); P = P[P.kind != "unrelated"].reset_index(drop=True)
cat = common.catalog(); codes = [q["code"] for q in cat]
model = SentenceTransformer(str(common.WORK / "trained"), device="cuda")
passages = common.encode(model, [common.qualification_text(q) for q in cat], "passage")
core = {q["code"]: [c["name"] for c in q["competencies"] if c["category"] == "Core"] for q in cat}

core_cache = {}
def core_vecs(code):
    if code not in core_cache:
        core_cache[code] = common.encode(model, core[code], "passage") if core[code] else np.zeros((1, 384), dtype=np.float32)
    return core_cache[code]

def features(frame):
    # Only what the app knows at request time: the skills, experience, certificates and the top match.
    z = common.zscores(common.encode(model, frame["query"].tolist(), "query"), passages)
    all_skills = sorted({s for skills in frame.skills for s in skills})
    skill_vec = dict(zip(all_skills, common.encode(model, all_skills, "query")))
    rows = []
    for (_, r), zr in zip(frame.iterrows(), z):
        top = codes[int(zr.argmax())]
        sims = np.stack([skill_vec[s] for s in r.skills]) @ core_vecs(top).T
        rows.append([r.experience_years, len(r.certificates) > 0, len(r.skills), zr.max(),
                     (sims.max(1) > 0.85).sum(), (sims.max(0) > 0.85).mean()])
    return np.array(rows, dtype=float)

NAMES = ["experience_years", "has_certificate", "n_skills", "top_z", "skills_matching_core", "core_covered"]
train, test = P[P.split == "train"], P[P.split == "test"]
Xtr, Xte = features(train), features(test)
ytr, yte = (train.route == "ASSESSMENT_READINESS").to_numpy(), (test.route == "ASSESSMENT_READINESS").to_numpy()
clf = GradientBoostingClassifier(random_state=42).fit(Xtr, ytr)
print(classification_report(yte, clf.predict(Xte), target_names=["training center", "assessment center"]))
print(dict(zip(NAMES, clf.feature_importances_.round(3))))
joblib.dump({"model": clf, "features": NAMES, "core_threshold": 0.85}, common.WORK / "route_model.joblib")
"""

RECOMMEND = """
import sys; sys.path.insert(0, "/content/tesda-skills")
import common
import numpy as np, pandas as pd, joblib
import matplotlib.pyplot as plt
from sentence_transformers import SentenceTransformer

cat = common.catalog(); codes = [q["code"] for q in cat]; names = {q["code"]: q["name"] for q in cat}
model = SentenceTransformer(str(common.WORK / "trained"), device="cuda")
passages = common.encode(model, [common.qualification_text(q) for q in cat], "passage")
F = pd.read_csv(common.WORK / "demand_features.csv").set_index(["region_code", "qualification_code"])
national = F.groupby("qualification_code")[["demand_score", "trend_cagr"]].mean()
Z_FLOOR = common.S["Z_FLOOR"]

def demand_of(region, code):
    try:
        return F.loc[(region, code)]
    except KeyError:
        return national.loc[code]

def rank(z_row, region, weight):
    # Demand only reorders qualifications that already pass the floor; it never adds an unrelated one.
    eligible = np.flatnonzero(z_row >= Z_FLOOR)
    scored = [(z_row[i] + weight * demand_of(region, codes[i]).demand_score, i) for i in eligible]
    return [i for _, i in sorted(scored, reverse=True)]

# Choose the demand weight on validation: how much top-3 accuracy each weight costs, and how much demand it adds.
P = common.profiles(); V = P[(P.split == "val") & (P.kind != "unrelated")]
Zv = common.zscores(common.encode(model, V["query"].tolist(), "query"), passages)
rows = []
for w in (0, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0):
    hit = dem = 0
    for (_, r), zr in zip(V.iterrows(), Zv):
        top = rank(zr, r.region_code, w)[:3]
        hit += any(codes[i] in r.targets for i in top)
        dem += np.mean([demand_of(r.region_code, codes[i]).demand_score for i in top]) if top else 0
    rows.append({"weight": w, "top3_shown": hit / len(V), "mean_demand_score_top3": dem / len(V)})
sweep = pd.DataFrame(rows); display(sweep.round(3))
ax = sweep.plot(x="mean_demand_score_top3", y="top3_shown", marker="o", legend=False,
                title="Demand weight trade-off (labels = weight)")
for r in sweep.itertuples(): ax.annotate(r.weight, (r.mean_demand_score_top3, r.top3_shown))
plt.show()
best = sweep[sweep.top3_shown >= sweep.top3_shown.iloc[0] - 0.01].sort_values("mean_demand_score_top3").iloc[-1]
DEMAND_WEIGHT = float(best.weight)
print(f"Chosen DEMAND_WEIGHT = {DEMAND_WEIGHT} (largest weight costing at most 1 point of top-3)")
(common.WORK / "demand_weight.txt").write_text(str(DEMAND_WEIGHT))
"""

TRY = """
import sys; sys.path.insert(0, "/content/tesda-skills")
import common
import numpy as np, pandas as pd, joblib
from sentence_transformers import SentenceTransformer

#@markdown Try a learner's Skill Passport:
SKILLS = "Cooking, Baking, Customer service"  #@param {type:"string"}
REGION = "VII"  #@param ["NCR","CAR","I","II","III","IV-A","MIMAROPA","V","VI","NIR","VII","VIII","IX","X","XI","XII","XIII","BARMM"]
EXPERIENCE_YEARS = 3  #@param {type:"number"}
HAS_CERTIFICATE = False  #@param {type:"boolean"}

cat = common.catalog(); codes = [q["code"] for q in cat]; names = {q["code"]: q["name"] for q in cat}
core = {q["code"]: [c["name"] for c in q["competencies"] if c["category"] == "Core"] for q in cat}
model = SentenceTransformer(str(common.WORK / "trained"), device="cuda")
passages = common.encode(model, [common.qualification_text(q) for q in cat], "passage")
F = pd.read_csv(common.WORK / "demand_features.csv").set_index(["region_code", "qualification_code"])
route = joblib.load(common.WORK / "route_model.joblib")
weight = float((common.WORK / "demand_weight.txt").read_text())

skills = [s.strip() for s in SKILLS.split(",") if s.strip()]
z = common.zscores(common.encode(model, [", ".join(skills)], "query"), passages)[0]
eligible = [i for i in np.argsort(-z) if z[i] >= common.S["Z_FLOOR"]][:10]
if not eligible:
    print("No TESDA qualification matches these skills (the app would show nothing).")
rows = []
for i in eligible:
    d = F.loc[(REGION, codes[i])]
    rows.append({"qualification": names[codes[i]], "match_z": round(z[i], 2), "demand_index": round(d.demand_index, 1),
                 "trend": f"{d.trend_cagr:+.0%}/yr ({d.trend_label})", "score": z[i] + weight * d.demand_score, "i": i})
table = pd.DataFrame(rows).sort_values("score", ascending=False).head(5) if rows else pd.DataFrame()
if len(table):
    top = codes[int(table.iloc[0].i)]
    sv = common.encode(model, skills, "query"); cv = common.encode(model, core[top], "passage")
    sims = sv @ cv.T
    x = [[EXPERIENCE_YEARS, HAS_CERTIFICATE, len(skills), z.max(), (sims.max(1) > 0.85).sum(), (sims.max(0) > 0.85).mean()]]
    p = route["model"].predict_proba(x)[0, 1]
    display(table.drop(columns=["i"]).round(2))
    print(f"Top match: {names[top]}")
    print(f"Route: {'ASSESSMENT CENTER (ready to be assessed)' if p >= 0.5 else 'TRAINING CENTER first'}  (p_ready = {p:.2f})")
    print("The app then ranks nearby centers offering this qualification by distance (services/assessment_ranking.py).")
"""

EXPORT = '''
import sys, json, hashlib, shutil, zipfile; sys.path.insert(0, "/content/tesda-skills")
import common
import numpy as np, torch
from pathlib import Path
from sentence_transformers import SentenceTransformer
from transformers import AutoModel, AutoTokenizer

SRC = common.WORK / "trained"
OUT = common.out_dir(); OUT.mkdir(parents=True, exist_ok=True)
for item in SRC.iterdir():
    (shutil.copytree if item.is_dir() else shutil.copy2)(item, OUT / item.name, **({"dirs_exist_ok": True} if item.is_dir() else {}))

class LastHiddenState(torch.nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, input_ids, attention_mask, token_type_ids):
        return self.m(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids).last_hidden_state

# Same export as training/finetune.py and v6: what fastembed runs in the API.
hf = AutoModel.from_pretrained(OUT, attn_implementation="eager").eval()
sample = AutoTokenizer.from_pretrained(OUT)(["query: cook", "passage: a longer text, so the first is padded"], padding=True, return_tensors="pt")
inputs = (sample["input_ids"], sample["attention_mask"], torch.zeros_like(sample["input_ids"]))
names = ["input_ids", "attention_mask", "token_type_ids"]
(OUT / "onnx").mkdir(exist_ok=True)
with torch.no_grad():
    torch.onnx.export(LastHiddenState(hf), inputs, str(OUT / "onnx" / "model.onnx"), input_names=names,
                      output_names=["last_hidden_state"], opset_version=14, dynamo=False,
                      dynamic_axes={n: {0: "batch_size", 1: "sequence_length"} for n in [*names, "last_hidden_state"]})

from fastembed import TextEmbedding
from fastembed.common.model_description import ModelSource, PoolingType
name = "tesda-track/" + OUT.name
if not any(m["model"] == name for m in TextEmbedding.list_supported_models()):
    TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True,
                                   sources=ModelSource(hf=name), dim=384, model_file="onnx/model.onnx")
texts = ["query: cooking, baking, customer service", "query: hinang, welding, blueprint reading",
         "passage: " + common.qualification_text(common.catalog()[0]), "query: marunong mag-ayos ng aircon"]
served = np.asarray(list(TextEmbedding(name, specific_model_path=str(OUT)).embed(texts)))
ref = SentenceTransformer(str(OUT), device="cpu").encode(texts, normalize_embeddings=True)
parity = float(np.min(np.sum(served * ref, axis=1)))
print(f"fastembed parity: lowest cosine {parity:.6f}")
assert parity >= 0.999, "The ONNX export does not match the trained model"

for extra in ("route_model.joblib", "demand_features.csv", "demand_weight.txt", "metrics_before.json", "metrics_after.json"):
    shutil.copy2(common.WORK / extra, OUT / extra)
(OUT / "training.json").write_text(json.dumps({
    "profile": "skills-profile", "round": common.S["ROUND"], "base": common.S["BASE"], "settings": common.S,
    "synthetic_data": True, "parity_cosine": parity,
    "metrics_before": json.loads((common.WORK / "metrics_before.json").read_text()),
    "metrics_after": json.loads((common.WORK / "metrics_after.json").read_text())}, indent=2))
shutil.rmtree(OUT / "checkpoints", ignore_errors=True)
keep = ["config.json", "tokenizer.json", "tokenizer_config.json", "modules.json", "sentence_bert_config.json",
        "config_sentence_transformers.json", "1_Pooling/config.json", "onnx/model.onnx", "training.json",
        "route_model.joblib", "demand_features.csv", "demand_weight.txt"]
ZIP = Path("/content") / f"{OUT.name}.zip"
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    sums = {}
    for f in keep:
        if (OUT / f).exists():
            z.write(OUT / f, f"{OUT.name}/{f}")
            sums[f] = hashlib.sha256((OUT / f).read_bytes()).hexdigest()
    z.writestr(f"{OUT.name}/SHA256SUMS.json", json.dumps(sums, indent=2))
print(ZIP, f"{ZIP.stat().st_size / 1e6:.1f} MB")
from google.colab import files
files.download(str(ZIP))
'''

NEXT = """
## After the download

1. Unzip into `backend/models/` (git-ignored). You get `tesda-e5-small-skills-v1/`.
2. **Calibrate and evaluate locally** on the real dev goals and the frozen acceptance gate before adopting it
   (`backend/training/README.md`, `training.evaluate --set dev --calibrate --min-rejection 0.9`, then
   `TESDA_MODEL_TESTS=1` for `test_model_acceptance.py`). Synthetic-profile scores alone don't justify a switch.
3. To serve it, set `EMBEDDING_MODEL` / `EMBEDDING_MODEL_PATH` as in `docs/ml/rounds.md` and re-embed the catalog.
4. `route_model.joblib`, `demand_features.csv` and `demand_weight.txt` are **not used by the API yet**. Wiring them
   in (route → assessment vs training center list, demand → re-rank) is a separate backend change. Replace the
   synthetic demand with real DOLE/PhilJobNet aggregates (`backend/seed/sources/labor_market/`) before learners see it.
"""


def notebook() -> dict:
    cells = [
        markdown(INTRO),
        code(f"""
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q", {", ".join(repr(p) for p in PACKAGES)}], check=True)
import torch
assert torch.cuda.is_available(), "Choose Runtime > Change runtime type > T4 GPU, then run all again"
print(torch.__version__, torch.cuda.get_device_name(0))
print("If Colab asks to restart the session, restart it and choose Runtime > Run all again.")
""", "1. Install the pinned libraries and require a GPU"),
        code(SETTINGS, "2. Settings"),
        code(WRITE_DATA.replace("__BLOB__", bundle()).replace("__DIGESTS__", repr(data_digests())),
             "3. Unpack the catalog and generator, then generate the synthetic data"),
        code(COMMON, "4. Shared helpers"),
        markdown("## Look at the data"),
        code(EXPLORE, "5. Synthetic Skill Passport profiles"),
        code(TRENDS, "6. Demand trend 2023–2026 (synthetic)"),
        code(DEMAND_FEATURES, "7. Demand features per region and qualification"),
        markdown("## Fine-tune the matcher on skills"),
        code(FETCH_BASE.replace("__PUBLISHED__", repr(PUBLISHED)), "8. Fetch the base model"),
        code(BASELINE, "9. Baseline: how the base model ranks skill profiles"),
        code(TRAIN, "10. Fine-tune (resumes from Drive after a disconnect)"),
        code(AFTER, "11. Before vs after"),
        markdown("## Route and demand"),
        code(ROUTE, "12. Route model: assessment center or training center?"),
        code(RECOMMEND, "13. Choose how much demand may reorder matches"),
        code(TRY, "14. Try it"),
        markdown("## Export"),
        code(EXPORT, "15. Export ONNX, check fastembed parity, package and download"),
        markdown(NEXT),
    ]
    return {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                                         "kernelspec": {"display_name": "Python 3", "name": "python3"},
                                         "language_info": {"name": "python"}},
            "nbformat": 4, "nbformat_minor": 0}


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(notebook(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUTPUT} ({OUTPUT.stat().st_size / 1e6:.1f} MB)")
