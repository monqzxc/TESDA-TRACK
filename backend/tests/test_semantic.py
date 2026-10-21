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


def _item(id, code):
    from tesda_track.schemas.catalog import QualificationPublic, QualificationSummary
    from tesda_track.services.catalog import CatalogItem

    summary = QualificationSummary(code=code, name=code.title(), sector="Sector")
    return CatalogItem(id=id, code=code, sector="Sector", possible_jobs=("Job",), rules={}, summary=summary,
                       public=QualificationPublic(**summary.model_dump(), possible_jobs=["Job"], competencies=[]))


def test_score_matches_blends_keyword_evidence_and_semantic_strength():
    from tesda_track.services.analysis import MatchParams, score_matches

    items = [_item(1, "A"), _item(2, "B"), _item(3, "C"), _item(4, "D")]
    keyword = {"B": {"score": 95, "reason": "Matched your words: b"}}
    similarities = {1: 0.9, 2: 0.5, 3: 0.5, 4: 0.5}  # z-scores 1.732 for A, -0.577 for the rest
    params = MatchParams(z_floor=0.0, z_ceiling=1.0, keyword_weight=0.5, min_score=20)
    matches = score_matches(items, keyword, similarities, params)
    assert [(m.qualification.code, m.score) for m in matches] == [("A", 50), ("B", 50)]
    assert matches[1].reason == "Matched your words: b" and matches[0].reason == "Similar in meaning to your goal."
    assert (matches[0].components.keyword, matches[0].components.semantic) == (0, 1.0)


def test_score_matches_drops_weak_matches_and_keeps_the_best_three():
    from tesda_track.services.analysis import MatchParams, score_matches

    items = [_item(i, f"Q{i}") for i in range(1, 6)]
    keyword = {f"Q{i}": {"score": 55 + 10 * i, "reason": "r"} for i in range(1, 6)}
    params = MatchParams(z_floor=3.0, z_ceiling=5.0, keyword_weight=0.5, min_score=35)
    codes = [m.qualification.code for m in score_matches(items, keyword, {}, params)]
    assert codes == ["Q5", "Q4", "Q3"], "Q1 scores 34, under the minimum"


def test_match_params_come_from_settings():
    from tesda_track.config import get_settings
    from tesda_track.services.analysis import MatchParams

    assert MatchParams.from_settings(get_settings()) == MatchParams(3.0, 5.0, 0.5, 20)


def test_calibration_travels_with_a_fine_tuned_model(tmp_path):
    import json

    from tesda_track.services.analysis import MatchParams
    from tesda_track.services.embeddings import read_calibration

    (tmp_path / "calibration.json").write_text(json.dumps(
        {"z_floor": 2.0, "z_ceiling": 3.5, "keyword_weight": 0.4, "min_score": 25}))
    assert read_calibration(str(tmp_path)) == MatchParams(2.0, 3.5, 0.4, 25)


@pytest.mark.parametrize("content", ['{"z_floor": 3, "z_ceiling": 2, "keyword_weight": 0.5, "min_score": 20}',
                                     '{"z_floor": 2}', "not json"])
def test_invalid_calibration_is_ignored(tmp_path, content):
    from tesda_track.services.embeddings import read_calibration

    (tmp_path / "calibration.json").write_text(content)
    assert read_calibration(str(tmp_path)) is None
    assert read_calibration(str(tmp_path / "missing")) is None


def test_a_missing_model_folder_leaves_keyword_matching_on(monkeypatch, tmp_path):
    from tesda_track.config import get_settings
    from tesda_track.services import embeddings

    monkeypatch.setattr(get_settings(), "semantic_search_enabled", True)
    monkeypatch.setattr(get_settings(), "embedding_model", "tesda-track/test-missing")
    monkeypatch.setattr(get_settings(), "embedding_model_path", str(tmp_path / "missing"))
    monkeypatch.setattr(embeddings, "_embedder", None)
    monkeypatch.setattr(embeddings, "_load_failed", False)
    assert embeddings.get_embedder() is None


def test_a_fine_tuned_folder_under_the_base_model_name_is_refused(monkeypatch, tmp_path, caplog):
    from tesda_track.config import DEFAULT_EMBEDDING_MODEL, get_settings
    from tesda_track.services import embeddings

    (tmp_path / "onnx").mkdir()
    (tmp_path / "onnx" / "model.onnx").write_bytes(b"")
    monkeypatch.setattr(get_settings(), "semantic_search_enabled", True)
    monkeypatch.setattr(get_settings(), "embedding_model", DEFAULT_EMBEDDING_MODEL)
    monkeypatch.setattr(get_settings(), "embedding_model_path", str(tmp_path))
    monkeypatch.setattr(embeddings, "_embedder", None)
    monkeypatch.setattr(embeddings, "_load_failed", False)
    assert embeddings.get_embedder() is None
    assert "set EMBEDDING_MODEL to the fine-tuned model's own name" in caplog.text


def test_an_embedder_calibration_overrides_the_settings(client, semantic):
    from tesda_track.config import get_settings
    from tesda_track.services.analysis import MatchParams, match_params

    assert match_params(semantic) == MatchParams.from_settings(get_settings())
    semantic.calibration = MatchParams(0.0, 1.0, 0.5, 101)
    matches = client.post("/api/v1/analysis/matches", json={"query": "I want to be a welder.", "profile": {
        "career_goal": None, "possible_sector": None, "existing_skills": [], "experience_years": None,
        "has_certification": None, "intent": "unknown"}}).json()["matches"]
    assert matches == [], "a minimum score above 100 hides everything"
