"""Rehearsal helpers must never target the source or a remote database."""
import pytest
from sqlalchemy import make_url

from scripts.rehearse_migrations import disposable_name, downgrade_refusal_reason, validate_source


@pytest.mark.parametrize("name", ["tesda_track", "tesda_track_test", "postgres", "tesda_rehearsal_", "tesda_rehearsal_123456789abc; DROP DATABASE tesda_track"])
def test_mutations_reject_every_name_outside_disposable_namespace(name):
    with pytest.raises(ValueError):
        disposable_name(name)


def test_generated_disposable_name_is_accepted():
    assert disposable_name("tesda_rehearsal_123456789abc") == "tesda_rehearsal_123456789abc"


@pytest.mark.parametrize("url", [
    "postgresql://role:secret@production.example:5433/tesda_track",
    "postgresql://role:secret@127.0.0.1:5432/tesda_track",
    "postgresql://role:secret@127.0.0.1:5433/tesda_rehearsal_123456789abc",
    "postgresql://role:secret@127.0.0.1:5433/",
    "mysql://role:secret@127.0.0.1:5433/tesda_track",
])
def test_source_rejects_nonlocal_or_ambiguous_database(url):
    with pytest.raises(ValueError):
        validate_source(make_url(url))


def test_only_local_development_source_is_accepted():
    url = make_url("postgresql+psycopg://role:secret@127.0.0.1:5433/tesda_track")
    assert validate_source(url) == url


def test_role_guard_classification_never_exposes_custom_role_values():
    reason = downgrade_refusal_reason(RuntimeError("Accounts still hold roles added after 0017 (PRIVATE_ROLE)"))
    assert reason == "custom_role_assignments_require_reassignment_before_0017"
    assert "PRIVATE" not in reason
    assert downgrade_refusal_reason(RuntimeError("Reassign staff accounts to learner or admin before downgrading RBAC.")) == \
        "staff_role_assignments_require_reassignment_before_0015"
    assert downgrade_refusal_reason(Exception("PRIVATE ROW VALUES")) == "migration_failed"
