"""The MCP call log: one row per request with shapes only, folded into daily counts after the retention period."""
import logging
import threading
import uuid
from collections import defaultdict
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta, timezone

from sqlalchemy import cast, delete, func, literal, select as core_select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.types import Date
from sqlmodel import Session, select

from tesda_track.models import NO_CLIENT, ApiClient, McpCallDaily, McpCallLog
from tesda_track.schemas.mcp_usage import ClientUsage, DayUsage, ToolUsage, UsageReport
from tesda_track.schemas.reports import DateRange

logger = logging.getLogger("tesda_track")
PHILIPPINE_TIME = "Asia/Manila"
PHILIPPINE_OFFSET = timezone(timedelta(hours=8))
FOLD_LOCK = 4_120_001  # one fold at a time across the hourly thread and the CLI
LATENCY_OUTCOMES = ("ok", "tool_error")  # refused calls return in no time and would drag the percentiles down
DEEP_PAGING_OFFSET = 200
DEEP_PAGING_TOOL = "search_training_programs"


def record_call(session: Session, **fields) -> None:
    """Add one row to the log, best effort: a logging problem must never break a partner's call.

    Failures are logged by exception type only, since a message could hold what the partner sent.
    """
    try:
        with session.begin_nested():
            session.add(McpCallLog(**fields))
        session.commit()
    except Exception as error:
        logger.warning("Could not log an MCP call (%s).", type(error).__name__)


def _day(column):
    return cast(func.timezone(PHILIPPINE_TIME, column), Date)


def fold_old_rows(session: Session, retention_days: int, now: datetime | None = None) -> int:
    """Move calls older than the retention period into the daily counts. Returns the rows folded."""
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": FOLD_LOCK})
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=retention_days)
    old = McpCallLog.called_at < cutoff
    day = _day(McpCallLog.called_at)
    client = func.coalesce(McpCallLog.client_id, literal(NO_CLIENT))
    tool = func.coalesce(McpCallLog.tool, "")
    counted = (core_select(day, client, tool, McpCallLog.outcome, func.count())
               .where(old).group_by(day, client, tool, McpCallLog.outcome))
    statement = insert(McpCallDaily).from_select(["date", "client_id", "tool", "outcome", "calls"], counted)
    session.execute(statement.on_conflict_do_update(
        index_elements=["date", "client_id", "tool", "outcome"],
        set_={"calls": McpCallDaily.calls + statement.excluded.calls}))
    folded = session.execute(delete(McpCallLog).where(old)).rowcount
    session.flush()
    return folded


def fold_until_stopped(open_session: Callable[[], AbstractContextManager[Session]], stop: threading.Event,
                       interval_seconds: float, retention_days: int) -> None:
    """Fold old calls every interval until `stop` is set."""
    while not stop.wait(interval_seconds):
        try:
            with open_session() as session:
                fold_old_rows(session, retention_days)
                session.commit()
        except Exception:  # A database outage must not end the loop.
            logger.exception("Could not fold old MCP calls")


def _in_period(column, period: DateRange) -> list:
    conditions = []
    if period.date_from:
        conditions.append(column >= period.date_from)
    if period.date_to:
        conditions.append(column <= period.date_to)
    return conditions


def usage_report(session: Session, period: DateRange) -> UsageReport:
    """Per client: calls by outcome, per tool and per day, and how far they stray from what they declared.
    Folded daily counts add to the totals; latency comes from the detailed rows only."""
    day = _day(McpCallLog.called_at)
    detail_where = _in_period(day, period)
    # The same bounds on the bare column let the index on called_at serve the query.
    if period.date_from:
        detail_where.append(McpCallLog.called_at >= datetime.combine(period.date_from, datetime.min.time(),
                                                                     PHILIPPINE_OFFSET))
    if period.date_to:
        detail_where.append(McpCallLog.called_at < datetime.combine(period.date_to + timedelta(days=1),
                                                                    datetime.min.time(), PHILIPPINE_OFFSET))
    client = func.coalesce(McpCallLog.client_id, literal(NO_CLIENT))
    tool = func.coalesce(McpCallLog.tool, "")
    counts: dict[tuple, int] = defaultdict(int)  # (client, tool, outcome, day) -> calls
    for client_id, tool_name, outcome, when, calls in session.execute(
            core_select(client, tool, McpCallLog.outcome, day, func.count()).where(*detail_where)
            .group_by(client, tool, McpCallLog.outcome, day)):
        counts[(client_id, tool_name, outcome, when)] += calls
    for row in session.exec(select(McpCallDaily).where(*_in_period(McpCallDaily.date, period))):
        counts[(row.client_id, row.tool, row.outcome, row.date)] += row.calls

    latency: dict[tuple, tuple[int, int]] = {}
    for client_id, tool_name, p50, p95 in session.execute(
            core_select(client, tool,
                        func.percentile_cont(0.5).within_group(McpCallLog.latency_ms),
                        func.percentile_cont(0.95).within_group(McpCallLog.latency_ms))
            .where(*detail_where, McpCallLog.outcome.in_(LATENCY_OUTCOMES)).group_by(client, tool)):
        latency[(client_id, tool_name)] = (round(p50), round(p95))

    deep_paging: dict[uuid.UUID, int] = defaultdict(int)
    for client_id, calls in session.execute(
            core_select(client, func.count())
            .where(*detail_where, McpCallLog.tool == DEEP_PAGING_TOOL, McpCallLog.page_offset >= DEEP_PAGING_OFFSET)
            .group_by(client)):
        deep_paging[client_id] = calls

    clients = []
    for api_client in session.exec(select(ApiClient).order_by(ApiClient.name)):
        by_outcome: dict[str, int] = defaultdict(int)
        by_tool: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        by_day: dict = defaultdict(int)
        for (client_id, tool_name, outcome, when), calls in counts.items():
            if client_id != api_client.id:
                continue
            by_outcome[outcome] += calls
            by_day[when] += calls
            if tool_name:
                by_tool[tool_name][outcome] += calls
        expected = set(api_client.expected_tools)
        tools = []
        for tool_name, outcomes in sorted(by_tool.items()):
            p50, p95 = latency.get((api_client.id, tool_name), (None, None))
            tools.append(ToolUsage(tool=tool_name, calls=sum(outcomes.values()), ok=outcomes["ok"],
                                   tool_error=outcomes["tool_error"], denied_scope=outcomes["denied_scope"],
                                   rate_limited=outcomes["rate_limited"], p50_ms=p50, p95_ms=p95,
                                   expected=tool_name in expected))
        clients.append(ClientUsage(
            client_id=api_client.id, name=api_client.name, organisation=api_client.organisation,
            declared_purpose=api_client.declared_purpose, expected_tools=api_client.expected_tools,
            scopes=api_client.scopes, is_active=api_client.is_active, calls=sum(by_outcome.values()),
            by_outcome=dict(by_outcome), tools=tools,
            days=[DayUsage(date=when, calls=calls) for when, calls in sorted(by_day.items())],
            unexpected_tool_calls=sum(tool.calls for tool in tools if not tool.expected),
            deep_paging_calls=deep_paging[api_client.id]))
    unattributed = sum(calls for (client_id, _, outcome, _), calls in counts.items()
                       if client_id == NO_CLIENT and outcome == "denied_token")
    return UsageReport(clients=clients, unattributed_denials=unattributed)
