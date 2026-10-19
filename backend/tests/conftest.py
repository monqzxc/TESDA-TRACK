"""Backend fixtures for accounts. Database, app and client fixtures live in the repository-root conftest."""
import math
import re
import uuid
import zlib
from typing import NamedTuple

import pytest

PASSWORD = "correct horse battery"
STOP_WORDS = {"query", "passage", "i", "a", "an", "the", "and", "to", "of", "in", "for", "my", "want", "be", "is",
              "it", "with", "on", "at", "as", "sector", "jobs", "skills", "keywords", "competencies", "delivery"}


class WordEmbedder:
    """Test stand-in for the embedding model: a hashed bag of words, so texts that share words are similar."""
    model_name = "test-bag-of-words"

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * 384
        for word in re.findall(r"[a-z]+", text.lower()):
            if word not in STOP_WORDS:
                vector[zlib.crc32(word.encode()) % 384] += 1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]


@pytest.fixture
def semantic(app, session, monkeypatch):
    """Turn semantic search on with the test embedder and a similarity band suited to it."""
    from tesda_track.config import get_settings
    from tesda_track.services import embeddings

    embedder = WordEmbedder()
    # Five qualifications can't produce a z-score above about 1.8, so the band is lower than in production.
    monkeypatch.setattr(get_settings(), "semantic_z_floor", 0.0)
    monkeypatch.setattr(get_settings(), "semantic_z_ceiling", 1.0)
    app.dependency_overrides[embeddings.get_embedder] = lambda: embedder
    embeddings.sync(session, embedder)
    return embedder


@pytest.fixture
def register(client):
    def register(email, password=PASSWORD, full_name="Juan Dela Cruz"):
        response = client.post("/api/v1/auth/register", json={
            "email": email, "password": password, "full_name": full_name, "privacy_consent": True})
        assert response.status_code == 201, response.text
        return response.json()
    return register


@pytest.fixture
def login(client):
    def login(email, password=PASSWORD):
        response = client.post("/api/v1/auth/token", data={"username": email, "password": password})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    return login


@pytest.fixture
def learner(register, login):
    register("juan@example.com")
    return login("juan@example.com")


@pytest.fixture
def other_learner(register, login):
    register("maria@example.com", full_name="Maria Santos")
    return login("maria@example.com")


@pytest.fixture
def admin(session, login):
    from tesda_track.cli import create_or_promote_admin

    create_or_promote_admin(session, email="admin@example.com", full_name="Pilot Admin", password=PASSWORD)
    session.flush()
    return login("admin@example.com")


class Partner(NamedTuple):
    id: uuid.UUID
    secret: str
    token: str
    headers: dict


@pytest.fixture
def partner(session, client):
    """An outside system with a client-credentials client and a bearer token from the real token endpoint."""
    from tesda_track.services.partner_clients import create_client

    def make(name="TSP", scopes=("catalog:read", "recommend:run"), expected_tools=(), rate_limit=120):
        row, secret = create_client(session, name=name, organisation=f"{name} operator", declared_purpose="Tests",
                                    scopes=list(scopes), expected_tools=list(expected_tools),
                                    rate_limit_per_minute=rate_limit)
        session.flush()
        response = client.post("/api/v1/oauth/token", data={"grant_type": "client_credentials"},
                               auth=(str(row.id), secret))
        assert response.status_code == 200, response.text
        token = response.json()["access_token"]
        return Partner(row.id, secret, token, {"Authorization": f"Bearer {token}"})
    return make


MANILA = (14.5995, 120.9842)


def _post(client, headers, path, body):
    response = client.post(path, headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def make_provider(client, admin):
    def make_provider(name="Manila Welding Institute", region_code="NCR", location=MANILA, **extra):
        body = {"name": name, "region_code": region_code, **extra}
        if location:
            body.update(latitude=location[0], longitude=location[1])
        return _post(client, admin, "/api/v1/admin/training-providers", body)
    return make_provider


@pytest.fixture
def verify_service(client, admin):
    """Authoritative-evidence simulation ONLY in the isolated test database, never seed/demo data."""
    def verify_service(kind, site_id, code="SMAW-NC-II", **extra):
        from datetime import timedelta
        from tesda_track.models import utcnow

        body = {"status": "verified", "source_name": "Test-only authority fixture",
                "source_reference": "https://authority.example.invalid/test-fixture",
                "reviewed_at": (utcnow() - timedelta(minutes=1)).isoformat(),
                "review_due_at": (utcnow() + timedelta(days=30)).isoformat(),
                "requirements_reviewed": True, **extra}
        response = client.put(f"/api/v1/admin/service-verifications/{kind}/{site_id}/{code}", headers=admin, json=body)
        assert response.status_code == 200, response.text
        return response.json()
    return verify_service


def available_fixture():
    from datetime import timedelta
    from tesda_track.models import utcnow
    return {"availability_status": "available", "availability_source": "Isolated test-only availability fixture",
            "availability_checked_at": (utcnow() - timedelta(minutes=1)).isoformat(),
            "availability_valid_until": (utcnow() + timedelta(days=30)).isoformat()}


@pytest.fixture
def make_program(client, admin, make_provider, verify_service):
    def make_program(provider=None, qualification_code="SMAW-NC-II", verified=True, **extra):
        provider = provider or make_provider()
        if verified:
            verify_service("training", provider["id"], qualification_code)
        body = {"provider_id": provider["id"], "qualification_code": qualification_code,
                "title": "SMAW NC II Batch 1", "delivery_mode": "institution_based", **extra}
        return _post(client, admin, "/api/v1/admin/training-programs", body)
    return make_program


@pytest.fixture
def make_center(client, admin):
    def make_center(name="Manila Assessment Center", region_code="NCR", location=MANILA, **extra):
        body = {"name": name, "region_code": region_code, **extra}
        if location:
            body.update(latitude=location[0], longitude=location[1])
        return _post(client, admin, "/api/v1/admin/assessment-centers", body)
    return make_center


@pytest.fixture
def make_schedule(client, admin, make_center, verify_service):
    def make_schedule(center=None, qualification_code="SMAW-NC-II", days_ahead=14, slots=2, verified=True, **extra):
        from datetime import datetime, timedelta, timezone

        center = center or make_center()
        if verified:
            verify_service("assessment", center["id"], qualification_code)
        body = {"center_id": center["id"], "qualification_code": qualification_code, "slots": slots,
                "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat(),
                **available_fixture(), **extra}
        return _post(client, admin, "/api/v1/admin/assessment-schedules", body)
    return make_schedule


@pytest.fixture
def competency_ids(client):
    def competency_ids(code):
        return [c["id"] for c in client.get(f"/api/v1/qualifications/{code}").json()["competencies"]]
    return competency_ids
