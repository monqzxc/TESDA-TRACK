import io
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from tesda_track import cli
from tesda_track.config import get_settings
from tesda_track.errors import ConflictError, InvalidRequestError
from tesda_track.models import ApiClient
from tesda_track.security import verify_password
from tesda_track.services import partner_clients
from tesda_track.services.partner_clients import (InvalidPartnerToken, create_client, mcp_signing_key,
                                                  revoke_client, rotate_secret, verify_access_token)

TOKEN = "/api/v1/oauth/token"
GRANT = {"grant_type": "client_credentials"}


def make_client(session, **extra):
    options = {"name": "TSP", "organisation": "TESDA Skill Passport", "declared_purpose": "Suggest courses",
               "scopes": ["catalog:read", "recommend:run"], "expected_tools": [], **extra}
    row, secret = create_client(session, **options)
    session.flush()
    return row, secret


def test_create_client_stores_only_a_hash(session):
    row, secret = make_client(session)
    columns = [str(value) for value in row.model_dump().values()]
    assert not any(secret in value for value in columns)
    assert verify_password(secret, row.secret_hash)[0]


def test_create_client_rejects_unknown_scope(session):
    with pytest.raises(InvalidRequestError):
        make_client(session, scopes=["admin:all"])


def test_token_with_basic_auth(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data=GRANT, auth=(str(row.id), secret))
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["token_type"] == "Bearer" and body["expires_in"] == 3600
    assert body["scope"] == "catalog:read recommend:run"
    claims = jwt.decode(body["access_token"], mcp_signing_key(get_settings()), algorithms=["HS256"],
                        audience="http://testserver/mcp")
    assert claims["aud"] == "http://testserver/mcp" and claims["sub"] == str(row.id) and claims["ver"] == 1
    assert session.get(ApiClient, row.id).last_token_at is not None


def test_token_with_client_secret_post(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data={**GRANT, "client_id": str(row.id), "client_secret": secret})
    assert response.status_code == 200 and response.json()["access_token"]


def test_basic_auth_wins_over_form_credentials(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data={**GRANT, "client_id": str(row.id), "client_secret": "wrong"},
                           auth=(str(row.id), secret))
    assert response.status_code == 200


def test_requested_scope_narrows(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data={**GRANT, "scope": "catalog:read"}, auth=(str(row.id), secret))
    assert response.status_code == 200 and response.json()["scope"] == "catalog:read"


def test_ungranted_scope_is_invalid_scope(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data={**GRANT, "scope": "reports:read"}, auth=(str(row.id), secret))
    assert response.status_code == 400 and response.json()["error"] == "invalid_scope"


def test_wrong_secret_and_unknown_client_are_identical_401(client, session):
    row, _ = make_client(session)
    wrong = client.post(TOKEN, data=GRANT, auth=(str(row.id), "not-the-secret"))
    unknown = client.post(TOKEN, data=GRANT, auth=(str(uuid.uuid4()), "not-the-secret"))
    malformed = client.post(TOKEN, data=GRANT, auth=("not-a-uuid", "not-the-secret"))
    assert wrong.status_code == unknown.status_code == malformed.status_code == 401
    assert wrong.json() == unknown.json() == malformed.json()
    assert wrong.json()["error"] == "invalid_client"
    assert wrong.headers["www-authenticate"].startswith("Basic")


def test_missing_credentials_is_invalid_client(client):
    response = client.post(TOKEN, data=GRANT)
    assert response.status_code == 401 and response.json()["error"] == "invalid_client"


def test_wrong_resource_is_invalid_target(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data={**GRANT, "resource": "http://testserver/other"}, auth=(str(row.id), secret))
    assert response.status_code == 400 and response.json()["error"] == "invalid_target"
    ok = client.post(TOKEN, data={**GRANT, "resource": "http://testserver/mcp"}, auth=(str(row.id), secret))
    assert ok.status_code == 200


def test_unsupported_grant_type(client, session):
    row, secret = make_client(session)
    response = client.post(TOKEN, data={"grant_type": "password"}, auth=(str(row.id), secret))
    assert response.status_code == 400 and response.json()["error"] == "unsupported_grant_type"
    assert client.post(TOKEN, data={}, auth=(str(row.id), secret)).json()["error"] == "invalid_request"


def test_token_endpoint_is_rate_limited_by_caller_address(app, session):
    row, secret = make_client(session)
    with TestClient(app, client=("198.51.100.7", 50000)) as attacker, \
            TestClient(app, client=("203.0.113.9", 50000)) as partner_host:
        codes = [attacker.post(TOKEN, data=GRANT, auth=(str(row.id), "guess")).status_code for _ in range(31)]
        assert codes[:30] == [401] * 30 and codes[30] == 429
        assert attacker.post(TOKEN, data=GRANT, auth=(str(row.id), secret)).status_code == 429
        # The victim's own address isn't affected by the junk sent in its name.
        assert partner_host.post(TOKEN, data=GRANT, auth=(str(row.id), secret)).status_code == 200


def test_revoked_client(client, session, partner):
    made = partner()
    revoke_client(session, made.id)
    session.flush()
    response = client.post(TOKEN, data=GRANT, auth=(str(made.id), made.secret))
    assert response.status_code == 401 and response.json()["error"] == "invalid_client"
    with pytest.raises(InvalidPartnerToken) as error:
        verify_access_token(session, made.token, get_settings())
    assert error.value.reason == "revoked" and error.value.client_id == made.id


def test_rotate_invalidates_old_secret_and_tokens(client, session, partner):
    made = partner()
    _, new_secret = rotate_secret(session, made.id)
    session.flush()
    assert client.post(TOKEN, data=GRANT, auth=(str(made.id), made.secret)).status_code == 401
    assert client.post(TOKEN, data=GRANT, auth=(str(made.id), new_secret)).status_code == 200
    with pytest.raises(InvalidPartnerToken) as error:
        verify_access_token(session, made.token, get_settings())
    assert error.value.reason == "revoked"


def test_verify_returns_the_principal(session, partner):
    made = partner(expected_tools=("get_qualification",), rate_limit=30)
    principal = verify_access_token(session, made.token, get_settings())
    assert principal.client_id == made.id and principal.name == "TSP"
    assert principal.scopes == frozenset({"catalog:read", "recommend:run"})
    assert principal.expected_tools == ("get_qualification",) and principal.rate_limit_per_minute == 30
    assert isinstance(principal.expires_at, int)


def _signed(row, **claims):
    base = {"iss": "http://testserver", "aud": "http://testserver/mcp", "sub": str(row.id), "ver": 1,
            "scope": "catalog:read", "exp": 9999999999, **claims}
    return jwt.encode(base, mcp_signing_key(get_settings()), algorithm="HS256")


def test_expired_token_is_rejected(session):
    row, _ = make_client(session)
    with pytest.raises(InvalidPartnerToken) as error:
        verify_access_token(session, _signed(row, exp=1), get_settings())
    assert error.value.reason == "expired" and error.value.client_id == row.id


def test_wrong_audience_is_rejected(session):
    row, _ = make_client(session)
    with pytest.raises(InvalidPartnerToken) as error:
        verify_access_token(session, _signed(row, aud="http://elsewhere/mcp"), get_settings())
    assert error.value.reason == "audience"


def test_mcp_token_rejected_by_learner_api(client, partner):
    made = partner()
    assert client.get("/api/v1/me", headers=made.headers).status_code == 401


def test_learner_token_not_a_partner_token(session, learner):
    token = learner["Authorization"].split()[1]
    with pytest.raises(InvalidPartnerToken) as error:
        verify_access_token(session, token, get_settings())
    assert error.value.reason == "malformed"


def test_authorization_server_metadata(client):
    body = client.get("/.well-known/oauth-authorization-server").json()
    assert body["issuer"] == "http://testserver"
    assert body["token_endpoint"] == "http://testserver/api/v1/oauth/token"
    assert body["grant_types_supported"] == ["client_credentials"]
    assert body["token_endpoint_auth_methods_supported"] == ["client_secret_basic", "client_secret_post"]
    assert body["scopes_supported"] == list(partner_clients.SCOPES)
    assert body["response_types_supported"] == []


def run_cli(session, *argv):
    out = io.StringIO()
    cli.run_mcp_client_command(session, cli.build_parser().parse_args(["mcp-client", *argv]), out)
    session.flush()
    return out.getvalue()


def test_cli_create_prints_secret_once(client, session):
    output = run_cli(session, "create", "--name", "BSRS", "--organisation", "BSRS Office", "--purpose", "Referrals",
                     "--scopes", "catalog:read", "reports:read", "--expected-tools", "get_qualification",
                     "--rate-limit", "60")
    fields = dict(line.split(maxsplit=1) for line in output.splitlines() if line.startswith("client_"))
    assert "Store the secret now; it can't be shown again." in output
    response = client.post(TOKEN, data=GRANT, auth=(fields["client_id"].strip(), fields["client_secret"].strip()))
    assert response.status_code == 200 and response.json()["scope"] == "catalog:read reports:read"
    row = session.exec(select(ApiClient).where(ApiClient.name == "BSRS")).one()
    assert row.rate_limit_per_minute == 60 and row.expected_tools == ["get_qualification"]


def test_cli_create_with_a_taken_name_fails_without_showing_a_secret(session):
    make_client(session, name="BSRS")
    out = io.StringIO()
    args = cli.build_parser().parse_args(["mcp-client", "create", "--name", "BSRS", "--organisation", "Other",
                                          "--purpose", "x", "--scopes", "catalog:read", "--expected-tools", "t"])
    with pytest.raises(ConflictError, match="A client named BSRS already exists."):
        cli.run_mcp_client_command(session, args, out)
    assert out.getvalue() == ""


def test_cli_list_shows_no_secrets_and_revoke_works(session):
    row, secret = make_client(session)
    listing = run_cli(session, "list")
    assert str(row.id) in listing and "TSP" in listing
    assert secret not in listing and row.secret_hash not in listing
    run_cli(session, "revoke", "--client-id", str(row.id))
    assert session.get(ApiClient, row.id).is_active is False
