"""Command line for the embedding model: python -m tesda_track.embeddings {download,sync}"""
import argparse
import logging
import os
import sys

from tesda_track.config import DEFAULT_EMBEDDING_MODEL



def download() -> None:
    """Fetch the model files (or warm up a local fine-tuned model) without needing database settings (runs during the Docker build)."""
    from tesda_track.services.embeddings import E5Embedder

    model = os.environ.get("EMBEDDING_MODEL") or DEFAULT_EMBEDDING_MODEL
    model_path = os.environ.get("EMBEDDING_MODEL_PATH") or None  # a local model is only warmed up, never downloaded
    embedder = E5Embedder(model, os.environ.get("EMBEDDING_CACHE_DIR"), model_path)
    embedder.embed_passages(["warm-up"])
    print(f"{model} is ready.")


def sync() -> None:
    from sqlmodel import Session

    from tesda_track.db import get_engine
    from tesda_track.services.embeddings import get_embedder, sync as sync_embeddings

    embedder = get_embedder()
    if embedder is None:
        sys.exit("Semantic search is disabled or the model could not load; nothing was embedded.")
    with Session(get_engine()) as session:
        report = sync_embeddings(session, embedder)
        session.commit()
    print(f"Embeddings: {report.created} created, {report.updated} updated.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage the semantic search model and embeddings.")
    parser.add_argument("command", choices=("download", "sync"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    {"download": download, "sync": sync}[args.command]()


if __name__ == "__main__":
    main()
