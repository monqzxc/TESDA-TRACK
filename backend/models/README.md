# Fine-tuned matching models

Each folder here is one model written by `python -m training.finetune --output models/<name>`
run from `backend/` (see `backend/training/`). Folders are git-ignored; only this file is tracked.

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
