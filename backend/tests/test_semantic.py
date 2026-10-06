import os

import pytest
from sqlmodel import func, select

from tesda_track.models import Qualification, QualificationEmbedding, TrainingProgramEmbedding
from tesda_track.services import embeddings
from tesda_track.services.analysis import hybrid_score, semantic_strength

# Shares "install", "operating", "systems" and "software" with Computer Systems Servicing, but no catalog keyword.
HARDWARE_GOAL = "I install operating systems and software"


def test_sync_embeds_every_active_qualification_once(session, semantic):
    count = session.exec(select(func.count()).select_from(QualificationEmbedding)).one()
    assert count == 5
    report = embeddings.sync(session, semantic)
    assert (report.created, report.updated) == (0, 0)


def test_changed_catalog_text_is_re_embedded(session, semantic):
    smaw = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
    smaw.competencies[0].name = "Follow shipyard safety rules"
    session.flush()
    report = embeddings.sync(session, semantic)
    assert (report.created, report.updated) == (0, 1)


def test_programs_are_embedded_when_created(session, semantic, make_program):
    program = make_program(description="Pipe welding for shipbuilding")
    stored = session.get(TrainingProgramEmbedding, program["id"])
    assert stored is not None and stored.model == "test-bag-of-words"


@pytest.mark.parametrize("contrast, strength", [(0.015, 0.0), (0.005, 0.0), (0.025, 0.5), (0.035, 1.0), (0.09, 1.0)])
def test_contrast_is_mapped_onto_the_calibrated_band(contrast, strength):
    assert semantic_strength(contrast, floor=0.015, ceiling=0.035) == pytest.approx(strength)


@pytest.mark.parametrize("keyword, semantic, weight, score", [
    (95, 0.0, 0.5, 50), (0, 0.6, 0.5, 30), (95, 1.0, 0.5, 100), (55, 0.5, 0.8, 56)])
def test_hybrid_score_blends_keyword_and_semantic_parts(keyword, semantic, weight, score):
    assert hybrid_score(keyword, semantic, keyword_weight=weight) == score


def test_without_semantic_search_unfamiliar_wording_finds_nothing(client):
    profile = client.post("/api/v1/analysis/goal", json={"query": HARDWARE_GOAL}).json()
    assert profile["source"] == "rules" and profile["profile"]["career_goal"] is None
    response = client.post("/api/v1/analysis/matches", json={"query": HARDWARE_GOAL, "profile": profile["profile"]})
    assert response.json()["matches"] == []


def test_semantic_search_matches_goals_that_share_no_keywords(client, semantic):
    analysis = client.post("/api/v1/analysis/goal", json={"query": HARDWARE_GOAL}).json()
    assert analysis["source"] == "ai"
    assert analysis["profile"]["career_goal"] == "Computer Technician"
    assert analysis["profile"]["possible_sector"] == "Information and Communication Technology"
    matches = client.post("/api/v1/analysis/matches",
                          json={"query": HARDWARE_GOAL, "profile": analysis["profile"]}).json()["matches"]
    assert matches[0]["qualification"]["code"] == "CSS-NC-II"
    assert matches[0]["components"]["keyword"] > 0, "the inferred career goal now counts as context"
    assert matches[0]["components"]["semantic"] > 0


def test_keyword_matches_stay_on_top_with_semantic_search(client, semantic):
    analysis = client.post("/api/v1/analysis/goal", json={"query": "I want to be a welder."}).json()
    assert analysis["source"] == "rules"
    matches = client.post("/api/v1/analysis/matches",
                          json={"query": "I want to be a welder.", "profile": analysis["profile"]}).json()["matches"]
    assert matches[0]["qualification"]["code"] == "SMAW-NC-II"
    assert all(m["score"] >= 20 for m in matches)


def test_unrelated_goals_still_find_nothing(client, semantic):
    analysis = client.post("/api/v1/analysis/goal", json={"query": "astronaut"}).json()
    assert analysis["profile"]["career_goal"] is None
    response = client.post("/api/v1/analysis/matches", json={"query": "astronaut", "profile": analysis["profile"]})
    assert response.json()["matches"] == []


@pytest.mark.skipif(not os.environ.get("TESDA_MODEL_TESTS"), reason="set TESDA_MODEL_TESTS=1 to run the real model")
@pytest.mark.parametrize("goal, code", [
    ("marunong akong mag-ayos ng computer at internet", "CSS-NC-II"),
    ("nagtatrabaho ako sa talyer, nagwe-welding ng gate", "SMAW-NC-II"),
    ("I like fixing laptops and setting up wifi", "CSS-NC-II"),
])
def test_real_model_understands_taglish_and_paraphrases(session, goal, code):
    from tesda_track.config import get_settings

    embedder = embeddings.E5Embedder(get_settings().embedding_model, get_settings().embedding_cache_dir)
    embeddings.sync(session, embedder)
    similarities = embeddings.qualification_similarities(session, embedder, goal)
    best = max(similarities, key=similarities.get)
    assert session.get(Qualification, best).code == code


@pytest.mark.skipif(not os.environ.get("TESDA_MODEL_TESTS"), reason="set TESDA_MODEL_TESTS=1 to run the real model")
@pytest.mark.parametrize("goal, code", [
    ("marunong akong mag-ayos ng laptop at internet", "CSS-NC-II"),
    ("nagluluto ako ng ulam para sa karinderya", "COOKERY-NC-II"),
    ("I like fixing laptops and setting up wifi", "CSS-NC-II"),
    ("I want to become a nurse", None),
    ("gusto kong maging abogado", None),
    ("I want to be an astronaut", None),
])
def test_real_model_calibration_matches_related_goals_only(session, goal, code):
    """Guards the contrast band: goals with no catalog keyword still match; unrelated goals don't."""
    from tesda_track.config import get_settings
    from tesda_track.services import analysis

    embedder = embeddings.E5Embedder(get_settings().embedding_model, get_settings().embedding_cache_dir)
    embeddings.sync(session, embedder)
    profile = analysis.analyze_goal(session, goal, embedder).profile
    _, matches = analysis.match(session, goal, profile, embedder)
    assert (matches[0].qualification.code if matches else None) == code
