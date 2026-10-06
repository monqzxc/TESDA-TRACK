"""Thin HTTP client for the TESDA-TRACK API. The Streamlit app never talks to the database directly."""
from typing import Any

import httpx

UNAVAILABLE_MESSAGE = "We can't reach the TESDA-TRACK service right now. Please try again shortly."


class ApiError(Exception):
    """A request the API rejected; `message` is safe to show to the learner."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ApiUnavailableError(ApiError):
    pass


def _detail(response: httpx.Response) -> str:
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):  # FastAPI validation errors
        return " ".join(item.get("msg", "") for item in detail if isinstance(item, dict)) or "Please check your input."
    return "The request could not be completed."


class ApiClient:
    def __init__(self, base_url: str, timeout: float = 30):
        self._http = httpx.Client(base_url=base_url, timeout=timeout)

    def _request(self, method: str, path: str, token: str | None = None, **kwargs) -> Any:
        headers = {"Authorization": f"Bearer {token}"} if token else None
        try:
            response = self._http.request(method, path, headers=headers, **kwargs)
        except httpx.TransportError as error:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE) from error
        if response.status_code >= 500:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE, response.status_code)
        if response.status_code >= 400:
            raise ApiError(_detail(response), response.status_code)
        return response.json() if response.content else None

    def qualifications(self) -> list[dict]:
        return self._request("GET", "/api/v1/qualifications")

    def analyze_goal(self, query: str, use_ai: bool = False) -> dict:
        return self._request("POST", "/api/v1/analysis/goal", json={"query": query, "use_ai": use_ai})

    def match(self, query: str, profile: dict) -> dict:
        return self._request("POST", "/api/v1/analysis/matches", json={"query": query, "profile": profile})

    def pathway(self, profile: dict, qualification_code: str) -> dict:
        return self._request("POST", "/api/v1/analysis/pathway",
                             json={"profile": profile, "qualification_code": qualification_code})

    def readiness(self, qualification_code: str, answers: dict[int, str]) -> dict:
        return self._request("POST", "/api/v1/analysis/readiness",
                             json={"qualification_code": qualification_code, "answers": answers})
