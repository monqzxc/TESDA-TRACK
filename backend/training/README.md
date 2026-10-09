# Matching model: evaluation and fine-tuning

Offline tools for the embedding model that matches learner goals to qualifications. Nothing here runs in the
API: the API image copies only `tesda_track`, `migrations` and `seed`, and installs only
`backend/requirements.txt`. The API keeps running `intfloat/multilingual-e5-small` on CPU through fastembed.

| File | What it does |
| --- | --- |
| `catalog.py` | Loads `seed/qualifications.json` as in-memory qualifications, so nothing needs a database |
| `data/eval_goals.json` | Hand-written learner goals (English, Filipino, Taglish, and goals with no TVET match), each in the `dev` or `test` split |
| `evaluate.py` | Scores the goals with the API's own matching code and reports top-1, top-3, MRR and rejection rate |
| `pairs.py` | Builds (query, passage) training pairs from the catalog |
| `finetune.py` | Fine-tunes the model on those pairs, exports ONNX and checks that fastembed reproduces it |

**Data.** Training and evaluation use only TESDA catalog text (`seed/qualifications.json`, whose Filipino
keywords come from `seed/sources/keywords_tl.json`) and the hand-written goals. Never learner, worker, T2MIS or TSP records. The
training queries are each qualification's name, skill, jobs, keywords and competencies, plus short English and
Filipino phrasings ("I want to work as a cook", "gusto kong maging cook"). Any query that equals an evaluation
goal is dropped, so the evaluation stays held out.

## Evaluate and calibrate

The main environment (`.venv`) is enough. From `backend/`:

```bash
../.venv/Scripts/python -m training.evaluate --split all             # the settings' model and parameters
../.venv/Scripts/python -m training.evaluate --split all --calibrate # search the score parameters on dev, report test
../.venv/Scripts/python -m training.evaluate --params 2.5 4.0 0.5 25 # try FLOOR CEILING WEIGHT MIN
```

Add `--json runs/<name>.json` to keep the numbers (`training/runs/` is git-ignored). Calibrate on `dev` only and
judge on `test`.

## Fine-tune

Training needs torch and sentence-transformers, which stay out of the API's requirements. Create a separate
environment at the repository root (Python 3.13), installing torch first from PyTorch's index:

```bash
python -m venv .venv-train
# NVIDIA GPU:
.venv-train/Scripts/python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
# or CPU only:
.venv-train/Scripts/python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
.venv-train/Scripts/python -m pip install -r backend/training/requirements.txt
.venv-train/Scripts/python -c "import torch; print(torch.cuda.is_available())"
```

Then, from `backend/`:

```bash
../.venv-train/Scripts/python -m training.finetune --output models/e5-small-tesda
```

Options: `--epochs 3`, `--batch-size 64`, `--mini-batch-size 8` (lower it if GPU memory runs out; it does not
change the result), `--lr 2e-5`, `--seed 42`, `--max-steps N` (a short smoke run). It trains with in-batch
negatives (`CachedMultipleNegativesRankingLoss`, no duplicate texts in a batch), uses fp16 on a CUDA GPU, and
reports the loss on 5% of the pairs held out from training. Use a GPU: a step of 64 pairs took about 2.5 s on
a 4 GB laptop RTX 3050 (a full 3-epoch run is about 590 steps, roughly 25 minutes) but about 3 minutes on a
4-core laptop CPU, which makes CPU training impractical beyond a few smoke steps.

The output folder (git-ignored, like everything in `backend/models/` except its README) holds the
sentence-transformers model, `onnx/model.onnx` (what fastembed runs) and `training.json` (base model, settings,
pair counts, held-out loss, date and git commit). The script exits with an error if fastembed's vectors for the
exported model differ from sentence-transformers' (cosine below 0.999 on ten catalog texts).

The ONNX export uses `torch.onnx` directly: no optimum release supports transformers 5, so sentence-transformers'
ONNX backend can't be used.
