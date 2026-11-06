"""The TSP profile census (scripts/tsp_profile_census.py) reports shape and aggregates, never one learner's values.

The profiles here are fixtures that only exercise the script: they say nothing about what real Skill Passport
profiles hold. Learners are linked through the real sign-in path with Hercules faked, as in test_tsp_sign_in."""
import importlib.util
import json
from pathlib import Path

import httpx

from tesda_track.config import Settings
from tesda_track.services import tsp_sign_in
from tesda_track.services.hercules import HerculesClient

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "tsp_profile_census.py"
RARE = "FIXTURE-RARE nagluluto ng adobo sa bahay"


def load_census():
    spec = importlib.util.spec_from_file_location("tsp_profile_census", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def link(session, sso_id: str, skills: list, region: str = "VII", credentials: dict | None = None):
    profile = {"sso_id": sso_id, "uli": f"ULI-{sso_id}",
               "personal_information": {"first_name": f"Fixture{sso_id}", "last_name": "Learner", "region": region},
               "skills": skills, "credentials": credentials or {}}
    token = {"access_token": "tok", "token_type": "Bearer", "expires_in": 900, "scope": "profile skills credentials"}

    def answer(request):
        data = token if request.url.path.endswith("/v1/tracker/token") else profile
        return httpx.Response(200, json={"success": True, "data": data})

    settings = Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                        hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                        tracker_client_secret="s" * 64)
    client = HerculesClient(settings, transport=httpx.MockTransport(answer))
    pending = tsp_sign_in.sign_in(session, client, "code")
    return tsp_sign_in.consent(session, pending.pending_id, accept=True)


def census_of(session, k=5):
    for n in range(5):
        link(session, f"shared-{n}", [{"name": "Welding", "level": "NC II"}], region="VII",
             credentials={"certificates": [{"certificate_name": "Shielded Metal Arc Welding (SMAW) NC II"}]})
    link(session, "rare-1", [RARE, {"skill_id": 9, "name": "Bookkeeping"}], region="CAR")
    link(session, "empty-1", [], region="VII")
    return load_census().census(session, k)


def test_reports_shape_counts_and_only_shared_labels(session):
    report = census_of(session)
    assert report["learners"] == {"linked": 7, "pending_consent_now": 0, "with_any_skill": 6, "with_no_skill": 1}
    skills = report["sections"]["skills"]
    assert skills["entries_per_learner"] == {"1": 5, "2": 1, "0": 1}
    assert skills["item_types"] == {"object": 6, "string": 1}
    assert {"keys": ["level", "name"], "entries": 5} in skills["object_key_sets"]
    assert skills["entries_with_id_like_key"] == 1
    assert skills["share_with_readable_label"] == 1.0
    labels = report["skill_labels"]
    assert labels["common_labels"] == [{"label": "Welding", "learners": 5}]
    assert labels["distinct_labels_not_shown"] == 2
    assert labels["occurrences"] == 7
    assert labels["language_heuristic"]["en"] >= 5
    assert labels["language_heuristic"].get("tl", 0) + labels["language_heuristic"].get("taglish", 0) == 1
    assert report["regions"] == {"CAR": "<5", "VII": 6}


def test_never_prints_identifiers_names_or_rare_values(session):
    text = json.dumps(census_of(session))
    for value in ("FIXTURE-RARE", "adobo", "Bookkeeping", "shared-0", "rare-1", "ULI-", "Fixture", "Learner"):
        assert value not in text


def test_counts_learners_whose_credentials_could_serve_as_weak_labels(session):
    proxy = census_of(session)["proxy_label_feasibility"]
    assert proxy["with_skills"] == 6
    assert proxy["with_skills_and_any_qualification_or_credential"] == 5


def test_leaves_out_excluded_subjects_and_learners_linked_before_a_date(session):
    from datetime import UTC, datetime, timedelta

    census_of(session)
    module = load_census()
    excluded = module.census(session, 5, exclude=frozenset({"rare-1", "empty-1"}))
    assert excluded["learners"]["linked"] == 5 and excluded["filters"]["excluded_subjects"] == 2
    later = module.census(session, 5, since=datetime.now(UTC) + timedelta(days=1))
    assert later["learners"]["linked"] == 0 and later["sign_in_events"]["distinct_subjects"] == 0
