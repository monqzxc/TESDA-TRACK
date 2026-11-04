"""One retraining round with what learners told us: from their shared goals to a model that passes the gate.

Run from backend/ in the main environment:
    python -m training.round prepare v4-colab-2 [--hard-negatives training/runs/<file>.json] [--no-collect]
    (train on Colab with ROUND = "v4-colab-2", unzip the model into models/tesda-e5-small-v4-colab-2, calibrate it)
    python -m training.round check v4-colab-2

prepare collects the goals shared since the last collect (DATABASE_URL must point at the pilot's database;
--no-collect skips it), stops while any of them still waits for review (--allow-pending trains without those), and
builds the Colab bundle with the reviewed training goals and the recommendations learners called wrong
(training/shared_goals.py). A round name already used by a model folder is refused: stored embeddings are keyed by
model name.

check runs the round's model, with its calibration.json as the API would, against training/model_acceptance.json and
exits with an error unless it passes. Passing is the minimum for adopting it, not the decision: read its dev and
per-language numbers too (training.evaluate), and evaluate the sealed set once, at the end.
"""
import argparse
import json
import re
from pathlib import Path

from training import shared_goals

BACKEND = Path(__file__).resolve().parents[1]
MODELS = BACKEND / "models"
ROUND = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")


def model_folder(name: str) -> Path:
    return MODELS / f"tesda-e5-small-{name}"


def summary(path: Path | None = None) -> dict[str, int]:
    """What the review file holds for this round: pending goals, reviewed ones by split, and learner negatives."""
    rows = shared_goals.read(path)
    counts = {"pending": sum(row["review_status"] == "pending" for row in rows)}
    for split in shared_goals.SPLITS:
        counts[f"reviewed_{split}"] = sum(row["split"] == split and row["review_status"] == "reviewed" for row in rows)
    counts["learner_negatives"] = len(shared_goals.train_negatives(path))
    return counts


def prepare(name: str, output: Path, hard_negatives: Path | None = None, collect: bool = True,
            allow_pending: bool = False) -> dict[str, int]:
    from training import bundle

    if model_folder(name).exists():
        raise SystemExit(f"{model_folder(name)} exists: choose a new round name")
    if hard_negatives and not hard_negatives.is_file():
        raise SystemExit(f"{hard_negatives} not found: mine it first (python -m training.mine)")
    if collect:
        from sqlmodel import Session

        from tesda_track.db import get_engine

        with Session(get_engine()) as session:
            print("collect: " + ", ".join(f"{count} {key.replace('_', ' ')}"
                                          for key, count in shared_goals.collect(session).items()))
    counts = summary()
    if counts["pending"] and not allow_pending:
        raise SystemExit(f"{counts['pending']} shared goals wait for review in {shared_goals.REVIEW_PATH}: review them "
                         "(see training/shared_goals.py), or add --allow-pending to train without them")
    bundle.build(output, hard_negatives)
    return counts


def check(name: str, folder: Path | None = None) -> bool:
    from tesda_track.config import get_settings
    from tesda_track.services.embeddings import E5Embedder
    from training.acceptance import check as accept

    folder = folder or model_folder(name)
    if not (folder / "training.json").is_file():
        raise SystemExit(f"{folder} holds no finished model (training.json): unzip the Colab download there")
    if not (folder / "calibration.json").is_file():
        raise SystemExit(f"{folder} has no calibration.json: calibrate on dev first (training.evaluate --calibrate "
                         "--min-rejection 0.9) and write it as backend/models/README.md says")
    embedder = E5Embedder(f"tesda-track/{folder.name}", get_settings().embedding_cache_dir, str(folder))
    measured, failures = accept(embedder)
    print(f"{folder.name}: top1={measured.top1:.3f}  top3={measured.top3:.3f}  mrr={measured.mrr:.3f}  "
          f"rejection={measured.rejection:.3f}  objective={measured.objective:.3f}")
    for failure in failures:
        print("FAIL " + json.dumps(failure, ensure_ascii=False))
    return not failures


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    preparing = commands.add_parser("prepare", help="collect and check the shared goals, then build the Colab bundle")
    checking = commands.add_parser("check", help="run the round's model against model_acceptance.json")
    for command in (preparing, checking):
        command.add_argument("round", help='the notebook\'s ROUND, e.g. "v4-colab-2": a new one for every run')
    preparing.add_argument("--output", type=Path, default=Path("training/runs/colab-bundle-v4.zip"))
    preparing.add_argument("--hard-negatives", type=Path, default=None, help="mined file to bundle as well")
    preparing.add_argument("--no-collect", dest="collect", action="store_false", help="use the review file as it is")
    preparing.add_argument("--allow-pending", action="store_true", help="go on while goals still wait for review")
    checking.add_argument("--model-path", type=Path, default=None, help="default: models/tesda-e5-small-<round>")
    args = parser.parse_args(argv)
    if not ROUND.fullmatch(args.round):
        parser.error("round: letters, digits, - or _")

    if args.command == "check":
        if not check(args.round, args.model_path):
            raise SystemExit("The model does not pass model_acceptance.json: do not adopt it")
        print("Passes model_acceptance.json. Compare its dev and per-language numbers with the current model's "
              "(training.evaluate) before adopting it.")
        return
    counts = prepare(args.round, args.output, args.hard_negatives, args.collect, args.allow_pending)
    print(f"{args.output}: {counts['reviewed_train']} learner training goals, {counts['learner_negatives']} learner "
          f"negatives; {counts['reviewed_dev']} dev and {counts['reviewed_sealed']} sealed learner goals evaluate it"
          + (f"; {counts['pending']} pending goals left out" if counts["pending"] else ""))
    print(f'Next: in colab/train_colab_v4.ipynb set ROUND = "{args.round}" and NEW_BUNDLE = True, upload this zip and '
          f"run it; unzip the download into {model_folder(args.round).relative_to(BACKEND).as_posix()}, calibrate, "
          f"then: python -m training.round check {args.round}")


if __name__ == "__main__":
    main()
