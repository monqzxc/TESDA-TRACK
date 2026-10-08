"""The HTTP client's contract with the API, checked against a fake transport."""
import httpx
import pytest

from api_client import ApiClient, ApiError


def client_seeing(requests: list[httpx.Request], status: int = 200, body: dict | None = None) -> ApiClient:
    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status, json=body if body is not None else {"data": {}})

    client = ApiClient("http://api.test")
    client._http = httpx.Client(base_url="http://api.test", transport=httpx.MockTransport(handle))
    return client


@pytest.mark.parametrize("call", [
    lambda api: api.bridge_matches(["welding"], client_ip="203.0.113.7"),
    lambda api: api.bridge_occupations(["welder"], client_ip="203.0.113.7"),
    lambda api: api.bridge_occupation(42, client_ip="203.0.113.7"),
])
def test_skills_bridge_calls_forward_the_learners_address(call):
    requests = []
    call(client_seeing(requests))
    assert requests[0].headers["X-Forwarded-For"] == "203.0.113.7"


def test_skills_bridge_calls_without_an_address_send_no_forwarding_header():
    requests = []
    client_seeing(requests).bridge_matches(["welding"], client_ip=None)
    assert "X-Forwarded-For" not in requests[0].headers


def test_other_calls_never_forward_an_address():
    requests = []
    client_seeing(requests, body=[]).qualifications()
    assert "X-Forwarded-For" not in requests[0].headers


@pytest.mark.parametrize("call, path", [
    (lambda api: api.training_providers(), "/api/v1/training-providers"),
    (lambda api: api.assessment_centers(), "/api/v1/assessment-centers"),
])
def test_site_lists_come_from_the_public_site_endpoints(call, path):
    requests = []
    call(client_seeing(requests, body=[]))
    assert (requests[0].method, requests[0].url.path) == ("GET", path)


def test_clients_for_different_services_report_different_base_urls():
    assert ApiClient("http://one.test").base_url != ApiClient("http://two.test").base_url


def test_rate_limited_lookup_keeps_the_apis_message():
    message = "You've made many Skills Bridge lookups in the last minute. Please wait a moment and try again."
    with pytest.raises(ApiError) as raised:
        client_seeing([], status=429, body={"detail": message}).bridge_matches(["welding"], client_ip=None)
    assert raised.value.status_code == 429 and raised.value.message == message
