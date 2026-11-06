"""The competency-aware evaluation: representations, checks, leave-one-out labels, and that nothing personal comes
out. A bag-of-words embedder stands in for the model; numbers here say nothing about v6-colab."""
import hashlib
import json
import re
from argparse import Namespace
from datetime import date

import httpx
import numpy as np
import pytest

from evaluation import competency as C
from tesda_track.config import Settings
from tesda_track.services import tsp_sign_in
from tesda_track.services.analysis import MatchParams
from tesda_track.services.embeddings import qualification_text
from tesda_track.services.hercules import HerculesClient
from tesda_track.services.tsp_profile import normalize
from training.catalog import load_catalog

TODAY = date(2026, 11, 6)
PARAMS = MatchParams(3.0, 5.0, 0.5, 20)


def bag(texts: list[str]) -> list[list[float]]:
    rows = []
    for text in texts:
        row = np.zeros(512)
        for word in re.findall(r"[a-z]+", text.casefold()):
            row[int(hashlib.md5(word.encode()).hexdigest(), 16) % 512] += 1
        rows.append(row if row.any() else row + 1e-6)
    return rows


@pytest.fixture(scope="module")
def catalog():
    return C.Catalog.load()


@pytest.fixture(scope="module")
def passages():
    return C._unit(np.asarray(bag([qualification_text(q) for q in load_catalog()[0]])))


def scored(catalog, raw, kind="x", judgments=None):
    return C.Scored("p", "test", kind, normalize(raw, catalog.codes, TODAY), judgments or {})


def test_each_representation_reads_only_its_own_evidence(catalog):
    raw = {"skills": ["Cooking"], "experience": [{"job_title": "Kitchen helper"}],
           "credentials": {"certificates": [catalog.certificate("COOKERY-NC-II", "Active")]}}
    profile = normalize(raw, catalog.codes, TODAY)
    groups = {name: set(C.evidence(profile, name, catalog)) for name in C.REPRESENTATIONS}
    assert groups == {"skills_only": {"skills"}, "core_only": {"core"}, "all_units_flat": {"units"},
                      "type_weighted": {"core", "common"}, "quals_core": {"quals", "core"},
                      "combined": {"skills", "quals", "core", "common", "history"}}
    units = C.evidence(profile, "all_units_flat", catalog)["units"]
    assert set(C.evidence(profile, "core_only", catalog)["core"]) < set(units)
    assert C.evidence(profile, "quals_core", catalog)["quals"] == ["Cookery NC II"]


def test_similarity_is_the_weighted_mean_of_each_groups_mean():
    passages = np.eye(2)
    vectors = {"a": np.array([1.0, 0.0]), "b": np.array([0.0, 1.0]), "c": np.array([1.0, 0.0])}
    result = C.similarity({"core": ["a", "b"], "skills": ["c"]}, {"core": 1.0, "skills": 3.0}, vectors, passages)
    assert result == pytest.approx([(1.0 * 0.5 + 3.0 * 1.0) / 4, (1.0 * 0.5 + 3.0 * 0.0) / 4])


def test_generic_units_never_start_a_ranking_except_in_the_flat_control(catalog, passages):
    generic = {"credentials": {"certificates": [catalog.certificate("COOKERY-NC-II", "Active",
                                                                    types=("BASIC", "COMMON"))]}}
    profile = scored(catalog, generic)
    profile.profile = C.NormalizedProfile(units=profile.profile.units)  # units only, no qualification named
    C.score([profile], catalog, bag, passages, PARAMS)
    for representation in C.REPRESENTATIONS:
        for system in C.SYSTEMS:
            shown = profile.shown[(representation, system)]
            assert (not shown) or representation == C.CONTROL, representation


def test_duplicates_count_only_qualifications_valid_today_and_expired_ones_are_renewals(catalog):
    raw = {"credentials": {"certificates": [catalog.certificate("COOKERY-NC-II", "Active"),
                                            catalog.certificate("HOUSEKEEPING-NC-II", "Expired")]}}
    profile = scored(catalog, raw)
    profile.shown[("core_only", "semantic")] = ["COOKERY-NC-II"]
    other = scored(catalog, raw)
    other.shown[("core_only", "semantic")] = ["HOUSEKEEPING-NC-II"]
    result = C.checks([profile, other], ("core_only", "semantic"), catalog)
    assert result["duplicate_held_today_profiles"] == 0.5 and result["renewal_of_expired_profiles"] == 0.5


def test_a_suggestion_outside_every_evidenced_sector_is_unsupported_and_unrelated_without_shared_units(catalog):
    cookery = catalog.certificate("COOKERY-NC-II", "Active")
    profile = scored(catalog, {"credentials": {"certificates": [cookery]}})
    far = next(code for code in catalog.name_of if catalog.sector_of[code] != catalog.sector_of["COOKERY-NC-II"]
               and not catalog.core_titles[code] & catalog.core_titles["COOKERY-NC-II"])
    near = next(code for code in catalog.name_of if catalog.sector_of[code] == catalog.sector_of["COOKERY-NC-II"]
                and code != "COOKERY-NC-II")
    profile.shown[("core_only", "hybrid")] = [near, far]
    result = C.checks([profile], ("core_only", "hybrid"), catalog)
    assert result["cross_sector_unsupported_slots"] == 0.5 and result["unrelated_slots"] == 0.5


def test_insufficient_evidence_that_gets_a_suggestion_is_counted(catalog):
    empty, generic = scored(catalog, {}, kind="empty"), scored(catalog, {}, kind="generic_only")
    empty.shown[("combined", "hybrid")], generic.shown[("combined", "hybrid")] = [], ["COOKERY-NC-II"]
    result = C.checks([empty, generic], ("combined", "hybrid"), catalog)
    assert result["insufficient_evidence_profiles"] == 2 and result["insufficient_evidence_suggested"] == 0.5


def test_leaving_a_certificate_out_takes_everything_that_names_it(catalog):
    codes = catalog.codes
    cookery, housekeeping = (catalog.certificate("COOKERY-NC-II", "Active"),
                             catalog.certificate("HOUSEKEEPING-NC-II", "Expired"))
    kept = {"skills": ["Cooking"], "qualifications": [cookery["qual_code"], housekeeping["qual_code"], "ZZZ1"],
            "credentials": {"certificates": [cookery, housekeeping, {"qual_code": "ZZZ1", "status": "Active"}],
                            "assessments": [{"QualificationName": "Cookery NC II", "AsseResult": "Competent"}]}}
    cases = dict(C.leave_one_out(kept, codes))
    assert set(cases) == {"COOKERY-NC-II", "HOUSEKEEPING-NC-II"}  # the unmapped certificate is never an answer
    without = normalize(cases["COOKERY-NC-II"], codes, TODAY)
    assert "COOKERY-NC-II" not in {q.catalog_code for q in without.qualifications}
    assert not without.assessments and without.held_before == {"HOUSEKEEPING-NC-II"}
    twice = {"credentials": {"certificates": [cookery, dict(cookery, expiration_date="1st of May, 2098")]}}
    assert C.leave_one_out(twice, codes) == []  # held twice: the answer would still be there


def test_runs_end_to_end_and_reports_every_representation_and_system(catalog, passages):
    args = Namespace(cases=6, per_sector=1, seed=3, from_db=False)
    report = C.evaluate(args, embed=bag, passages=passages, params=PARAMS, catalog=catalog)
    for dataset in ("augmented", "safety"):
        results = report["datasets"][dataset]["results"]
        assert set(results) == {f"{r}/{s}" for r in C.REPRESENTATIONS for s in C.SYSTEMS}
    augmented = report["datasets"]["augmented"]["results"]
    assert "recall_vs_current" not in augmented["skills_only/hybrid"]
    assert augmented["combined/hybrid"]["recall_vs_current"]["n"] > 0
    assert set(augmented["skills_only/hybrid"]["by_kind"]) <= set(C.VARIANTS)
    assert augmented["skills_only/hybrid"]["by_kind"]["held_answer"]["recall_at_3"] is None  # unlabeled on purpose
    safety = report["datasets"]["safety"]["results"]["core_only/hybrid"]["by_kind"]
    assert safety["empty"]["insufficient_evidence_suggested"] == 0
    assert "COMPACT" not in C.compact(report).upper()


def link(session, sso_id, kept_profile):
    """A learner linked through the real sign-in path, with Hercules faked."""
    token = {"access_token": "tok", "token_type": "Bearer", "expires_in": 900, "scope": "profile skills credentials"}
    profile = {"sso_id": sso_id, "uli": f"ULI-{sso_id}", **kept_profile}

    def answer(request):
        return httpx.Response(200, json={"success": True, "data": token if request.url.path.endswith("/token")
                                         else profile})

    settings = Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                        hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                        tracker_client_secret="s" * 64)
    client = HerculesClient(settings, transport=httpx.MockTransport(answer))
    tsp_sign_in.consent(session, tsp_sign_in.sign_in(session, client, "code").pending_id, accept=True)


def test_real_profiles_give_aggregates_only_and_suppress_small_groups(session, catalog, passages, monkeypatch):
    from contextlib import contextmanager

    for n in range(6):
        link(session, f"fixture-{n}", {
            "personal_information": {"first_name": "FIXTURENAME", "region": "VII" if n < 5 else "CAR"},
            "skills": ["SECRET-SKILL-TEXT"] if n == 0 else [],
            "credentials": {"certificates": [
                {**catalog.certificate("COOKERY-NC-II", "Active"), "certificate_number": "FIXTURE-CERT"},
                catalog.certificate("HOUSEKEEPING-NC-II", "Expired")]}})
    session.flush()

    @contextmanager
    def same_session(_engine):
        yield session

    monkeypatch.setattr("sqlmodel.Session", same_session)
    args = Namespace(cases=2, per_sector=1, seed=3, from_db=True, since=None, exclude_subjects=None, k=5)
    report = C.evaluate(args, embed=bag, passages=passages, params=PARAMS, catalog=catalog)
    text = json.dumps(report, default=str)
    for value in ("fixture-", "FIXTURENAME", "SECRET-SKILL-TEXT", "FIXTURE-CERT", "ULI-"):
        assert value not in text
    assert report["datasets"]["real"]["notes"]["profiles"] == 6
    assert report["datasets"]["real"]["notes"]["held_out_cases"] == 12
    regions = report["datasets"]["real_by_region"]["results"]["core_only/hybrid"]["by_kind"]
    assert regions["CAR"] == {"n": "<5"} and regions["VII"]["n"] == 5
    assert "real_held_out" in report["datasets"]
