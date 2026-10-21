"""Learners' answers to "Are you satisfied with this recommendation?", as a CSV for the feedback notebook.

Run from backend/ in the main environment, with DATABASE_URL pointing at the database the answers are in:
    python -m training.feedback --output training/runs/feedback.csv [--from 2026-10-01] [--to 2026-10-31]

One row per answer: the qualification, where it stood among the matches, the numbers that scored it (keyword
strength, the semantic z-score, the model and its parameters), the readiness result, and the answer with its reason
and, after "wrong qualification", the one the learner wanted instead.
Left out are the answer's id, the goal's keyed hash, whether the learner was signed in, the experience and
certification their goal mentioned, and any time finer than the month; rows are sorted by their values, not by when
they came in. So a row describes a recommendation, not a learner, and the file can go to Colab
(colab/feedback_colab.ipynb).

An answer keeps no goal words, so these rows can't become (query, passage) training pairs; the goals learners chose
to share are collected separately (training/shared_goals.py). The notebook turns the answers into a worklist: the
qualifications that need more training examples, and the readiness and pathway content learners found off.
"""
import argparse
import csv
from datetime import date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from tesda_track.db import get_engine
from tesda_track.models import Qualification, RecommendationFeedback
from tesda_track.services.match_stats import PHILIPPINE_TIME

COLUMNS = ("month", "qualification_code", "qualification_name", "place", "rank", "match_count", "score", "keyword",
           "z_score", "model", "z_floor", "z_ceiling", "keyword_weight", "min_score", "intent", "readiness_score",
           "readiness_level", "satisfied", "reason", "wanted_code", "wanted_name")
PARAMS = ("z_floor", "z_ceiling", "keyword_weight", "min_score")


def place(rank: int | None) -> str:
    """As the feedback report counts it: the first match, a later one, or picked from the library."""
    return "top_match" if rank == 1 else "other_match" if rank else "own_choice"


def rows(session: Session, date_from: date | None = None, date_to: date | None = None) -> list[dict]:
    """The answers given on the Philippine-calendar dates from `date_from` to `date_to`, both included."""
    wanted = aliased(Qualification)
    query = (select(RecommendationFeedback, Qualification, wanted)
             .join(Qualification, RecommendationFeedback.qualification_id == Qualification.id)
             .outerjoin(wanted, RecommendationFeedback.wanted_qualification_id == wanted.id))
    if date_from:
        query = query.where(RecommendationFeedback.created_at >= datetime.combine(date_from, time.min, PHILIPPINE_TIME))
    if date_to:
        query = query.where(RecommendationFeedback.created_at
                            < datetime.combine(date_to + timedelta(days=1), time.min, PHILIPPINE_TIME))
    found = []
    for answer, qualification, instead in session.exec(query):
        params = answer.params or {}
        found.append({
            "month": answer.created_at.astimezone(PHILIPPINE_TIME).strftime("%Y-%m"),
            "qualification_code": qualification.code, "qualification_name": qualification.name,
            "place": place(answer.rank), "rank": answer.rank, "match_count": answer.match_count,
            "score": answer.score, "keyword": answer.keyword, "z_score": answer.z_score, "model": answer.model,
            **{name: params.get(name) for name in PARAMS},
            "intent": answer.intent, "readiness_score": answer.readiness_score,
            "readiness_level": answer.readiness_level, "satisfied": answer.satisfied, "reason": answer.reason,
            "wanted_code": instead.code if instead else None, "wanted_name": instead.name if instead else None})
    return sorted(found, key=lambda row: tuple("" if value is None else str(value) for value in row.values()))


def write(path: Path, answers: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(answers)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, required=True, help="e.g. training/runs/feedback.csv")
    parser.add_argument("--from", dest="date_from", type=date.fromisoformat, help="first day, YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", type=date.fromisoformat, help="last day, included")
    args = parser.parse_args()
    with Session(get_engine()) as session:
        answers = rows(session, args.date_from, args.date_to)
    write(args.output, answers)
    print(f"{args.output}: {len(answers)} answers, {sum(row['satisfied'] for row in answers)} satisfied")


if __name__ == "__main__":
    main()
