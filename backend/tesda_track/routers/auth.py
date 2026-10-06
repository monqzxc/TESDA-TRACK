from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from tesda_track.config import get_settings
from tesda_track.db import SessionDep
from tesda_track.schemas.accounts import LearnerPublic, RegisterRequest, TokenResponse
from tesda_track.security import create_access_token
from tesda_track.services import accounts

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=LearnerPublic, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, session: SessionDep):
    learner = accounts.register(session, request)
    session.commit()
    return learner


@router.post("/token", response_model=TokenResponse)
def sign_in(form: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep):
    """OAuth2 password flow: send the email as `username`."""
    settings = get_settings()
    learner = accounts.authenticate(session, form.username, form.password, settings)
    token, expires_in = create_access_token(learner.id, learner.token_version, settings)
    return TokenResponse(access_token=token, expires_in=expires_in)
