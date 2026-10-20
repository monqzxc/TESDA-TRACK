"""The one tool that reports on TESDA-TRACK learners' activity: distinct learners per qualification for a completed
calendar quarter, with every count under five hidden."""
from datetime import datetime
from typing import Annotated

from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from tesda_track.mcp.deps import open_session
from tesda_track.mcp.schemas import DemandOutput, DemandRow
from tesda_track.models import McpDemandSnapshot
from tesda_track.mcp.tools_catalog import READ_ONLY
from tesda_track.services import official_codes, reports
from tesda_track.config import get_settings
from tesda_track.services.match_stats import PHILIPPINE_TIME

COUNTS = {"top_matched": "learners_top_matched", "chose": "learners_chose",
          "checked_readiness": "learners_checked_readiness", "applied": "learners_applied",
          "competent": "learners_competent", "certified": "learners_certified"}


def _published(row) -> DemandRow | None:
    counts, hidden = reports.hide_small_counts({field: getattr(row, name) for name, field in COUNTS.items()})
    if not any(counts.values()):
        return None
    if counts["learners_applied"] and counts["learners_competent"] is not None             and 0 < counts["learners_applied"] - counts["learners_competent"] < reports.MIN_PUBLISHED_COUNT:
        # competent is part of applied: showing both would give away the 1 to 4 who applied and were not competent
        counts["learners_competent"] = None
        hidden = sorted([*hidden, "learners_competent"])
    average = row.average_readiness if counts["learners_checked_readiness"] else None
    return DemandRow(qualification=row.qualification, average_readiness=average, hidden=hidden, **counts)


def _snapshot(session: Session, quarter: str) -> list[dict]:
    """The quarter's published rows, fixed when first asked for. Concurrent first requests end up with one stored
    set, because the insert keeps the first and everyone reads it back."""
    stored = session.get(McpDemandSnapshot, quarter)
    if stored is None:
        demand = reports.qualification_demand_by_learners(session, reports.quarter_range(quarter))
        rows = [row.model_dump(mode="json") for row in map(_published, demand) if row is not None]
        session.execute(insert(McpDemandSnapshot).values(quarter=quarter, rows=rows).on_conflict_do_nothing(
            index_elements=["quarter"]))
        session.commit()
        session.expire_all()
        stored = session.get(McpDemandSnapshot, quarter)
    return stored.rows


def register(server: MCPServer, app: FastAPI) -> None:
    @server.tool(annotations=READ_ONLY)
    def get_qualification_demand(
        quarter: Annotated[str, Field(pattern=r"^[0-9]{4}-Q[1-4]$",
                                      description="A completed calendar quarter, e.g. 2026-Q3.")],
        qualification_code: Annotated[str | None, Field(
            description="Only this qualification, e.g. SMAW-NC-II, or TESDA's official code; an official code that covers several "
            "qualifications gives all of them, and one that maps to no active qualification gives an empty list.")] = None,
    ) -> DemandOutput:
        """How many distinct learners matched, chose, checked readiness for, applied to assess in, and were found
        competent or certified in each qualification during one completed calendar quarter. Counts of 1 to 4 are
        hidden (null, named in hidden) to protect learners, and so is a count that the others would give away by
        subtraction. Only whole, finished quarters can be asked for, and a quarter's figures are fixed when it is
        first requested after it ends, so that no two answers can be compared to recover a hidden count. Quarters
        before the pilot began (2025-Q1 unless configured otherwise) are not available."""
        try:
            period = reports.quarter_range(quarter)
        except ValueError:
            raise ToolError("A quarter looks like 2026-Q3.") from None
        earliest = get_settings().mcp_demand_earliest_quarter
        if quarter < earliest:
            raise ToolError(f"Quarters before {earliest} are not available.")
        if period.date_to >= datetime.now(PHILIPPINE_TIME).date():
            raise ToolError("Only completed quarters are available.")
        with open_session(app) as session:
            stored = _snapshot(session, quarter)
            wanted = None
            if qualification_code:
                # frozen rows keep codes of qualifications since archived, so an unresolved code is matched as typed
                wanted = {qualification.code for qualification, _ in
                          official_codes.resolve_code(session, qualification_code)} or {qualification_code}
        rows = [DemandRow.model_validate(row) for row in stored
                if wanted is None or row["qualification"]["code"] in wanted]
        return DemandOutput(quarter=quarter, date_from=period.date_from, date_to=period.date_to, rows=rows)
