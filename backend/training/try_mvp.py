"""Try learner questions with a local model and the application's matching rules."""
import argparse
from pathlib import Path

from tesda_track.services.analysis import score_matches
from tesda_track.services.embeddings import E5Embedder, qualification_text, read_calibration
from training.catalog import load_catalog
from training.evaluate import prepare


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", type=Path, default=Path("models/tesda-e5-small-v5-mvp"))
    parser.add_argument("--query")
    args = parser.parse_args()
    qualifications, items = load_catalog()
    params = read_calibration(str(args.model_path))
    if params is None:
        parser.error("The model folder must contain a valid calibration.json")
    model = E5Embedder("tesda-track/" + args.model_path.name, model_path=str(args.model_path))
    passages = []
    for start in range(0, len(qualifications), 8):
        passages.extend(model.embed_passages([qualification_text(q) for q in qualifications[start:start+8]]))
    while True:
        query = args.query or input("Your goal, qualification, job or skill (blank to finish): ").strip()
        if not query:
            break
        goal = {"goal": query, "accept": [], "lang": "en", "tags": []}
        prepared = prepare([goal], items, passages, model.embed_queries)[0]
        matches = score_matches(items, prepared.keyword, prepared.similarities, params, query=query)
        for match in matches:
            print(f"{match.qualification.name} - {match.reason}")
        if not matches:
            print("Please describe a specific job, task or qualification so we can narrow the options.")
        if args.query:
            break


if __name__ == "__main__":
    main()
