from types import SimpleNamespace

from tesda_track.schemas.analysis import Profile
from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.services import analysis, occupation_catalog, skill_search


def items():
    return [
        SimpleNamespace(
            id=i,
            code=code,
            summary=QualificationSummary(code=code, name=name, sector="ICT"),
        )
        for i, code, name in [(1, "A", "Alpha NC III"), (2, "B", "Beta NC III")]
    ]


def test_saturated_goal_scores_keep_raw_semantic_order():
    found = analysis.score_matches(
        items(), {}, {1: 0.54, 2: 0.66}, analysis.MatchParams(-2, -1, 0.3, 40)
    )
    assert [m.qualification.code for m in found] == ["B", "A"]
    assert [m.score for m in found] == [70, 70]


def test_saturated_skill_scores_keep_raw_semantic_order(monkeypatch):
    monkeypatch.setattr(
        skill_search.embeddings,
        "qualification_similarities_many",
        lambda *args: [{1: 0.54, 2: 0.66}],
    )
    views = [
        dict(code=i.code, name=i.summary.name, sector="ICT", career_keywords=[])
        for i in items()
    ]
    found = skill_search.search(
        None,
        items(),
        views,
        "web developer",
        object(),
        analysis.MatchParams(-2, -1, 0.3, 40),
    )
    assert [m.qualification.code for m in found.matches] == ["B", "A"]
    assert [m.score for m in found.matches] == [70, 70]


def test_source_backed_occupation_corrections_preserve_originals():
    original = ["Programming"]
    assert occupation_catalog.jobs("JAVA-NC-III", original) == ["Programmer"]
    assert original == ["Programming"]
    assert occupation_catalog.jobs("WEB-DEVELOPMENT-NC-III", ["Web Designer"]) == [
        "Web Developer",
        "Web Designer",
    ]
    assert occupation_catalog.jobs("UNKNOWN", original) == original
    assert occupation_catalog.source("JAVA-NC-III")["year"] == 2020
    assert occupation_catalog.source("UNKNOWN") is None
