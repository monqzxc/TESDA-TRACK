"""Anonymous per-day counters for goal matching. Only totals are kept: no text, hash, learner or address."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from tesda_track.db import get_engine
from tesda_track.models import FunnelDailyStat, MatchDailyStat

PHILIPPINE_TIME = timezone(timedelta(hours=8))
logger = logging.getLogger("tesda_track")


def record(*, no_match: bool) -> None:
    """Add one request to today's totals, best effort: a counter problem must never break matching.

    Runs on its own short-lived session with short timeouts. One upsert statement, so concurrent requests never
    lose a count. Failures are logged without any learner text and swallowed.
    """
    try:
        with Session(get_engine()) as session:
            session.execute(text("SET LOCAL lock_timeout = '2s'"))
            session.execute(text("SET LOCAL statement_timeout = '5s'"))
            statement = insert(MatchDailyStat).values(date=datetime.now(PHILIPPINE_TIME).date(), requests=1,
                                                      no_match=int(no_match))
            session.execute(statement.on_conflict_do_update(
                index_elements=[MatchDailyStat.date],
                set_={"requests": MatchDailyStat.requests + 1, "no_match": MatchDailyStat.no_match + int(no_match)}))
            session.commit()
    except Exception as error:
        logger.warning("Could not count a goal-matching request (%s).", type(error).__name__)


def count(event: str, origin: str) -> None:
    """Add one to today's total for a step of the goal funnel (models.stats.FUNNEL_EVENTS), by where the goal came
    from. Best effort, on its own session, like record: a counter problem never breaks the request."""
    try:
        with Session(get_engine()) as session:
            session.execute(text("SET LOCAL lock_timeout = '2s'"))
            session.execute(text("SET LOCAL statement_timeout = '5s'"))
            statement = insert(FunnelDailyStat).values(date=datetime.now(PHILIPPINE_TIME).date(), origin=origin,
                                                       event=event, count=1)
            session.execute(statement.on_conflict_do_update(
                index_elements=[FunnelDailyStat.date, FunnelDailyStat.origin, FunnelDailyStat.event],
                set_={"count": FunnelDailyStat.count + 1}))
            session.commit()
    except Exception as error:
        logger.warning("Could not count a %s step (%s).", event, type(error).__name__)
