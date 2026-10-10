"""Pack what fine-tuning needs into one zip for Google Colab (torch cannot load on this laptop).

Run from backend/ in the main environment:
    python -m training.bundle --output training/runs/colab-bundle.zip [--hard-negatives training/runs/<file>.json]
The zip holds the API package, the catalog, the training code, the synthetic queries, the optional hard-negative file
and data/exclusions.json (SHA-256 of every evaluation goal's normalised text). It holds no goal text, .env or model.
"""
import argparse
import json
import zipfile
from pathlib import Path

from training.pairs import exclusion_hash

BACKEND = Path(__file__).resolve().parents[1]


def _goal_texts() -> list[str]:
    data = BACKEND / "training" / "data"
    texts = [g["goal"] for g in json.loads((data / "eval_goals.json").read_text(encoding="utf-8"))]
    for split in ("dev", "sealed"):
        for path in sorted((data / "goals_v2" / split).glob("*.json")):
            texts += [g["goal"] for g in json.loads(path.read_text(encoding="utf-8"))]
    return texts


def exclusion_hashes() -> list[str]:
    return sorted({exclusion_hash(text) for text in _goal_texts()})


def bundle_files() -> list[Path]:
    files = [p for p in (BACKEND / "tesda_track").rglob("*") if p.is_file() and "__pycache__" not in p.parts
             and p.suffix != ".pyc"]
    files.append(BACKEND / "seed" / "qualifications.json")
    files += sorted((BACKEND / "training").glob("*.py"))
    files += sorted((BACKEND / "training" / "data" / "synthetic").glob("*.json"))
    files.append(BACKEND / "training" / "requirements.txt")
    files.append(BACKEND / "requirements.txt")
    return files


def build(output: Path, hard_negatives: Path | None = None) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in bundle_files():
            bundle.write(path, f"backend/{path.relative_to(BACKEND).as_posix()}")
        if hard_negatives:
            bundle.write(hard_negatives, f"backend/training/runs/{hard_negatives.name}")
        bundle.writestr("backend/training/data/exclusions.json", json.dumps(exclusion_hashes(), indent=0) + "\n")
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
