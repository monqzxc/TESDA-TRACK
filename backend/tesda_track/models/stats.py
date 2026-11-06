"""Anonymous usage counters: per-day totals only, never anything a learner typed."""
import datetime as dt

from sqlalchemy import CheckConstraint, String
from sqlmodel import Field, SQLModel

from tesda_track.models.base import one_of

# Where a goal entered in the TSP webview came from: typed there, or a tapped suggestion from the learner's TSP
# profile. Only the webview sends it, so these counters are the webview's funnel; the main finder isn't counted.
GOAL_ORIGINS = ("typed", "suggestion")
# Steps counted per origin. A suggestion list counts once per request that had skills to work from, shown when it
# held at least one qualification and empty otherwise; both are counted under the "suggestion" origin.
FUNNEL_EVENTS = ("suggestions_shown", "suggestions_empty", "goal_started", "readiness_checked")


class MatchDailyStat(SQLModel, table=True):
    """How many goal-matching requests a day had and how many found no match (Philippine-time date)."""
    __tablename__ = "match_daily_stat"

    date: dt.date = Field(primary_key=True)
    requests: int = 0
    no_match: int = 0


class FunnelDailyStat(SQLModel, table=True):
    """How many times a day each step of the TSP webview happened, by where the goal came from (Philippine time).

    Suggestions shown against goals started from a suggestion is how often learners take one; goals started against
    readiness checks, by origin, is how far each kind of goal gets. Totals only: no text, learner or address."""
    __tablename__ = "funnel_daily_stat"
    __table_args__ = (CheckConstraint(one_of("origin", GOAL_ORIGINS), name="origin_valid"),
                      CheckConstraint(one_of("event", FUNNEL_EVENTS), name="event_valid"))

    date: dt.date = Field(primary_key=True)
    origin: str = Field(primary_key=True, sa_type=String(10))
    event: str = Field(primary_key=True, sa_type=String(30))
    count: int = 0
