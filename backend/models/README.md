# Fine-tuned matching models

Each folder here is one model written by `python -m training.finetune --output models/<name>`
run from `backend/` (see `backend/training/`). Folders are git-ignored; only this file is tracked.

## Get the shared model

The recommended model, `tesda-e5-small-v3`, is published with its `calibration.json` at
[huggingface.co/Nyanta19/tesda-e5-small-v3](https://huggingface.co/Nyanta19/tesda-e5-small-v3) (public; its
model card has the training details and the sealed-set evaluation against v2). From the repository root:

```bash
hf download Nyanta19/tesda-e5-small-v3 --local-dir backend/models/tesda-e5-small-v3
```

Then serve it as described below, with `EMBEDDING_MODEL=tesda-track/tesda-e5-small-v3` and
`EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v3`.

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
(`backend/.dockerignore`). Set `EMBEDDING_MODEL_PATH=/app/finetuned/<name>` and `EMBEDDING_MODEL=tesda-track/<name>`
in `.env` before `docker compose up -d --build`. With neither set the image uses the default model, and a missing or
broken folder leaves the API on keyword matching.
