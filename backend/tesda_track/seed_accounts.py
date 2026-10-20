"""Explicit, atomic account seeding; existing accounts are never modified."""
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session

from tesda_track.models import Learner, utcnow
from tesda_track.rbac import Role
from tesda_track.schemas.accounts import FullName, NewPassword, NormalizedEmail
from tesda_track.security import hash_password
from tesda_track.services.accounts import find_by_email


class SeedAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: NormalizedEmail
    full_name: FullName
    password: NewPassword
    role: Role


def seed_accounts(session: Session, accounts: list[SeedAccount]) -> dict[str, int]:
    if len({account.email for account in accounts}) != len(accounts):
        raise ValueError("Seed emails must be unique.")
    created = skipped = 0
    with session.begin_nested():
        for account in accounts:
            existing = find_by_email(session, account.email)
            if existing:
                if existing.role != account.role:
                    raise ValueError(f"{account.email} already exists with a different role.")
                skipped += 1
                continue
            session.add(Learner(email=account.email, full_name=account.full_name, role=account.role,
                                password_hash=hash_password(account.password), privacy_consent_at=utcnow()))
            created += 1
        session.flush()
    return {"created": created, "skipped": skipped}
