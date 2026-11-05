"""Database-free checks of `python -m tesda_track.cli tracker-exchange`: it shows the shape of a real Hercules
profile, never its values. Run with --confcutdir=backend/tests/unit."""
import io
import json

import httpx
import pytest

from tesda_track.cli import run_tracker_exchange
from tesda_track.config import Settings
from tesda_track.services.hercules import HerculesClient, HerculesUnavailable, describe_profile

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
    assert shape["sensitive_fields_sent"] == ["face_url", "nat_id"]
    assert shape["unexpected_fields"] == ["foo", "nat_id", "personal_information.face_url"]


def test_describe_lists_scalar_item_types():
    shape = describe_profile({**PROFILE_DATA, "skills": ["Welding", "Cooking"]})
    assert shape["sections"]["skills"] == {"count": 2, "item_keys": ["str"]}


def test_run_prints_token_summary_and_shape():
    out = io.StringIO()
    run_tracker_exchange(hercules(PROFILE_DATA), CODE, out)
    output = json.loads(out.getvalue())
    assert output["token"] == {"expires_in": 900, "scopes": ["credentials", "experience", "profile", "skills"]}
    assert output["profile"] == describe_profile(PROFILE_DATA)
    assert "tok-123" not in out.getvalue() and CODE not in out.getvalue()


def test_run_refuses_a_profile_the_model_cannot_read():
    out = io.StringIO()
    with pytest.raises(HerculesUnavailable):
        run_tracker_exchange(hercules({**PROFILE_DATA, "sso_id": 42}), CODE, out)
    assert out.getvalue() == ""
