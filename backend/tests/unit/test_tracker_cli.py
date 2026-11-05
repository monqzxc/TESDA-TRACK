"""Database-free checks of `python -m tesda_track.cli tracker-exchange`: it shows the shape of a real Hercules
profile, never its values. Run with --confcutdir=backend/tests/unit."""
import io
import json

import httpx

from tesda_track.cli import run_tracker_exchange
from tesda_track.config import Settings
from tesda_track.services.hercules import HerculesClient, describe_profile

CODE = "code-xyz"
PROFILE_DATA = {"sso_id": "sso-abc", "uli": "ULI-1",
                "personal_information": {"first_name": "Juana", "mobile_number": "+639170000000", "middle_name": ""},
                "skills": [{"name": "Welding", "level": "NC II"}]}
TOKEN_DATA = {"access_token": "tok-123", "token_type": "Bearer", "expires_in": 900,
              "scope": "profile skills experience credentials"}


def hercules(profile_data):
    def answer(request):
        data = TOKEN_DATA if request.url.path.endswith("/token") else profile_data
        return httpx.Response(200, json={"success": True, "data": data})

    settings = Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                        hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                        tracker_client_secret="s" * 64)
    return HerculesClient(settings, transport=httpx.MockTransport(answer))


def test_describe_shows_structure_not_values():
    shape = describe_profile(PROFILE_DATA)
    assert shape["sso_id"] == "sso-… (7 chars)"
    assert shape["uli"] is True
    assert shape["personal_information"] == ["first_name", "mobile_number"]
    assert shape["sections"]["skills"] == {"count": 1, "item_keys": ["level", "name"]}
    assert shape["sections"]["credentials.certificates"] == {"count": 0, "item_keys": []}
    assert shape["unexpected_fields"] == [] and shape["sensitive_fields_sent"] == []
    text = json.dumps(shape)
    assert not any(value in text for value in ("Juana", "+639170000000", "ULI-1", "Welding", "sso-abc"))


def test_describe_reports_sensitive_and_unexpected_fields():
    data = {**PROFILE_DATA, "nat_id": "1234", "foo": 1,
            "personal_information": {**PROFILE_DATA["personal_information"], "face_url": "https://faces.example/1"}}
    shape = describe_profile(data)
    assert shape["sensitive_fields_sent"] == ["nat_id", "personal_information.face_url"]
    assert shape["unexpected_fields"] == ["foo", "nat_id", "personal_information.face_url"]


def test_describe_finds_sensitive_fields_at_any_depth():
    data = {**PROFILE_DATA, "skills": [{"name": "Welding", "nat_id": "1"}],
            "credentials": {"certificates": [{"holder": {"face_url": "x"}}], "blood_type": "O+"}}
    assert describe_profile(data)["sensitive_fields_sent"] == [
        "credentials.blood_type", "credentials.certificates[].holder.face_url", "skills[].nat_id"]


def test_describe_lists_scalar_item_types():
    shape = describe_profile({**PROFILE_DATA, "skills": ["Welding", "Cooking"]})
    assert shape["sections"]["skills"] == {"count": 2, "item_keys": ["str"]}


def test_run_prints_token_summary_and_shape():
    out = io.StringIO()
    assert run_tracker_exchange(hercules(PROFILE_DATA), CODE, out) is True
    output = json.loads(out.getvalue())
    assert output["token"] == {"expires_in": 900, "scopes": ["credentials", "experience", "profile", "skills"]}
    assert output["profile"] == describe_profile(PROFILE_DATA)
    assert output["parses"] is True and output["parse_problems"] == []
    assert "tok-123" not in out.getvalue() and CODE not in out.getvalue()


def test_run_still_shows_the_shape_of_a_profile_the_model_cannot_read():
    # A code works once, so the shape is printed even then: it's what shows how the model must change.
    data = {**PROFILE_DATA, "sso_id": 42, "personal_information": {"first_name": "Juana", "zip_code": 4000}}
    out = io.StringIO()
    assert run_tracker_exchange(hercules(data), CODE, out) is False
    output = json.loads(out.getvalue())
    assert output["parses"] is False
    assert output["parse_problems"] == ["personal_information.zip_code", "sso_id"]
    assert output["profile"] == describe_profile(data) and "Juana" not in out.getvalue()
