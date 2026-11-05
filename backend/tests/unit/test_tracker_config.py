"""Database-free checks of the Hercules settings that sign learners in from TESDA Skill Passport. Run with
--confcutdir=backend/tests/unit."""
import pytest
from pydantic import ValidationError

from tesda_track.config import Settings

HERCULES = dict(hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                tracker_client_secret="s" * 64)


def settings(**kwargs):
    return Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8, **kwargs)


def test_integration_off_by_default():
    assert settings().tracker_integration_enabled is False


def test_all_three_values_turn_it_on():
    assert settings(**HERCULES).tracker_integration_enabled is True


@pytest.mark.parametrize("missing", ["hercules_base_url", "tracker_client_id", "tracker_client_secret"])
def test_partial_configuration_is_refused(missing):
    with pytest.raises(ValidationError, match="HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET"):
        settings(**{**HERCULES, missing: None})


def test_empty_values_count_as_unset():
    # What a copy of .env.example gives: the keys are there with nothing after the "=".
    assert settings(hercules_base_url="", tracker_client_id="", tracker_client_secret="").tracker_integration_enabled is False


def test_http_base_url_refused_in_production():
    with pytest.raises(ValidationError, match="https"):
        settings(**{**HERCULES, "hercules_base_url": "http://hercules.example.test"}, environment="production")


def test_http_base_url_allowed_in_development():
    assert settings(**{**HERCULES, "hercules_base_url": "http://localhost:3000"}).tracker_integration_enabled


def test_secret_is_hidden_in_repr():
    assert "s" * 64 not in repr(settings(**HERCULES))
