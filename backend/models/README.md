# Fine-tuned matching models

Each folder here is one model written by `python -m training.finetune --output models/<name>`
run from `backend/` (see `backend/training/`). Folders are git-ignored; only this file is tracked.

## Get the shared model

The pilot model, `tesda-e5-small-v3`, is published with its `calibration.json` at
[huggingface.co/Nyanta19/tesda-e5-small-v3](https://huggingface.co/Nyanta19/tesda-e5-small-v3) (public; its
model card has the training details and the sealed-set evaluation against v2). From the repository root:

```bash
hf download Nyanta19/tesda-e5-small-v3 --local-dir backend/models/tesda-e5-small-v3
```

Then serve it as described below, with `EMBEDDING_MODEL=tesda-track/tesda-e5-small-v3` and
`EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v3`. This was the accepted pilot model as of
21 October 2026 (TASK-085), and is the rollback now that production serves v6-colab (below); see [the decision and acceptance gates](../../docs/ml/rounds.md#pilot-decision-21-october-2026).

### v6 (in production)

Production serves `tesda-e5-small-v6-colab`, published at
[huggingface.co/Nyanta19/tesda-e5-small-v6-colab](https://huggingface.co/Nyanta19/tesda-e5-small-v6-colab)
(public). It continues v4 with the v6 objective ([training/V6.md](../training/V6.md)).

```bash
hf download Nyanta19/tesda-e5-small-v6-colab --local-dir backend/models/tesda-e5-small-v6-colab
```

**It is published without a `calibration.json`**, and without one the app scores it with the base model's
defaults (`SEMANTIC_Z_FLOOR=3.0`, `MATCH_WEIGHT_KEYWORD=0.5`), which were not chosen for it. Calibrate it once,
from `backend/`, before serving:

```bash
python -m training.evaluate --model-path models/tesda-e5-small-v6-colab --set dev --calibrate --min-rejection 0.9 --save-calibration --json training/runs/v6-colab-dev.json
```

On 14 November 2026 that gave z_floor 2.0, z_ceiling 5.0, keyword weight 0.3, minimum score 20 (the same as
`v6-r2`), and on the 1,482 dev goals: top-1 0.851, top-3 0.929, MRR 0.887, rejection 0.970, all related shown
0.896. Only the dev step was run then; the `test_v1`, probe, round and sealed checks in
[training/V6.md](../training/V6.md#after-training-calibrate-evaluate-gate) were not. Serve it with
`EMBEDDING_MODEL=tesda-track/tesda-e5-small-v6-colab` and
`EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v6-colab`, then run `embeddings sync`.

The previous model stays published at
[huggingface.co/Nyanta19/tesda-e5-small-v2](https://huggingface.co/Nyanta19/tesda-e5-small-v2) for rollback.

The newest round, `tesda-e5-small-v4`, is published at
[huggingface.co/Nyanta19/tesda-e5-small-v4](https://huggingface.co/Nyanta19/tesda-e5-small-v4) (public). It adds
Kapampangan and a workplace-scenario query for every qualification, and rejects more unrelated goals (dev
rejection 0.980 against v3's 0.955), but it ties v3 on dev top-1 (0.779) and is marginally behind on dev top-3 and
MRR. Its regional data is synthetic and unreviewed, and its Kapampangan evaluation is five dev goals. Serve it the
same way, with `EMBEDDING_MODEL=tesda-track/tesda-e5-small-v4`, if you want those additions; v3 stays the default
here until the regional examples have been reviewed. The v4 model card has the full comparison.

## Folders and serving

One new folder and model name per retrain (e.g. `tesda-e5-small-v2`): `training.finetune` refuses a folder that
already holds a finished model, because stored embeddings are keyed by model name and the folder's calibration
belongs to the old vectors.

A serving folder holds `onnx/model.onnx`, the tokenizer and config files, `training.json`, and optionally
`calibration.json` (score parameters tuned with the model; the API uses them instead of the settings' values).
`model.safetensors` and `checkpoints/` are for training only.

Serve one locally by setting `EMBEDDING_MODEL=tesda-track/<name>` and `EMBEDDING_MODEL_PATH=backend/models/<name>`
in `.env`, then run `python -m tesda_track.embeddings sync` (embeddings are kept per model name).

Docker: the build copies this folder to `/app/finetuned/` without `model.safetensors`, `checkpoints/` or run logs
(`backend/.dockerignore`). Keep `EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v6-colab` for local commands
and set `DOCKER_EMBEDDING_MODEL_PATH=/app/finetuned/tesda-e5-small-v6-colab` in `.env` before
`docker compose up -d --build`. Compose uses v6-colab for both build and runtime by default (it used v3 until
14 November 2026). Download **and calibrate** the folder before building, so its `calibration.json` is copied into
the image; a missing model fails the image warmup, while a runtime load failure leaves the API on keyword matching
and readiness degraded. v6-colab's calibration is `2.0 / 5.0 / 0.3 / 20` (floor / ceiling / keyword weight /
minimum score); v3's accepted one is `3.5 / 5.5 / 0.3 / 20`. To build with v3 instead, set `EMBEDDING_MODEL` and
`DOCKER_EMBEDDING_MODEL_PATH` to its name in `.env`.
