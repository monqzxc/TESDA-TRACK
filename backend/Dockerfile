FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    EMBEDDING_CACHE_DIR=/app/models
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY alembic.ini ./
COPY migrations ./migrations
COPY seed ./seed
COPY tesda_track ./tesda_track
# A fine-tuned model from backend/models/ (README.md only when there is none); see that README.
COPY models ./finetuned
ARG EMBEDDING_MODEL=
ARG EMBEDDING_MODEL_PATH=
ARG SEMANTIC_SEARCH_ENABLED=true
# Bake the embedding model (about 470 MB) into the image so the server never downloads it at runtime.
# With EMBEDDING_MODEL_PATH set (e.g. /app/finetuned/tesda-e5-small-v1) the step only warms up that local model.
RUN useradd --system --uid 10001 --no-create-home app \
    && mkdir -p /app/models \
    && if [ "$SEMANTIC_SEARCH_ENABLED" = "true" ]; then python -m tesda_track.embeddings download; fi \
    && chown -R app /app/models
ENV HF_HUB_OFFLINE=1
USER app
EXPOSE 8000
# Only Caddy can reach this container, so forwarded client addresses are trusted.
CMD ["uvicorn", "tesda_track.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
