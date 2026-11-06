"""Offline, transactional labor-market maintenance. Never auto-approves proposals."""

import argparse, json, sys
from pathlib import Path
from sqlmodel import Session, select
from tesda_track.db import get_engine
from tesda_track.models import Learner
from tesda_track.models.labor_market import LaborMarketMapping as Mapping
from tesda_track.services import labor_market as service
from tesda_track.schemas.labor_market import ReviewInput


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    i = sub.add_parser("import")
    i.add_argument("bundle", type=Path)
    i.add_argument("--dry-run", action="store_true")
    r = sub.add_parser("review")
    r.add_argument("mapping_id", type=int)
    r.add_argument(
        "--decision", choices=["approved", "rejected", "pending"], required=True
    )
    r.add_argument(
        "--expected", choices=["pending", "approved", "rejected"], required=True
    )
    r.add_argument("--note", required=True)
    r.add_argument("--actor-email", required=True)
    d = sub.add_parser("dataset-status")
    d.add_argument("dataset_id", type=int)
    d.add_argument("--status", choices=["active", "retired"], required=True)
    d.add_argument("--note", required=True)
    d.add_argument("--actor-email", required=True)
    a = p.parse_args()
    with Session(get_engine()) as s:
        try:
            if a.command == "import":
                result = service.import_bundle(s, a.bundle)
                if a.dry_run:
                    s.rollback()
                    result["dry_run"] = True
                else:
                    s.commit()
            else:
                actor = s.exec(
                    select(Learner).where(Learner.email == a.actor_email)
                ).first()
                if (
                    actor is None
                    or not actor.is_active
                    or "labor-market:review" not in actor.permissions
                ):
                    raise ValueError(
                        "An active authorized reviewer account is required."
                    )
                if a.command == "review":
                    row = service.decide(
                        s,
                        a.mapping_id,
                        ReviewInput(
                            decision=a.decision,
                            expected_decision=a.expected,
                            note=a.note,
                        ),
                        actor,
                    )
                    result = dict(id=row.id, decision=row.decision)
                else:
                    if len(a.note) < 5:
                        raise ValueError(
                            "Provide an audit note of at least 5 characters."
                        )
                    row = service.set_dataset_status(
                        s, a.dataset_id, a.status, a.note, actor
                    )
                    result = dict(id=row.id, status=row.status)
                s.commit()
            print(json.dumps(result, indent=2))
        except Exception as ex:
            s.rollback()
            print(str(ex), file=sys.stderr)
            raise SystemExit(1)


if __name__ == "__main__":
    main()
