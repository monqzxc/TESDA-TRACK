"""Authentication dependencies shared by the routers."""
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from tesda_track.config import get_settings
from tesda_track.db import SessionDep
from tesda_track.errors import AuthenticationError, PermissionDeniedError
from tesda_track.models import Learner
from tesda_track.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


def get_current_learner(session: SessionDep, token: Annotated[str | None, Depends(oauth2_scheme)]) -> Learner:
    if not token:
        raise AuthenticationError("Sign in to continue.")
    try:
        learner_id, token_version = decode_access_token(token, get_settings())
    except (jwt.InvalidTokenError, ValueError):
        raise AuthenticationError("Your session has expired. Please sign in again.") from None
    learner = session.get(Learner, learner_id)
    if learner is None or not learner.is_active or learner.token_version != token_version:
        raise AuthenticationError("Your session has expired. Please sign in again.")
    return learner


CurrentLearner = Annotated[Learner, Depends(get_current_learner)]


def require_admin(learner: CurrentLearner) -> Learner:
    if learner.role != "admin":
        raise PermissionDeniedError("This action requires an administrator account.")
    return learner


AdminUser = Annotated[Learner, Depends(require_admin)]
