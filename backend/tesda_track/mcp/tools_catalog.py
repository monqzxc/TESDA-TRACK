"""Catalog tools: one qualification in full, training programs, and training and assessment supply per region."""
import difflib
from typing import Annotated

from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlmodel import Session

from tesda_track.mcp.deps import open_session
from tesda_track.mcp.schemas import LevelRef, OfficialCodeRef, ProgramPage, QualificationDetail, RegionalSupply
from tesda_track.schemas.delivery import DeliveryMode, ProgramSearch
from tesda_track.services import catalog, official_codes, reports, sites, training
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.goal_rules import level_of

UNKNOWN_CODE = "No active qualification has that code. get_qualification finds one by title."
READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False)


def _closest_titles(asked: str, items: tuple[CatalogItem, ...]) -> str:
    """Catalog titles only: what the caller typed never goes into the message (the SDK logs it)."""
    keys = {}
    for item in items:
        keys.setdefault(item.summary.name.casefold(), item.summary.name)
        keys.setdefault(item.code.casefold(), item.summary.name)
    close = difflib.get_close_matches(asked.strip().casefold(), list(keys), n=5, cutoff=0.4)
    titles = list(dict.fromkeys(keys[key] for key in close))
    return f"Closest titles: {'; '.join(titles)}." if titles else "No close titles."


def resolve_item(session: Session, code: str, items: tuple[CatalogItem, ...], unknown: str) -> CatalogItem:
    """The one active qualification a TESDA-TRACK or official TESDA code stands for. The messages hold only fixed
    text, our own codes, and an official code that was found in the crosswalk, never what else the caller typed."""
    found = official_codes.resolve_code(session, code)
    if not found:
        raise ToolError(unknown)
    if len(found) > 1:
        names = ", ".join(qualification.code for qualification, _ in found)
        raise ToolError(f"Official code {code.strip().upper()} covers several TESDA-TRACK qualifications; "
                        f"choose one: {names}.")
    return next(item for item in items if item.code == found[0][0].code)


def _other_levels(item: CatalogItem, items: tuple[CatalogItem, ...]) -> list[LevelRef]:
    parsed = level_of(item.summary.name)
    if parsed is None:
        return []
    levels = []
    for other in items:
        found = level_of(other.summary.name)
        if found and found[0] == parsed[0]:
            levels.append(LevelRef(code=other.code, name=other.summary.name, level=found[1]))
    return sorted(levels, key=lambda level: (level.level, level.code))


def _unknown_region(codes: list[str]) -> ToolError:
    return ToolError(f"Unknown region_code. Valid codes: {', '.join(codes)}.")


def register(server: MCPServer, app: FastAPI) -> None:
    @server.tool(annotations=READ_ONLY)
    def get_qualification(
        code: Annotated[str | None, Field(description="The qualification's code, e.g. SMAW-NC-II, or TESDA's official code, e.g. MEEEAW206.")] = None,
        title: Annotated[str | None, Field(
            description="Its full title in any letter case, e.g. Shielded Metal Arc Welding (SMAW) NC II. "
                        "Give either code or title.")] = None,
    ) -> QualificationDetail:
        """One TESDA qualification in full: its sector, the jobs it leads to, its competencies, and the other NC
        levels of the same trade."""
        if bool(code) == bool(title):
            raise ToolError("Give exactly one of code or title.")
        with open_session(app) as session:
            items = catalog.snapshot(session).items
            unknown = "No active qualification has that code or title. " + _closest_titles(code or title, items)
            if code:
                item = resolve_item(session, code, items, unknown)
            else:
                wanted = title.strip().casefold()
                item = next((item for item in items if item.summary.name.casefold() == wanted), None)
                if item is None:
                    raise ToolError(unknown)
            official = [OfficialCodeRef(code=link.official_code, relation=link.relation, promulgated=link.promulgated,
                                        enabled_in_t2mis=link.enabled_in_t2mis)
                        for link in official_codes.official_codes_of(session, item.id)]
        return QualificationDetail(qualification=item.summary, possible_jobs=item.public.possible_jobs,
                                   competencies=item.public.competencies, other_levels=_other_levels(item, items),
                                   official_codes=official)

    @server.tool(annotations=READ_ONLY)
    def search_training_programs(
        qualification_code: Annotated[str | None, Field(
            description="Only programs for this qualification code, e.g. SMAW-NC-II, or TESDA's official code.")] = None,
        region_code: Annotated[str | None, Field(
            description="Only programs whose provider is in this region, e.g. NCR or VII.")] = None,
        provider_id: Annotated[int | None, Field(
            description="Only this training provider's programs; the id is in each program's provider.")] = None,
        delivery_mode: Annotated[DeliveryMode | None, Field(description="Only programs delivered this way.")] = None,
        scholarship_only: Annotated[bool, Field(description="Only programs that offer a scholarship.")] = False,
        near_lat: Annotated[float | None, Field(
            ge=-90, le=90, description="Latitude to sort by distance from; used rounded to 0.1 degree.")] = None,
        near_lon: Annotated[float | None, Field(
            ge=-180, le=180, description="Longitude to sort by distance from; used rounded to 0.1 degree.")] = None,
        radius_km: Annotated[float | None, Field(
            gt=0, le=2000, description="Leave out programs farther than this from near_lat/near_lon.")] = None,
        limit: Annotated[int, Field(ge=1, le=100, description="Programs per page.")] = 20,
        offset: Annotated[int, Field(ge=0, description="Programs to skip: the next_offset of the page before.")] = 0,
    ) -> ProgramPage:
        """Active TESDA training programs for a qualification, region or provider, with their verification and
        availability, nearest first when a point is given. Give at least one of qualification_code, region_code or
        provider_id."""
        if not (qualification_code or region_code or provider_id is not None):
            raise ToolError("Give a qualification_code, region_code or provider_id.")
        if (near_lat is None) != (near_lon is None):
            raise ToolError("Give both near_lat and near_lon, or neither.")
        if radius_km is not None and near_lat is None:
            raise ToolError("radius_km needs near_lat and near_lon.")
        with open_session(app) as session:
            if qualification_code:
                qualification_code = resolve_item(session, qualification_code, catalog.snapshot(session).items,
                                                  UNKNOWN_CODE).code
            if region_code:
                codes = [region.code for region in sites.regions(session)]
                if region_code not in codes:
                    raise _unknown_region(codes)
            search = ProgramSearch(
                qualification_code=qualification_code or None, region_code=region_code or None,
                provider_id=provider_id, delivery_mode=delivery_mode, scholarship_only=scholarship_only,
                near_lat=round(near_lat, 1) if near_lat is not None else None,
                near_lon=round(near_lon, 1) if near_lon is not None else None,
                radius_km=radius_km, limit=limit, offset=offset)
            rows = training.search_programs(session, search)
            programs = [training.program_public(program, distance) for program, distance in rows]
        return ProgramPage(programs=programs, next_offset=offset + limit if len(rows) == limit else None)

    @server.tool(annotations=READ_ONLY)
    def get_regional_supply(
        region_code: Annotated[str | None, Field(
            description="One region's code, e.g. NCR or VII; leave it out for every region.")] = None,
    ) -> RegionalSupply:
        """Training and assessment capacity per Philippine region right now: active training providers and
        programs, upcoming assessment schedules and their open seats."""
        with open_session(app) as session:
            rows = reports.supply(session)
        if region_code:
            selected = [row for row in rows if row.region_code == region_code]
            if not selected:
                raise _unknown_region([row.region_code for row in rows])
            rows = selected
        return RegionalSupply(regions=rows)
