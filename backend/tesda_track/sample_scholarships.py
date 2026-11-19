"""Seeded scholarships (US-0019), flagged scholarship_is_sample on the program.

    python -m tesda_track.sample_scholarships apply            # preview what would change
    python -m tesda_track.sample_scholarships apply --commit   # write it
    python -m tesda_track.sample_scholarships clear --commit   # take every sample scholarship off again

Within each qualification, every fourth active program (by id, starting with the first) gets a sample scholarship,
so every qualification that has a program has an open one, and a re-run picks the same programs. They close on
SAMPLE_CLOSES_ON, after the demo, except each qualification's second one, which closed on SAMPLE_CLOSED_ON, so the
demo also shows a scholarship whose tag has gone. Programs with real scholarship data are never touched, and clear
removes only what this command added. Real scholarship data replaces it.
"""
import argparse
import json
from datetime import date

from sqlalchemy import or_
from sqlmodel import Session, select

from tesda_track.db import get_engine
from tesda_track.models import TrainingProgram

SAMPLE_CLOSES_ON = date(2026, 12, 31)
SAMPLE_CLOSED_ON = date(2026, 11, 1)


def apply(session: Session) -> dict:
    # Programs with real scholarship data take no part; sample ones already added keep their place in the count.
    programs = session.exec(select(TrainingProgram).where(
        TrainingProgram.is_active,
        or_(TrainingProgram.scholarship_available.is_(False), TrainingProgram.scholarship_is_sample),
    ).order_by(TrainingProgram.id)).all()
    by_qualification: dict[int, list[TrainingProgram]] = {}
    for program in programs:
        by_qualification.setdefault(program.qualification_id, []).append(program)
    added = {"open": 0, "closed": 0}
    for group in by_qualification.values():
        for place, program in enumerate(group[::4]):
            if program.scholarship_is_sample:
                continue
            program.scholarship_available, program.scholarship_is_sample = True, True
            program.scholarship_closes_on = SAMPLE_CLOSED_ON if place == 1 else SAMPLE_CLOSES_ON
            added["closed" if place == 1 else "open"] += 1
            session.add(program)
    return {"sample_scholarships_added": added}


def clear(session: Session) -> dict:
    programs = session.exec(select(TrainingProgram).where(TrainingProgram.scholarship_is_sample)).all()
    for program in programs:
        program.scholarship_available, program.scholarship_is_sample, program.scholarship_closes_on = False, False, None
        session.add(program)
    return {"sample_scholarships_removed": len(programs)}


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=("apply", "clear"))
    parser.add_argument("--commit", action="store_true", help="write the change (default: preview only)")
    args = parser.parse_args(argv)
    with Session(get_engine()) as session:
        result = (apply if args.command == "apply" else clear)(session)
        if args.commit:
            session.commit()
        else:
            session.rollback()
        print(json.dumps({**result, "committed": args.commit}))


if __name__ == "__main__":
    main()
