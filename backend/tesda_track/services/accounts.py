"""Registration, sign-in with lockout, password changes, data export and account erasure."""
from datetime import timedelta

from sqlmodel import Session, select

from tesda_track.config import Settings
from tesda_track.errors import AuthenticationError, ConflictError, InvalidRequestError, TooManyAttemptsError
from tesda_track.models import Learner, utcnow
from tesda_track.schemas.accounts import LearnerPublic, RegisterRequest
from tesda_track.schemas.records import AccountExport
from tesda_track.security import burn_verification_time, hash_password, verify_password
from tesda_track.services import certifications, goals, readiness_checks, recommendation_sessions


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_by_email(session: Session, email: str) -> Learner | None:
    return session.exec(select(Learner).where(Learner.email == normalize_email(email))).first()


def register(session: Session, request: RegisterRequest) -> Learner:
    if not request.privacy_consent:
        raise InvalidRequestError("You must agree to the privacy notice to create an account.")
    if find_by_email(session, request.email):
        raise ConflictError("An account with this email already exists.")
    learner = Learner(email=normalize_email(request.email), password_hash=hash_password(request.password),
                      full_name=request.full_name, privacy_consent_at=utcnow())
    session.add(learner)
    session.flush()
    return learner


def authenticate(session: Session, email: str, password: str, settings: Settings) -> Learner:
    """Commits failure counters itself, because the request ends in an error response."""
    learner = find_by_email(session, email)
    if learner is None:
        burn_verification_time(password)
        raise AuthenticationError()
    now = utcnow()
    if learner.locked_until and learner.locked_until > now:
        raise TooManyAttemptsError(
            f"Too many failed sign-in attempts. Try again in {settings.login_lockout_minutes} minutes.")
    valid, new_hash = verify_password(password, learner.password_hash)
    if not valid:
        learner.failed_login_attempts += 1
        if learner.failed_login_attempts >= settings.login_max_attempts:
            learner.failed_login_attempts = 0
            learner.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
        session.commit()
        raise AuthenticationError()
    if not learner.is_active:
        raise AuthenticationError()
    learner.failed_login_attempts = 0
    learner.locked_until = None
    if new_hash:
        learner.password_hash = new_hash
    session.commit()
    return learner


def change_password(session: Session, learner: Learner, current_password: str, new_password: str) -> None:
    valid, _ = verify_password(current_password, learner.password_hash)
    if not valid:
        raise InvalidRequestError("Your current password is incorrect.")
    learner.password_hash = hash_password(new_password)
    learner.token_version += 1
    session.flush()


def delete_account(session: Session, learner: Learner) -> None:
    session.delete(learner)  # the database cascades to every record the learner owns
    session.flush()


def export(session: Session, learner: Learner) -> AccountExport:
    return AccountExport(
        exported_at=utcnow(), account=LearnerPublic.model_validate(learner),
        goals=[goals.to_public(g) for g in goals.list_for(session, learner)],
        recommendation_sessions=[recommendation_sessions.to_public(s)
                                 for s in recommendation_sessions.list_for(session, learner, limit=10_000, offset=0)],
        readiness_checks=[readiness_checks.to_public(c) for c in readiness_checks.list_for(session, learner, None)],
        certifications=[certifications.to_public(c) for c in certifications.list_for(session, learner)])
