"""Anonymous per-day counters for goal matching. Only totals are kept: no text, hash, learner or address."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from tesda_track.models import MatchDailyStat

PHILIPPINE_TIME = timezone(timedelta(hours=8))


def record(session: Session, *, no_match: bool) -> None:
    """Add one request to today's totals. A single upsert statement, so concurrent requests never lose a count."""
    statement = insert(MatchDailyStat).values(date=datetime.now(PHILIPPINE_TIME).date(), requests=1,
                                              no_match=int(no_match))
    session.execute(statement.on_conflict_do_update(
        index_elements=[MatchDailyStat.date],
        set_={"requests": MatchDailyStat.requests + 1, "no_match": MatchDailyStat.no_match + int(no_match)}))
    session.commit()
