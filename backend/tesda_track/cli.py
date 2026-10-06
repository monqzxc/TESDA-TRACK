"""Administrative commands.

    python -m tesda_track.cli create-admin --email admin@example.com --name "Pilot Admin"

The password is read from TESDA_ADMIN_PASSWORD or prompted for. Promoting an existing account keeps
its password unless a new one is given.
"""
import argparse
import getpass
import os
import sys

from sqlmodel import Session

from tesda_track.models import Learner, utcnow
from tesda_track.security import hash_password
from tesda_track.services.accounts import find_by_email, normalize_email

MIN_PASSWORD_LENGTH = 10


def create_or_promote_admin(session: Session, email: str, full_name: str, password: str | None) -> Learner:
    if password is not None and len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Passwords need at least {MIN_PASSWORD_LENGTH} characters.")
    learner = find_by_email(session, email)
    if learner is None:
        if password is None:
            raise ValueError("A password is required to create a new admin account.")
        learner = Learner(email=normalize_email(email), full_name=full_name, password_hash=hash_password(password),
                          privacy_consent_at=utcnow())
    elif password is not None:
        learner.password_hash = hash_password(password)
        learner.token_version += 1
    learner.role = "admin"
    learner.is_active = True
    session.add(learner)
    return learner


def main() -> None:
    from tesda_track.db import get_engine

    parser = argparse.ArgumentParser(description="TESDA-TRACK administration")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="create an admin account or promote an existing one")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", default="Administrator")
    admin.add_argument("--keep-password", action="store_true", help="promote an existing account without a new password")
    args = parser.parse_args()

    password = None
    if not args.keep_password:
        password = os.environ.get("TESDA_ADMIN_PASSWORD") or getpass.getpass("Password: ")
        if not os.environ.get("TESDA_ADMIN_PASSWORD") and getpass.getpass("Repeat password: ") != password:
            sys.exit("Passwords did not match.")
    with Session(get_engine()) as session:
        try:
            learner = create_or_promote_admin(session, args.email, args.name, password)
        except ValueError as error:
            sys.exit(str(error))
        session.commit()
        print(f"{learner.email} is now an administrator.")


if __name__ == "__main__":
    main()
