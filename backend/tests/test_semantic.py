import os

import pytest
from sqlmodel import func, select

from tesda_track.models import Qualification, QualificationEmbedding, TrainingProgramEmbedding
from tesda_track.services import embeddings
from tesda_track.services.analysis import hybrid_score, semantic_strength, z_scores

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


@pytest.mark.parametrize("z, strength", [(3.0, 0.0), (2.0, 0.0), (4.0, 0.5), (5.0, 1.0), (7.0, 1.0)])
def test_z_score_is_mapped_onto_the_calibrated_band(z, strength):
    assert semantic_strength(z, floor=3.0, ceiling=5.0) == pytest.approx(strength)


def test_z_scores_measure_how_far_each_similarity_stands_out():
    # mean 0.6, population standard deviation sqrt(0.03) = 0.1732
    scores = z_scores({1: 0.9, 2: 0.5, 3: 0.5, 4: 0.5})
    assert scores[1] == pytest.approx(1.732, abs=0.001) and scores[2] == pytest.approx(-0.577, abs=0.001)
    assert z_scores({1: 0.8, 2: 0.8}) == {}, "identical similarities carry no signal"
    assert z_scores({1: 0.8}) == {}


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
    assert matches[0]["components"]["keyword"] == 0, "a career the model inferred is not keyword evidence"
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


# Goals that share no keyword with the catalog, and goals with no TVET equivalent. They guard the z-score band
# against the real 319-qualification catalog, which is what learners see.
RELATED_GOALS = {
    "I like fixing laptops and setting up wifi": "Computer Systems Servicing NC II",
    "I want to take care of elderly people abroad": "Caregiving (Elderly) NC II",
    "I want to install solar panels on houses": "PV Systems Installation NC II",
    "I want to work in a call center": "Contact Center Services NC II",
    "I want to learn how to make bread and cakes": "Food Production (Bread and Patisserie) NC II",
    "marunong akong mag-ayos ng laptop at internet": "Computer Systems Servicing NC II",
    "nagluluto ako ng ulam para sa karinderya": "Cookery NC II",
    "gusto kong maging karpintero": "Carpentry NC II",
}
NO_TVET_MATCH = ["I want to be an astronaut", "gusto kong maging abogado", "gusto kong maging pulis",
                 "I want to be a politician", "I want to play professional basketball"]


@pytest.mark.skipif(not os.environ.get("TESDA_MODEL_TESTS"), reason="set TESDA_MODEL_TESTS=1 to run the real model")
def test_real_model_on_the_real_catalog(session):
    from tesda_track.config import get_settings
    from tesda_track.seed import SEED_DIR, seed_all
    from tesda_track.services import analysis

    settings = get_settings()
    seed_all(session, SEED_DIR)  # the real catalog, inside this test's rolled-back transaction
    embedder = embeddings.E5Embedder(settings.embedding_model, settings.embedding_cache_dir)
    embeddings.sync(session, embedder)

    def best_match(goal):
        profile = analysis.analyze_goal(session, goal, embedder).profile
        _, matches = analysis.match(session, goal, profile, embedder)
        return matches[0].qualification.name if matches else None

    assert {goal: best_match(goal) for goal in RELATED_GOALS} == RELATED_GOALS
    assert {goal: best_match(goal) for goal in NO_TVET_MATCH} == {goal: None for goal in NO_TVET_MATCH}
