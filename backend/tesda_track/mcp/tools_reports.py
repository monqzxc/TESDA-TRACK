"""The one tool that reports on TESDA-TRACK learners' activity: distinct learners per qualification for a completed
calendar quarter, with every count under five hidden."""
from datetime import datetime
from typing import Annotated

from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from tesda_track.mcp.deps import open_session
from tesda_track.mcp.schemas import DemandOutput, DemandRow
from tesda_track.mcp.tools_catalog import READ_ONLY
from tesda_track.services import reports
from tesda_track.services.match_stats import PHILIPPINE_TIME

COUNTS = {"top_matched": "learners_top_matched", "chose": "learners_chose",
          "checked_readiness": "learners_checked_readiness", "applied": "learners_applied",
          "competent": "learners_competent", "certified": "learners_certified"}


def _published(row) -> DemandRow | None:
    counts, hidden = reports.hide_small_counts({field: getattr(row, name) for name, field in COUNTS.items()})
    if not any(counts.values()):
        return None
    average = row.average_readiness if counts["learners_checked_readiness"] else None
    return DemandRow(qualification=row.qualification, average_readiness=average, hidden=hidden, **counts)


def register(server: MCPServer, app: FastAPI) -> None:
    @server.tool(annotations=READ_ONLY)
    def get_qualification_demand(
        quarter: Annotated[str, Field(pattern=r"^[0-9]{4}-Q[1-4]$",
                                      description="A completed calendar quarter, e.g. 2026-Q3.")],
        qualification_code: Annotated[str | None, Field(
            description="Only this qualification, e.g. SMAW-NC-II.")] = None,
    ) -> DemandOutput:
        """How many distinct learners matched, chose, checked readiness for, applied to assess in, and were found
        competent or certified in each qualification during one completed calendar quarter. Counts of 1 to 4 are
        hidden (null, named in hidden) to protect learners. Only whole, finished quarters can be asked for, so that
        no two answers can be subtracted to recover a hidden count."""
        try:
            period = reports.quarter_range(quarter)
        except ValueError:
            raise ToolError("A quarter looks like 2026-Q3.") from None
        if period.date_to >= datetime.now(PHILIPPINE_TIME).date():
            raise ToolError("Only completed quarters are available.")
        with open_session(app) as session:
            demand = reports.qualification_demand_by_learners(session, period)
        rows = [row for row in map(_published, demand)
                if row is not None and qualification_code in (None, row.qualification.code)]
        return DemandOutput(quarter=quarter, date_from=period.date_from, date_to=period.date_to, rows=rows)
