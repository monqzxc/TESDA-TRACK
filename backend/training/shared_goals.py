"""Goals learners chose to share after rating a recommendation: collected for review, then used to test and train
matching.

Run from backend/ in the main environment, with DATABASE_URL pointing at the database the goals are in:
    python -m training.shared_goals collect [--split auto|train]

`collect` adds the goals shared since its last run to training/learner/shared_goals.json. The folder is git-ignored:
the file holds learners' own words and is never committed or published. Rows already in the file stay as the
reviewers left them. A new row starts "pending" and gets its split once; it never changes, so a goal can't move from
evaluation into training:
  auto (default): dev, or sealed for one goal in three (by its id), so the first real goals test the model;
  train: once there are enough evaluation goals, new ones are trained on instead.
A goal already in the file or in the evaluation sets is not added again, and its duplicate is deleted.

Review each row: take anything personal out of `goal` (or reject the row), check `accept` (exact catalog names; add
any other qualification that also fits), set `lang` (en, tl, taglish, ceb, ilo, hil or pam), then set
`review_status` to "reviewed" or "rejected". Only reviewed rows are used: dev and sealed ones join those evaluation
sets (tag and group "learner"), train ones join the training queries (pairs.load_synthetic). The next collect deletes
every reviewed and rejected goal from the database and empties a rejected row's goal, so the server keeps a shared
goal only until its review, and the file holds the only copy of the reviewed ones: back it up, outside git. `shown`
is the qualification the learner was recommended when they said it was wrong: a known wrong answer, kept for later
use as a hard negative.
"""
import argparse
import json
import uuid
from pathlib import Path

REVIEW_PATH = Path(__file__).resolve().parent / "learner" / "shared_goals.json"
SPLITS = ("dev", "sealed", "train")
STATUSES = ("pending", "reviewed", "rejected")


def read(path: Path | None = None) -> list[dict]:
    """The rows of a review file (none when there is no file yet), checked for what the loaders rely on."""
    path = path or REVIEW_PATH
    if not path.is_file():
        return []
    rows = json.loads(path.read_text(encoding="utf-8"))
    for row in rows:
        where = f"{path.name}: row {row.get('id', row.get('goal'))!r}"
        if row.get("split") not in SPLITS:
            raise ValueError(f"{where} has unknown split {row.get('split')!r}")
        if row.get("review_status") not in STATUSES:
            raise ValueError(f"{where} has unknown review_status {row.get('review_status')!r}")
        if row["review_status"] == "reviewed" and not (str(row.get("goal") or "").strip() and row.get("accept")):
            raise ValueError(f"{where} is reviewed but has no goal or no accepted qualification")
    return rows


def reviewed(split: str, path: Path | None = None) -> list[dict]:
    """The reviewed goals of one split, in the evaluation sets' shape (goals.py validates lang and names)."""
    return [{"goal": row["goal"], "accept": list(row["accept"]), "lang": row.get("lang"), "tags": ["learner"],
             "group": "learner"} for row in read(path) if row["split"] == split and row["review_status"] == "reviewed"]


def eval_texts(path: Path | None = None) -> list[str]:
    """Every dev and sealed goal not rejected, pending ones too, so training leaves them out before their review."""
    return [row["goal"] for row in read(path)
            if row["split"] != "train" and row["review_status"] != "rejected" and row.get("goal")]


def train_queries(path: Path | None = None) -> dict[str, list[str]]:
    """Reviewed training goals as extra queries per accepted qualification, as data/synthetic/*.json maps them."""
    from training.goals import LANGS

    queries: dict[str, list[str]] = {}
    for row in reviewed("train", path):
        if row["lang"] not in LANGS:
            raise ValueError(f"shared goal {row['goal']!r} has unknown lang {row['lang']!r}")
        for name in row["accept"]:
            queries.setdefault(name, []).append(row["goal"])
    return queries


def _split(goal_id: uuid.UUID, rule: str) -> str:
    if rule == "train":
        return "train"
    return "sealed" if goal_id.int % 3 == 0 else "dev"


def collect(session, path: Path | None = None, rule: str = "auto") -> dict[str, int]:
    """Adds the newly shared goals to the review file, and takes reviewed, rejected and duplicate ones off the
    database (see the module)."""
    from sqlalchemy import delete
    from sqlmodel import select

    from tesda_track.models import Qualification, SharedGoal
    from training.goals import curated_texts
    from training.pairs import exclusion_hash

    path = path or REVIEW_PATH
    rows = read(path)
    for row in rows:
        if row["review_status"] == "rejected":
            row["goal"] = ""
    # The reviewed words (personal details taken out) are the ones to keep: the database's copy goes.
    settled = [uuid.UUID(row["id"]) for row in rows if row["review_status"] != "pending"]
    known = {row["id"] for row in rows}
    taken = {exclusion_hash(text) for text in curated_texts()} | {
        exclusion_hash(row["goal"]) for row in rows if row.get("goal")}
    names = dict(session.exec(select(Qualification.id, Qualification.name)).all())
    duplicates, added = [], 0
    for goal in session.exec(select(SharedGoal).order_by(SharedGoal.shared_on, SharedGoal.id)):
        if str(goal.id) in known:
            continue
        key = exclusion_hash(goal.goal)
        if key in taken:
            duplicates.append(goal.id)
            continue
        taken.add(key)
        rows.append({"id": str(goal.id), "goal": goal.goal, "accept": [names[goal.qualification_id]],
                     "shown": names.get(goal.shown_qualification_id), "lang": "", "split": _split(goal.id, rule),
                     "review_status": "pending", "shared_on": goal.shared_on.isoformat()})
        added += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Only once the file holds the words do they go from the database.
    removed = session.exec(delete(SharedGoal).where(SharedGoal.id.in_(settled))).rowcount if settled else 0
    if duplicates:
        session.exec(delete(SharedGoal).where(SharedGoal.id.in_(duplicates)))
    session.commit()
    return {"added": added, "duplicates_deleted": len(duplicates), "reviewed_or_rejected_deleted": removed,
            "pending": sum(row["review_status"] == "pending" for row in rows),
            "reviewed": sum(row["review_status"] == "reviewed" for row in rows)}


def main() -> None:
    from sqlmodel import Session

    from tesda_track.db import get_engine

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    collecting = commands.add_parser("collect", help="add newly shared goals to the review file")
    collecting.add_argument("--split", choices=("auto", "train"), default="auto",
                            help="auto: new goals test the model (dev, one in three sealed); train: they train it")
    args = parser.parse_args()
    with Session(get_engine()) as session:
        counts = collect(session, rule=args.split)
    print(f"{REVIEW_PATH}: " + ", ".join(f"{count} {name.replace('_', ' ')}" for name, count in counts.items()))


if __name__ == "__main__":
    main()
