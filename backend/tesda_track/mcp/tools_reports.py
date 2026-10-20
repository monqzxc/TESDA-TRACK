"""The one tool that reports on TESDA-TRACK learners' activity: demand per qualification for a calendar quarter,
with every count under five hidden."""
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

COUNTS = ("top_match", "chosen", "readiness_checks", "assessment_applications", "competent", "certified")


def _published(row) -> DemandRow | None:
    counts, hidden = reports.hide_small_counts({name: getattr(row, name) for name in COUNTS})
    if not any(counts.values()):
        return None
    average = row.average_readiness if counts["readiness_checks"] else None
    return DemandRow(qualification=row.qualification, average_readiness=average, hidden=hidden, **counts)


def register(server: MCPServer, app: FastAPI) -> None:
    @server.tool(annotations=READ_ONLY)
    def get_qualification_demand(
        quarter: Annotated[str, Field(pattern=r"^\d{4}-Q[1-4]$", description="A calendar quarter, e.g. 2026-Q3.")],
        qualification_code: Annotated[str | None, Field(
            description="Only this qualification, e.g. SMAW-NC-II.")] = None,
    ) -> DemandOutput:
        """How many learners matched, chose, checked readiness for, applied to assess in, and were found competent
        or certified in each qualification during one calendar quarter. Counts of 1 to 4 are hidden (null, named in
        hidden) to protect learners, and only whole quarters can be asked for, so that no two windows can be
        subtracted to recover a hidden count."""
        try:
            period = reports.quarter_range(quarter)
        except ValueError:
            raise ToolError("A quarter looks like 2026-Q3.") from None
        if period.date_from > datetime.now(PHILIPPINE_TIME).date():
            raise ToolError("That quarter has not started yet.")
        with open_session(app) as session:
            demand = reports.qualification_demand(session, period)
        rows = [row for row in map(_published, demand)
                if row is not None and qualification_code in (None, row.qualification.code)]
        return DemandOutput(quarter=quarter, date_from=period.date_from, date_to=period.date_to, rows=rows)
