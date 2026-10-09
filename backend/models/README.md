# Fine-tuned matching models

Each folder here is one model written by `python -m training.finetune --output backend/models/<name>`
(see `backend/training/`). Folders are git-ignored; only this file is tracked.

A serving folder holds `onnx/model.onnx`, the tokenizer and config files, `training.json`, and optionally
`calibration.json` (score parameters tuned with the model; the API uses them instead of the settings' values).
`model.safetensors` and `checkpoints/` are for training only.

Serve one locally by setting `EMBEDDING_MODEL=tesda-track/<name>` and `EMBEDDING_MODEL_PATH=backend/models/<name>`
in `.env`, then run `python -m tesda_track.embeddings sync` (embeddings are kept per model name).

Docker: the build copies this folder to `/app/finetuned/` without `model.safetensors`, `checkpoints/` or run logs
(`backend/.dockerignore`). Set `EMBEDDING_MODEL_PATH=/app/finetuned/<name>` and `EMBEDDING_MODEL=tesda-track/<name>`
in `.env` before `docker compose up -d --build`. With neither set the image uses the default model, and a missing or
broken folder leaves the API on keyword matching.
