"""Pack what fine-tuning needs into one zip for Google Colab (torch cannot load on this laptop).

Run from backend/ in the main environment:
    python -m training.bundle --output training/runs/colab-bundle.zip [--hard-negatives training/runs/<file>.json]
The zip holds the API package, the catalog, the training code, the synthetic queries, the optional hard-negative file
and data/exclusions.json (SHA-256 of every evaluation goal's normalised text, learners' dev and sealed goals too).
Synthetic queries and mined rows that equal an evaluation goal are left out, so it holds no evaluation goal text, .env
or model. Of the goals learners shared (training/shared_goals.py) only the reviewed training ones go in, as text.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

from training import goals, shared_goals
from training.pairs import exclusion_hash

BACKEND = Path(__file__).resolve().parents[1]


def _goal_texts() -> list[str]:
    return goals.curated_texts() + shared_goals.eval_texts()


def exclusion_hashes() -> list[str]:
    return sorted({exclusion_hash(text) for text in _goal_texts()})


def bundle_files() -> list[Path]:
    files = [p for p in (BACKEND / "tesda_track").rglob("*") if p.is_file() and "__pycache__" not in p.parts
             and p.suffix != ".pyc"]
    files.append(BACKEND / "seed" / "qualifications.json")
    files += sorted((BACKEND / "training").glob("*.py"))
    files += sorted((BACKEND / "training" / "data" / "synthetic").glob("*.json"))
    files += sorted((BACKEND / "training" / "data" / "v3").glob("*.json"))
    files += sorted((BACKEND / "training" / "data" / "v4").glob("*.json"))
    files.append(BACKEND / "training" / "requirements.txt")
    files.append(BACKEND / "requirements.txt")
    return files


def _clean_synthetic(text: str, hashes: set[str]) -> str:
    """The synthetic file without any query that equals an evaluation goal, so the zip holds no goal text."""
    data = json.loads(text)
    return json.dumps({name: [q for q in queries if exclusion_hash(q) not in hashes] for name, queries in data.items()},
                      ensure_ascii=False, indent=1) + "\n"


def _clean_negatives(text: str, hashes: set[str]) -> str:
    rows = [r for r in json.loads(text) if exclusion_hash(r["query"]) not in hashes]
    return json.dumps(rows, ensure_ascii=False, indent=1) + "\n"


def _learner_training_goals(hashes: set[str]) -> list[dict]:
    """The reviewed training goals learners shared, with only what training reads: no ids, dates or other splits."""
    return [{"goal": row["goal"], "accept": row["accept"], "lang": row["lang"], "split": "train",
             "review_status": "reviewed"} for row in shared_goals.read()
            if row["split"] == "train" and row["review_status"] == "reviewed"
            and exclusion_hash(row["goal"]) not in hashes]


def build(output: Path, hard_negatives: Path | None = None) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    hashes = exclusion_hashes()
    known = set(hashes)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in bundle_files():
            name = f"backend/{path.relative_to(BACKEND).as_posix()}"
            if path.parent.name == "synthetic":
                bundle.writestr(name, _clean_synthetic(path.read_text(encoding="utf-8"), known))
            elif path.parent.name in ("v3", "v4"):
                rows = json.loads(path.read_text(encoding="utf-8"))
                bundle.writestr(name, json.dumps([r for r in rows if exclusion_hash(r["query"]) not in known],
                                                ensure_ascii=False, indent=2) + "\n")
            else:
                bundle.write(path, name)
        if hard_negatives:
            bundle.writestr(f"backend/training/runs/{hard_negatives.name}",
                            _clean_negatives(hard_negatives.read_text(encoding="utf-8"), known))
        if learner_goals := _learner_training_goals(known):
            bundle.writestr(f"backend/training/learner/{shared_goals.REVIEW_PATH.name}",
                            json.dumps(learner_goals, ensure_ascii=False, indent=2) + "\n")
        bundle.writestr("backend/training/data/exclusions.json", json.dumps(hashes, indent=0) + "\n")
    # Reopen so Windows ZipInfo.orig_filename is canonicalized before reads.
    with zipfile.ZipFile(output, "a", zipfile.ZIP_DEFLATED) as bundle:
        manifest = {name: hashlib.sha256(bundle.read(name)).hexdigest() for name in bundle.namelist()}
        bundle.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--hard-negatives", type=Path, default=None)
    args = parser.parse_args()
    path = build(args.output, args.hard_negatives)
    with zipfile.ZipFile(path) as bundle:
        count = len(bundle.namelist())
    print(f"{path}: {count} files, {path.stat().st_size / 1_048_576:.2f} MB")


if __name__ == "__main__":
    main()
