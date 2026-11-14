"""The mock TESDA Skill Passport's sign-in (docs/tsp-mock.md): a synthetic account's username and password in, a
one-time handoff code out, shaped like Hercules' POST /v1/tracker/handoff answer. The page then posts the code to
POST /api/v1/auth/tsp/session, exactly as it does with a code from the real TSP. 404 unless TSP_MOCK_ENABLED and
TSP_SIGN_IN_ENABLED are both on.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from tesda_track.config import Settings
from tesda_track.deps import RequestedWith
from tesda_track.errors import AuthenticationError, NotFoundError
from tesda_track.routers.tsp_auth import EnabledSettings, limit_attempts
from tesda_track.services import tsp_mock

router = APIRouter(prefix="/tsp-mock", tags=["auth"])


def mock_settings(settings: EnabledSettings) -> Settings:
    if not settings.tsp_mock_enabled:
        raise NotFoundError("Not Found")
    return settings


class MockHandoffRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    state: str | None = Field(default=None, max_length=128, description="Returned unchanged, as Hercules does.")


class MockHandoff(BaseModel):
    code: str
    state: str | None
    expires_in: int


class MockHandoffResponse(BaseModel):
    success: Literal[True] = True
    data: MockHandoff


@router.post("/handoff", response_model=MockHandoffResponse, dependencies=[RequestedWith, Depends(limit_attempts)],
             responses={401: {"description": "Wrong username or password."}})
def mock_handoff(body: MockHandoffRequest, settings: Annotated[Settings, Depends(mock_settings)]):
    """Sign in to the mock TSP with a synthetic account and get the handoff code TSP would hand the page."""
    code = tsp_mock.issue_code(settings, body.username, body.password)
    if code is None:
        raise AuthenticationError("Incorrect TSP username or password.")
    return MockHandoffResponse(data=MockHandoff(code=code, state=body.state,
                                                expires_in=tsp_mock.CODE_LIFETIME_SECONDS))
