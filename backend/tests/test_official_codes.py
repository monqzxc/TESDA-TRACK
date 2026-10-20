"""TESDA's official qualification codes map onto TESDA-TRACK's, and every MCP tool that takes a code accepts both."""
import json
from pathlib import Path

import pytest
from sqlmodel import select

from tesda_track.models import OfficialQualificationCode
from tesda_track.services import official_codes

BACKEND = Path(__file__).resolve().parents[1]
HEADER = "official_code,official_title,level,promulgated,enabled_in_t2mis,relation,qualification_code\n"
ROWS = [
    "MEEEAW206,Shielded Metal Arc Welding,II,2006-05-01,true,same,SMAW-NC-II",
    "CONEIM208,Electrical Installation,II,2008-01-01,true,same,EIM-NC-II",
    "ELCEIM215,Electrical Installation,II,2015-01-01,false,same,EIM-NC-II",
    "XXXCOV201,Covering,II,,true,covers,SMAW-NC-II",
    "XXXCOV201,Covering,II,,true,covers,EIM-NC-II",
    "ZZZ999,Nothing,II,,true,same,NO-SUCH-CODE",
]


@pytest.fixture
def crosswalk(tmp_path, session):
    path = tmp_path / "crosswalk.csv"
    path.write_text(HEADER + "\n".join(ROWS) + "\n", encoding="utf-8", newline="\n")
    official_codes.import_crosswalk(session, path)
    session.flush()
    return path


def text_of(result):
    return " ".join(part["text"] for part in result["content"])


def test_import_links_and_skips(session, tmp_path):
    path = tmp_path / "crosswalk.csv"
    path.write_text(HEADER + "\n".join(ROWS) + "\n", encoding="utf-8", newline="\n")
    report = official_codes.import_crosswalk(session, path)
    assert report.linked == 5 and report.skipped == ["ZZZ999"]
    before = session.exec(select(OfficialQualificationCode)).all()
    again = official_codes.import_crosswalk(session, path)
    assert again.linked == 5
    after = session.exec(select(OfficialQualificationCode)).all()
    assert len(before) == len(after) == 5
    assert {(row.official_code, row.relation) for row in after} >= {("MEEEAW206", "same"), ("XXXCOV201", "covers")}


def test_resolve_own_and_official_codes(session, crosswalk):
    assert [(q.code, r) for q, r in official_codes.resolve_code(session, "SMAW-NC-II")] == [("SMAW-NC-II", "same")]
    assert [(q.code, r) for q, r in official_codes.resolve_code(session, "CONEIM208")] == [("EIM-NC-II", "same")]
    assert [(q.code, r) for q, r in official_codes.resolve_code(session, "XXXCOV201")] == [
        ("EIM-NC-II", "covers"), ("SMAW-NC-II", "covers")]
    assert official_codes.resolve_code(session, "ZZZ999") == []
    assert official_codes.resolve_code(session, "nonsense") == []


def test_get_qualification_by_official_code(mcp, partner, crosswalk):
    result = mcp.tool(partner().headers, "get_qualification", code="CONEIM208")
    assert not result["isError"]
    found = result["structuredContent"]
    assert found["qualification"]["code"] == "EIM-NC-II"
    assert {ref["code"] for ref in found["official_codes"]} == {"CONEIM208", "ELCEIM215", "XXXCOV201"}
    by_code = {ref["code"]: ref for ref in found["official_codes"]}
    assert by_code["ELCEIM215"]["enabled_in_t2mis"] is False and by_code["CONEIM208"]["promulgated"] == "2008-01-01"


def test_official_code_works_in_recommend_and_search_tools(mcp, partner, crosswalk, make_program):
    headers = partner().headers
    make_program(qualification_code="SMAW-NC-II")
    route = mcp.tool(headers, "recommend_route", qualification_code="MEEEAW206")
    own = mcp.tool(headers, "recommend_route", qualification_code="SMAW-NC-II")
    assert not route["isError"] and route["structuredContent"] == own["structuredContent"]
    found = mcp.tool(headers, "search_training_programs", qualification_code="MEEEAW206")["structuredContent"]
    assert [p["qualification"]["code"] for p in found["programs"]] == ["SMAW-NC-II"]
    elsewhere = mcp.tool(headers, "search_training_programs", qualification_code="CONEIM208")
    assert not elsewhere["isError"] and elsewhere["structuredContent"]["programs"] == []


def test_archived_qualification_is_not_resolved(mcp, partner, session, crosswalk):
    qualification = official_codes.resolve_code(session, "CONEIM208")[0][0]
    qualification.is_active = False
    session.add(qualification)
    session.flush()
    assert official_codes.resolve_code(session, "CONEIM208") == []
    result = mcp.tool(partner().headers, "get_qualification", code="CONEIM208")
    assert result["isError"] and "No active qualification has that code or title" in text_of(result)


def test_covering_code_asks_to_choose(mcp, partner, crosswalk):
    result = mcp.tool(partner().headers, "rank_training_programs", qualification_code="XXXCOV201")
    assert result["isError"]
    assert "EIM-NC-II" in text_of(result) and "SMAW-NC-II" in text_of(result) and "XXXCOV201" in text_of(result)


def test_unknown_code_error_does_not_echo_it(mcp, partner, crosswalk):
    result = mcp.tool(partner().headers, "recommend_route", qualification_code="call me on 0917 123 4567")
    assert result["isError"] and "0917" not in text_of(result) and "No active qualification" in text_of(result)


def test_demand_filters_by_official_code(mcp, partner, crosswalk, monkeypatch):
    from tesda_track.mcp import tools_reports

    def rows(session, quarter):
        return [{"qualification": {"code": code, "name": code, "sector": "x"}, "learners_top_matched": 9,
                 "learners_chose": None, "learners_checked_readiness": None, "learners_applied": None,
                 "learners_competent": None, "learners_certified": None, "average_readiness": None, "hidden": []}
                for code in ("SMAW-NC-II", "EIM-NC-II", "CSS-NC-II")]
    monkeypatch.setattr(tools_reports, "_snapshot", rows)
    headers = partner(scopes=("reports:read",)).headers
    def codes(code):
        result = mcp.tool(headers, "get_qualification_demand", quarter="2025-Q1", qualification_code=code)
        assert not result["isError"], result
        return sorted(row["qualification"]["code"] for row in result["structuredContent"]["rows"])
    assert codes("CONEIM208") == ["EIM-NC-II"]
    assert codes("XXXCOV201") == ["EIM-NC-II", "SMAW-NC-II"]
    assert codes("SMAW-NC-II") == ["SMAW-NC-II"]
    assert codes("ZZZ999") == []


def test_real_crosswalk_parses_and_points_at_the_catalog():
    rows = official_codes.read_crosswalk(BACKEND / "seed" / "sources" / "qualification_code_crosswalk.csv")
    catalog = {item["code"] for item in json.loads((BACKEND / "seed" / "qualifications.json").read_text(encoding="utf-8"))}
    assert len(rows) == 291 and len({row["official_code"] for row in rows}) == 280
    assert {row["relation"] for row in rows} <= {"same", "covers", "superseded_by"}
    assert {row["qualification_code"] for row in rows} <= catalog
