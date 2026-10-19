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

    @property
    def base_url(self) -> str:
        """Identifies the service, e.g. to keep cached responses from different services apart."""
        return str(self._http.base_url)

    def _request(self, method: str, path: str, token: str | None = None,
                 bridge_request: bool = False, client_ip: str | None = None, **kwargs) -> Any:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        if client_ip:
            # Streamlit calls the API server-side, so without this every learner would share one rate limit.
            headers["X-Forwarded-For"] = client_ip
        try:
            response = self._http.request(method, path, headers=headers, **kwargs)
        except httpx.TransportError as error:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE) from error
        if bridge_request and response.status_code == 503:
            # This router returns curated provider errors; other server errors stay generic.
            raise ApiError(_detail(response), response.status_code)
        if response.status_code >= 500:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE, response.status_code)
        if response.status_code >= 400:
            raise ApiError(_detail(response), response.status_code)
        return response.json() if response.content else None

    def qualifications(self) -> list[dict]:
        return self._request("GET", "/api/v1/qualifications")

    def bridge_matches(self, skills: list[str], client_ip: str | None = None) -> dict:
        return self._request("POST", "/api/v1/skills-bridge/matches", json={"skills": skills},
                             bridge_request=True, client_ip=client_ip, timeout=60)

    def bridge_occupations(self, occupations: list[str], client_ip: str | None = None) -> dict:
        return self._request("POST", "/api/v1/skills-bridge/occupations/search",
                             json={"occupations": occupations}, bridge_request=True, client_ip=client_ip,
                             timeout=60)

    def bridge_occupation(self, occupation_id: int, client_ip: str | None = None) -> dict:
        return self._request("GET", f"/api/v1/skills-bridge/occupations/{occupation_id}",
                             bridge_request=True, client_ip=client_ip, timeout=60)

    def analyze_goal(self, query: str) -> dict:
        return self._request("POST", "/api/v1/analysis/goal", json={"query": query})

    def match(self, query: str, profile: dict, *, assessment: dict | None = None,
              assessment_id: str | None = None, token: str | None = None) -> dict:
        body = {"query": query, "profile": profile}
        if assessment is not None:
            body["assessment"] = assessment
        if assessment_id is not None:
            body["assessment_id"] = assessment_id
        return self._request("POST", "/api/v1/analysis/matches", token, json=body)

    def pathway(self, profile: dict, qualification_code: str) -> dict:
        return self._request("POST", "/api/v1/analysis/pathway",
                             json={"profile": profile, "qualification_code": qualification_code})

    def readiness(self, qualification_code: str, answers: dict[int, str]) -> dict:
        return self._request("POST", "/api/v1/analysis/readiness",
                             json={"qualification_code": qualification_code, "answers": answers})

    def pathways(self, qualification_code: str, route: str) -> list[dict]:
        """The curated pathways for a qualification on one recommendation route."""
        return self._request("GET", "/api/v1/pathways", params={"qualification_code": qualification_code, "route": route})

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
    def start_session(self, token: str, query: str, *, assessment_id: str | None = None,
                      assessment: dict | None = None, request_id: str | None = None) -> dict:
        body = {"query": query}
        if request_id is not None:
            body["request_id"] = request_id
        if assessment is not None:
            body["assessment"] = assessment
        if assessment_id is not None:
            body["assessment_id"] = assessment_id
        return self._request("POST", "/api/v1/me/recommendations", token, json=body)

    def create_learner_assessment(self, token: str, answers: dict, *, request_id: str | None = None) -> dict:
        body = {"answers": answers}
        if request_id is not None:
            body["request_id"] = request_id
        return self._request("POST", "/api/v1/learner-assessments", token, json=body)

    def assessment_qualifications(self, answers: dict, token: str | None = None) -> dict:
        return self._request("POST", "/api/v1/recommendations/qualifications", token, json={"assessment": answers})

    def revise_learner_assessment(self, token: str, assessment_id: str, answers: dict, *, request_id: str | None = None) -> dict:
        body = {"answers": answers}
        if request_id is not None:
            body["request_id"] = request_id
        return self._request("PATCH", f"/api/v1/learner-assessments/{assessment_id}", token, json=body)

    def learner_assessments(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/learner-assessments", token)

    def get_learner_assessment(self, token: str, assessment_id: str) -> dict:
        return self._request("GET", f"/api/v1/learner-assessments/{assessment_id}", token)

    def delete_learner_assessment(self, token: str, assessment_id: str) -> None:
        self._request("DELETE", f"/api/v1/learner-assessments/{assessment_id}", token)

    def update_session(self, token: str, session_id: str, **fields) -> dict:
        return self._request("PATCH", f"/api/v1/me/recommendations/{session_id}", token, json=fields)

    def sessions(self, token: str, limit: int = 10) -> list[dict]:
        return self._request("GET", "/api/v1/me/recommendations", token, params={"limit": limit})

    def get_session(self, token: str, session_id: str) -> dict:
        return self._request("GET", f"/api/v1/me/recommendations/{session_id}", token)

    def submit_readiness(self, token: str, qualification_code: str, answers: dict[int, str],
                         session_id: str | None = None, *, request_id: str | None = None) -> dict:
        body = {"qualification_code": qualification_code, "answers": answers, "recommendation_session_id": session_id}
        if request_id is not None:
            body["request_id"] = request_id
        return self._request("POST", "/api/v1/me/readiness-checks", token, json=body)

    def readiness_checks(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/readiness-checks", token)

    def goals(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/goals", token)

    def add_goal(self, token: str, title: str, target_qualification_code: str | None = None) -> dict:
        return self._request("POST", "/api/v1/me/goals", token,
                             json={"title": title, "target_qualification_code": target_qualification_code})

    def update_goal(self, token: str, goal_id: str, **fields) -> dict:
        return self._request("PATCH", f"/api/v1/me/goals/{goal_id}", token, json=fields)

    # Pathways, training and assessment
    def regions(self) -> list[dict]:
        return self._request("GET", "/api/v1/regions")

    def rank_training(self, token: str | None = None, **body) -> dict:
        """Ranked programs with score components; the goal goes in the body, never in a URL."""
        return self._request("POST", "/api/v1/recommendations/training", token, json=body)

    def rank_assessments(self, token: str | None = None, **body) -> dict:
        return self._request("POST", "/api/v1/recommendations/assessments", token, json=body)

    def saved_ranking(self, token: str, audit_id: int) -> dict:
        return self._request("GET", f"/api/v1/recommendations/{audit_id}", token)

    def training_providers(self) -> list[dict]:
        """Every active training provider, with its location when one is on file."""
        return self._request("GET", "/api/v1/training-providers")

    def assessment_centers(self) -> list[dict]:
        """Every active assessment center, with its location when one is on file."""
        return self._request("GET", "/api/v1/assessment-centers")

    def training_programs(self, **params) -> list[dict]:
        """Public training listings, optionally filtered to a qualification and region."""
        return self._request("GET", "/api/v1/training-programs", params=params)

    def schedules(self, **params) -> list[dict]:
        return self._request("GET", "/api/v1/assessment-schedules", params=params)

    def follow_pathway(self, token: str, pathway_id: int) -> dict:
        return self._request("POST", "/api/v1/me/pathways", token, json={"pathway_id": pathway_id})

    def my_pathways(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/pathways", token)

    def set_step_status(self, token: str, enrollment_id: str, step_id: int, status: str) -> dict:
        return self._request("PATCH", f"/api/v1/me/pathways/{enrollment_id}/steps/{step_id}", token,
                             json={"status": status})

    def apply_for_assessment(self, token: str, schedule_id: int, *, request_id: str | None = None) -> dict:
        body = {"schedule_id": schedule_id}
        if request_id is not None:
            body["request_id"] = request_id
        return self._request("POST", "/api/v1/me/assessment-applications", token, json=body)

    def my_applications(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/assessment-applications", token)

    def withdraw_application(self, token: str, application_id: str) -> dict:
        return self._request("POST", f"/api/v1/me/assessment-applications/{application_id}/withdraw", token)

    # Administrator reports
    def report(self, token: str, name: str, **params):
        return self._request("GET", f"/api/v1/admin/reports/{name}", token, params=params)

    def certifications(self, token: str) -> list[dict]:
        return self._request("GET", "/api/v1/me/certifications", token)

    def add_certification(self, token: str, **fields) -> dict:
        return self._request("POST", "/api/v1/me/certifications", token, json=fields)
