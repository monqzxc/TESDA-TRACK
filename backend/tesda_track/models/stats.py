"""Anonymous usage counters: per-day totals only, never anything a learner typed."""
import datetime as dt

from sqlmodel import Field, SQLModel


class MatchDailyStat(SQLModel, table=True):
    """How many goal-matching requests a day had and how many found no match (Philippine-time date)."""
    __tablename__ = "match_daily_stat"

    date: dt.date = Field(primary_key=True)
    requests: int = 0
    no_match: int = 0
