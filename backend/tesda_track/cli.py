"""Administrative commands.

    python -m tesda_track.cli create-admin --email admin@example.com --name "Pilot Admin"
    python -m tesda_track.cli openapi frontend/openapi.json

The password is read from TESDA_ADMIN_PASSWORD or prompted for. Promoting an existing account keeps
its password unless a new one is given. `openapi` writes the API's schema without a database, for the
web app's generated types (`npm run api:types` in frontend/).

    python -m tesda_track.cli mcp-client create --name TSP --organisation "TESDA Skill Passport" --purpose "..."
        --scopes catalog:read recommend:run --expected-tools match_qualifications get_qualification
    python -m tesda_track.cli mcp-client rotate|revoke --client-id <uuid>
    python -m tesda_track.cli mcp-client list
    python -m tesda_track.cli mcp-usage fold [--days 180]

`mcp-client` manages the outside systems that call the MCP server; a new secret is printed once.
"""
import argparse
import getpass
import json
import os
import sys
import uuid
from pathlib import Path
from typing import TextIO

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from tesda_track.models import Learner, utcnow
from tesda_track.errors import ConflictError, DomainError
from tesda_track.security import hash_password
from tesda_track.services import mcp_usage, partner_clients
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


def write_openapi_schema(path: Path) -> None:
    """The schema served at /api/openapi.json, in a stable layout with LF line endings."""
    from tesda_track.main import create_app

    schema = create_app().openapi()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def run_mcp_client_command(session: Session, args: argparse.Namespace, out: TextIO) -> None:
    """Runs one `mcp-client` subcommand. The caller commits."""
    def show_secret(client, secret):
        session.flush()
        print(f"client_id {client.id}", file=out)
        print(f"client_secret {secret}", file=out)
        print("Store the secret now; it can't be shown again.", file=out)

    if args.action == "create":
        client, secret = partner_clients.create_client(
            session, name=args.name, organisation=args.organisation, declared_purpose=args.purpose,
            scopes=args.scopes, expected_tools=args.expected_tools, contact_email=args.contact_email,
            rate_limit_per_minute=args.rate_limit)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            raise ConflictError(f"A client named {args.name} already exists.") from None
        show_secret(client, secret)
    elif args.action == "rotate":
        show_secret(*partner_clients.rotate_secret(session, uuid.UUID(args.client_id)))
    elif args.action == "revoke":
        client = partner_clients.revoke_client(session, uuid.UUID(args.client_id))
        print(f"{client.name} ({client.id}) is revoked.", file=out)
    else:
        for client in partner_clients.list_clients(session):
            state = "active" if client.is_active else "revoked"
            print(f"{client.id}  {client.name}  {state}  scopes={' '.join(client.scopes)}  "
                  f"limit={client.rate_limit_per_minute}/min  last_token={client.last_token_at or 'never'}", file=out)


def run_mcp_usage_command(session: Session, args: argparse.Namespace, out: TextIO) -> None:
    """Runs one `mcp-usage` subcommand. The caller commits."""
    from tesda_track.config import get_settings

    days = args.days if args.days is not None else get_settings().mcp_call_log_retention_days
    print(f"Folded {mcp_usage.fold_old_rows(session, days)} MCP calls older than {days} days into daily counts.",
          file=out)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="TESDA-TRACK administration")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="create an admin account or promote an existing one")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", default="Administrator")
    admin.add_argument("--keep-password", action="store_true", help="promote an existing account without a new password")
    openapi = commands.add_parser("openapi", help="write the API's OpenAPI schema to a file (no database needed)")
    openapi.add_argument("path", type=Path)
    mcp_client = commands.add_parser("mcp-client", help="manage the outside systems that call the MCP server")
    actions = mcp_client.add_subparsers(dest="action", required=True)
    create = actions.add_parser("create", help="register a client and print its secret once")
    create.add_argument("--name", required=True)
    create.add_argument("--organisation", required=True)
    create.add_argument("--purpose", required=True, help="what the system will use the tools for")
    create.add_argument("--scopes", nargs="+", required=True, choices=partner_clients.SCOPES)
    create.add_argument("--expected-tools", nargs="+", required=True)
    create.add_argument("--contact-email")
    create.add_argument("--rate-limit", type=int, default=120, help="calls per minute across all tools")
    for action, text in (("rotate", "issue a new secret; the old one and its tokens stop working"),
                         ("revoke", "stop a client and its tokens")):
        actions.add_parser(action, help=text).add_argument("--client-id", required=True)
    actions.add_parser("list", help="show clients (never secrets)")
    mcp_usage_parser = commands.add_parser("mcp-usage", help="keep the MCP call log within its retention period")
    usage_actions = mcp_usage_parser.add_subparsers(dest="action", required=True)
    fold = usage_actions.add_parser("fold", help="fold old calls into daily counts (the server also does this hourly)")
    fold.add_argument("--days", type=int, help="fold calls older than this; default MCP_CALL_LOG_RETENTION_DAYS")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.command == "openapi":
        # The schema doesn't depend on the database or the secret key, so placeholders do when none are set.
        os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused@127.0.0.1:1/unused")
        os.environ.setdefault("SECRET_KEY", "placeholder-for-writing-the-openapi-schema-only")
        write_openapi_schema(args.path)
        return

    from tesda_track.db import get_engine

    if args.command in ("mcp-client", "mcp-usage"):
        run = run_mcp_client_command if args.command == "mcp-client" else run_mcp_usage_command
        with Session(get_engine()) as session:
            try:
                run(session, args, sys.stdout)
            except (DomainError, ValueError) as error:
                sys.exit(getattr(error, "detail", str(error)))
            session.commit()
        return

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
