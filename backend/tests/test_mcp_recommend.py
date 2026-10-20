"""The recommendation tools give what the REST endpoints give, attribute ranking audits to the calling client, and
never echo or keep what a partner says about a person."""
import pytest
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import MatchDailyStat, RankingAudit
from tesda_track.services.ranking import goal_fingerprint

GOAL = "I want to be a welder"


def text_of(result):
    return " ".join(part["text"] for part in result["content"])


def codes(matches):
    return [(m["qualification"]["code"], m["score"], m["reason"]) for m in matches]


def test_match_text_path_matches_rest(client, mcp, partner):
    expected = client.post("/api/v1/analysis/matches", json={"query": GOAL, "profile": {"experience_years": 2}}).json()
    result = mcp.tool(partner().headers, "match_qualifications", goal=GOAL, experience_years=2)
    assert not result["isError"]
    found = result["structuredContent"]
    assert codes(found["matches"]) == codes(expected["matches"]) and found["matches"]
    assert found["interpreted"] == expected["profile"]


def test_match_semantic_matches_rest(client, mcp, partner, semantic):
    expected = client.post("/api/v1/analysis/matches", json={"query": GOAL, "profile": {"experience_years": 2}}).json()
    result = mcp.tool(partner().headers, "match_qualifications", goal=GOAL, experience_years=2)
    assert codes(result["structuredContent"]["matches"]) == codes(expected["matches"])
    assert result["structuredContent"]["matches"][0]["components"] is not None


def test_match_structured_matches_rest(client, mcp, partner):
    answers = {"interests": ["welding"], "existing_skills": ["weld"], "experience_years": 3}
    expected = client.post("/api/v1/recommendations/qualifications",
                           json={"assessment": answers, "limit": 5}).json()
    result = mcp.tool(partner().headers, "match_qualifications", answers=answers, limit=5)
    assert not result["isError"]
    assert codes(result["structuredContent"]["matches"]) == codes(expected["matches"]) and expected["matches"]


def test_match_no_trade_is_tool_error(mcp, partner):
    result = mcp.tool(partner().headers, "match_qualifications", goal="hello there my friend")
    assert result["isError"]
    assert "hello there" not in text_of(result) and "No qualification matched" in text_of(result)


def test_match_needs_goal_or_answers(mcp, partner):
    assert mcp.tool(partner().headers, "match_qualifications")["isError"]


@pytest.mark.usefixtures("clean_match_stats")
def test_match_leaves_daily_counter_alone(mcp, partner, session):
    headers = partner().headers
    mcp.tool(headers, "match_qualifications", goal=GOAL)
    mcp.tool(headers, "match_qualifications", goal="hello there my friend")
    assert session.exec(select(MatchDailyStat)).all() == []


def test_invalid_input_error_does_not_echo_goal(mcp, partner, caplog):
    goal = "Juan Dela Cruz 09171234567 " * 40
    assert len(goal) > 1000
    result = mcp.tool(partner().headers, "match_qualifications", goal=goal)
    assert result["isError"]
    assert "Juan" not in text_of(result) and "0917" not in text_of(result)
    assert "Juan" not in caplog.text and "0917" not in caplog.text


def test_wrongly_typed_input_error_does_not_echo_it(mcp, partner):
    headers = partner().headers
    result = mcp.tool(headers, "match_qualifications", goal=GOAL, experience_years="Juan Dela Cruz")
    assert result["isError"] and "Juan" not in text_of(result)
    result = mcp.tool(headers, "rank_training_programs", qualification_code="SMAW-NC-II",
                      preferred_delivery_mode="Juan Dela Cruz")
    assert result["isError"] and "Juan" not in text_of(result)


def test_invalid_nested_answers_error_does_not_echo_them(mcp, partner):
    result = mcp.tool(partner().headers, "match_qualifications", answers={"education": "Juan Dela Cruz"})
    assert result["isError"] and "Juan" not in text_of(result)


def test_ranking_audit_note_reaches_the_caller_through_a_worker_thread():
    import contextvars

    from tesda_track.mcp import deps

    deps.begin_ranking_audit()
    contextvars.copy_context().run(deps.note_ranking_audit, 7)
    assert deps.take_ranking_audit() == 7


def test_route_matches_rest(client, mcp, partner):
    expected = client.post("/api/v1/analysis/pathway", json={
        "profile": {"experience_years": 4, "has_certification": False}, "qualification_code": "SMAW-NC-II"}).json()
    result = mcp.tool(partner().headers, "recommend_route", qualification_code="SMAW-NC-II",
                      experience_years=4, has_certification=False)
    assert not result["isError"]
    found = result["structuredContent"]
    assert found["route"] == expected["recommendation"]
    assert {key: found[key] for key in ("reason", "next_step", "pathway")} == \
        {key: expected[key] for key in ("reason", "next_step", "pathway")}


def test_route_unknown_code_is_tool_error(mcp, partner):
    assert mcp.tool(partner().headers, "recommend_route", qualification_code="NOPE")["isError"]


def test_readiness_matches_rest(client, mcp, partner, competency_ids):
    ids = competency_ids("SMAW-NC-II")
    answers = {i: "confident" if n < 3 else "some_experience" for n, i in enumerate(ids)}
    expected = client.post("/api/v1/analysis/readiness", json={
        "qualification_code": "SMAW-NC-II", "answers": {str(i): a for i, a in answers.items()}}).json()
    result = mcp.tool(partner().headers, "check_readiness", qualification_code="SMAW-NC-II",
                      answers={str(i): a for i, a in answers.items()})
    assert not result["isError"]
    assert result["structuredContent"] == expected


def test_readiness_lists_missing_ids(mcp, partner, competency_ids):
    ids = competency_ids("SMAW-NC-II")
    result = mcp.tool(partner().headers, "check_readiness", qualification_code="SMAW-NC-II",
                      answers={str(i): "confident" for i in ids[:-2]})
    assert result["isError"]
    assert text_of(result).endswith(f"Answer every competency. Missing competency ids: {ids[-2]}, {ids[-1]}.")


def test_readiness_lists_unknown_ids(mcp, partner, competency_ids):
    ids = competency_ids("SMAW-NC-II")
    answers = {str(i): "confident" for i in ids}
    answers["99999"] = "confident"
    result = mcp.tool(partner().headers, "check_readiness", qualification_code="SMAW-NC-II", answers=answers)
    assert result["isError"] and "Unknown competency ids for this qualification: 99999." in text_of(result)


def test_rank_training_matches_rest(client, mcp, partner, session, make_program, make_provider):
    make_program(title="Manila batch")
    make_program(provider=make_provider(name="Cebu Skills Center", region_code="VII", location=(10.3157, 123.8854)),
                 title="Cebu batch", verified=False)
    body = {"qualification_code": "SMAW-NC-II", "goal": GOAL, "near_lat": 14.6, "near_lon": 121.0}
    expected = client.post("/api/v1/recommendations/training", json=body).json()
    made = partner()
    result = mcp.tool(made.headers, "rank_training_programs", **body)
    assert not result["isError"]
    found = result["structuredContent"]
    assert "audit_id" not in found
    assert [(r["program"]["id"], r["score"]) for r in found["results"]] == \
        [(r["program"]["id"], r["score"]) for r in expected["results"]] and found["results"]
    assert [u["program"]["id"] for u in found["requires_verification"]] == \
        [u["program"]["id"] for u in expected["requires_verification"]]
    audit = session.exec(select(RankingAudit).where(RankingAudit.api_client_id == made.id)).one()
    assert audit.learner_id is None
    assert audit.query_hash == goal_fingerprint(GOAL, get_settings().secret_key.get_secret_value())
    assert GOAL not in str(audit.model_dump())


def test_rank_training_notes_the_audit_id(client, mcp, partner, session, make_program):
    from tesda_track.mcp import deps

    make_program()
    seen = []
    original = deps.note_ranking_audit
    deps.note_ranking_audit = lambda audit_id: (seen.append(audit_id), original(audit_id))[1]
    try:
        made = partner()
        mcp.tool(made.headers, "rank_training_programs", qualification_code="SMAW-NC-II")
    finally:
        deps.note_ranking_audit = original
    audit = session.exec(select(RankingAudit).where(RankingAudit.api_client_id == made.id)).one()
    assert seen == [audit.id]


def test_rank_training_region_uses_centroid(mcp, partner, session, make_program):
    from tesda_track.models import Region

    make_program()
    made = partner()
    result = mcp.tool(made.headers, "rank_training_programs", qualification_code="SMAW-NC-II", region_code="NCR")
    assert not result["isError"]
    region = session.get(Region, "NCR")
    audit = session.exec(select(RankingAudit).where(RankingAudit.api_client_id == made.id)).one()
    assert (audit.near_lat, audit.near_lon) == (round(region.latitude, 1), round(region.longitude, 1))
    unknown = mcp.tool(made.headers, "rank_training_programs", qualification_code="SMAW-NC-II", region_code="XX")
    assert unknown["isError"] and "NCR" in text_of(unknown)


def test_rank_training_half_a_coordinate_pair_is_tool_error(mcp, partner):
    result = mcp.tool(partner().headers, "rank_training_programs", qualification_code="SMAW-NC-II", near_lat=14.5)
    assert result["isError"] and "14.5" not in text_of(result)


def test_rank_assessments_matches_rest(client, mcp, partner, session, make_schedule):
    make_schedule(fee="500")
    make_schedule(fee="2500")
    body = {"qualification_code": "SMAW-NC-II", "maximum_fee": "1000", "region_code": "NCR"}
    expected = client.post("/api/v1/recommendations/assessments", json=body).json()
    made = partner()
    result = mcp.tool(made.headers, "rank_assessment_schedules", **body)
    assert not result["isError"]
    found = result["structuredContent"]
    assert "audit_id" not in found
    assert all("application_status" not in item for item in found["results"])
    assert [(r["schedule"]["id"], r["score"]) for r in found["results"]] == \
        [(r["schedule"]["id"], r["score"]) for r in expected["results"]] and found["results"]
    assert (found["total"], found["unconfirmed_total"]) == (expected["total"], expected["unconfirmed_total"])
    audit = session.exec(select(RankingAudit).where(RankingAudit.api_client_id == made.id)).one()
    assert audit.learner_id is None and audit.preferences["service_kind"] == "assessment"


def test_rest_audits_have_no_client(client, session, make_program):
    make_program()
    audit_id = client.post("/api/v1/recommendations/training", json={"qualification_code": "SMAW-NC-II"}).json()["audit_id"]
    assert session.get(RankingAudit, audit_id).api_client_id is None


def test_full_partner_sees_eight_tools(mcp, partner):
    response = mcp.call(partner(scopes=("catalog:read", "recommend:run")).headers, "tools/list")
    names = {tool["name"] for tool in response.json()["result"]["tools"]}
    assert names == {"get_qualification", "search_training_programs", "get_regional_supply", "match_qualifications",
                     "recommend_route", "check_readiness", "rank_training_programs", "rank_assessment_schedules"}
    tools = {tool["name"]: tool for tool in response.json()["result"]["tools"]}
    assert all(tool["annotations"]["readOnlyHint"] and not tool["annotations"]["openWorldHint"]
               for tool in tools.values())
