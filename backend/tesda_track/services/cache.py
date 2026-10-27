"""A small time-limited cache in PostgreSQL, for responses from outside services. No Redis needed."""
import logging
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import timedelta
from typing import Any

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from tesda_track.models import CacheEntry, utcnow

logger = logging.getLogger("tesda_track")


def get(session: Session, key: str) -> Any | None:
    entry = session.get(CacheEntry, key)
    if entry is None or entry.expires_at <= utcnow():
        return None
    return entry.value


def put(session: Session, key: str, value: Any, ttl_seconds: int) -> None:
    expires_at = utcnow() + timedelta(seconds=ttl_seconds)
    statement = insert(CacheEntry).values(key=key, value=value, expires_at=expires_at, created_at=utcnow())
    session.exec(statement.on_conflict_do_update(index_elements=[CacheEntry.key],
                                                 set_={"value": value, "expires_at": expires_at}))
    session.expire_all()


def get_or_set(session: Session, key: str, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
    value = get(session, key)
    if value is None:
        value = loader()
        put(session, key, value, ttl_seconds)
    return value


def purge_expired(session: Session) -> int:
    return session.exec(delete(CacheEntry).where(CacheEntry.expires_at <= utcnow())).rowcount


def purge_until_stopped(open_session: Callable[[], AbstractContextManager[Session]], stop: threading.Event,
                        interval_seconds: float) -> None:
    """Delete expired entries every interval until `stop` is set. Entries can hold terms sent to Skills Bridge,
    so they are deleted once expired rather than only ignored."""
    while not stop.wait(interval_seconds):
        try:
            with open_session() as session:
                purge_expired(session)
                session.commit()
        except Exception:  # A database outage must not end the loop.
            logger.exception("Could not purge expired cache entries")
