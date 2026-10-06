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

    # Accounts
    def register(self, email: str, password: str, full_name: str, privacy_consent: bool) -> dict:
        return self._request("POST", "/api/v1/auth/register", json={
            "email": email, "password": password, "full_name": full_name, "privacy_consent": privacy_consent})

    def sign_in(self, email: str, password: str) -> str:
        return self._request("POST", "/api/v1/auth/token", data={"username": email, "password": password})["access_token"]

    def me(self, token: str) -> dict:
        return self._request("GET", "/api/v1/me", token)

    def export_my_data(self, token: str) -> dict:
        return self._request("GET", "/api/v1/me/export", token)

    def delete_account(self, token: str) -> None:
        self._request("DELETE", "/api/v1/me", token)

    # Records of a signed-in learner
    def start_session(self, token: str, query: str, use_ai: bool = False) -> dict:
        return self._request("POST", "/api/v1/me/recommendations", token, json={"query": query, "use_ai": use_ai})

    def update_session(self, token: str, session_id: str, **fields) -> dict:
        return self._request("PATCH", f"/api/v1/me/recommendations/{session_id}", token, json=fields)

    def sessions(self, token: str, limit: int = 10) -> list[dict]:
        return self._request("GET", "/api/v1/me/recommendations", token, params={"limit": limit})

    def submit_readiness(self, token: str, qualification_code: str, answers: dict[int, str],
                         session_id: str | None = None) -> dict:
        return self._request("POST", "/api/v1/me/readiness-checks", token, json={
            "qualification_code": qualification_code, "answers": answers, "recommendation_session_id": session_id})

    def readiness_checks(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/readiness-checks", token)

    def goals(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/goals", token)

    def add_goal(self, token: str, title: str, target_qualification_code: str | None = None) -> dict:
        return self._request("POST", "/api/v1/me/goals", token,
                             json={"title": title, "target_qualification_code": target_qualification_code})

    def update_goal(self, token: str, goal_id: str, **fields) -> dict:
        return self._request("PATCH", f"/api/v1/me/goals/{goal_id}", token, json=fields)

    def certifications(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/certifications", token)

    def add_certification(self, token: str, **fields) -> dict:
        return self._request("POST", "/api/v1/me/certifications", token, json=fields)
