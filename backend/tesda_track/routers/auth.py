from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.db import SessionDep
from tesda_track.deps import RequestedWith
from tesda_track.models import Learner
from tesda_track.schemas.accounts import LearnerPublic, RegisterRequest, SessionResponse, TokenResponse
from tesda_track.security import clear_session_cookie, create_access_token, set_session_cookie
from tesda_track.services import accounts

router = APIRouter(prefix="/auth", tags=["auth"])
SignInForm = Annotated[OAuth2PasswordRequestForm, Depends()]


@router.post("/register", response_model=LearnerPublic, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, session: SessionDep):
    learner = accounts.register(session, request)
    session.commit()
    return learner


def _sign_in(form: OAuth2PasswordRequestForm, session: Session) -> tuple[Learner, str, int]:
    """The checks both sign-in routes share, lockout included."""
    settings = get_settings()
    learner = accounts.authenticate(session, form.username, form.password, settings)
    token, expires_in = create_access_token(learner.id, learner.token_version, settings)
    return learner, token, expires_in


@router.post("/token", response_model=TokenResponse)
def sign_in(form: SignInForm, session: SessionDep):
    """OAuth2 password flow: send the email as `username`."""
    _, token, expires_in = _sign_in(form, session)
    return TokenResponse(access_token=token, expires_in=expires_in)


# Both session routes need X-Requested-With, like every write made with the cookie. On sign-in it stops another
# site from signing the browser into a different account; on sign-out it keeps the rule the same everywhere.
@router.post("/session", response_model=SessionResponse, dependencies=[RequestedWith])
def start_session(form: SignInForm, session: SessionDep, response: Response):
    """Sign in for the browser app: send the email as `username`. The access token is set as an HttpOnly cookie
    and isn't in the response."""
    learner, token, expires_in = _sign_in(form, session)
    set_session_cookie(response, token, expires_in, get_settings())
    return SessionResponse(learner=LearnerPublic.model_validate(learner), expires_in=expires_in)


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequestedWith])
def end_session():
    """Sign out of the browser app. Works signed out too."""
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response, get_settings())
    return response
