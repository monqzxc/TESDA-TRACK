"""Signing learners in from TESDA Skill Passport's WebView (docs/contracts/tsp-tracker-embed/CONTRACT.md).

The page posts the one-time code TSP handed it. A learner already linked is signed in with the usual session
cookie; a first visit answers 202 and waits for the learner's consent. Errors carry the contract's error `code`,
which the page passes on to TSP. GET /profile gives the signed-in learner's Skill
Passport back to the page, which adds it to what "Find my match" sends. Every route answers 404 while
TSP_SIGN_IN_ENABLED is off.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from tesda_track.config import Settings, get_settings
from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, RequestedWith
from tesda_track.errors import NotFoundError, TspSignInError
from tesda_track.models import Learner
from tesda_track.schemas.accounts import LearnerPublic, SessionResponse
from tesda_track.schemas.tsp_auth import (TspConsentRequest, TspConsentRequired, TspConsentSummary, TspProfile,
                                          TspSessionRequest)
from tesda_track.security import create_access_token, set_session_cookie
from tesda_track.services import tsp_sign_in
from tesda_track.services.hercules import HerculesClient
from tesda_track.services.rate_limit import client_address_key

router = APIRouter(prefix="/auth/tsp", tags=["auth"])
# Every WebView open signs in again, and a training center's class or a mobile carrier's NAT shares one address;
# codes are single-use and minted by TSP, so this only keeps one address from flooding Hercules.
RATE_LIMIT_PER_MINUTE = 60


def enabled_settings(settings: Annotated[Settings, Depends(get_settings)]) -> Settings:
    if not settings.tsp_sign_in_enabled:
        raise NotFoundError("Not Found")
    return settings


EnabledSettings = Annotated[Settings, Depends(enabled_settings)]


def hercules_client(settings: EnabledSettings) -> HerculesClient:
    return HerculesClient(settings)


def limit_attempts(request: Request) -> None:
    if request.app.state.tsp_sign_in_limits.hit(client_address_key(request), RATE_LIMIT_PER_MINUTE):
        raise TspSignInError("unavailable", status.HTTP_429_TOO_MANY_REQUESTS,
                             "Too many sign-in attempts. Please try again in a minute.")


Guards = [Depends(enabled_settings), RequestedWith, Depends(limit_attempts)]


@router.post("/session", response_model=SessionResponse, dependencies=Guards,
             responses={202: {"model": TspConsentRequired, "description": "First visit: ask for consent."}})
def start_tsp_session(body: TspSessionRequest, response: Response, session: SessionDep, settings: EnabledSettings,
                      client: Annotated[HerculesClient, Depends(hercules_client)]):
    """Sign in with a TSP handoff code. The session is set as the HttpOnly cookie, as for POST /auth/session."""
    result = tsp_sign_in.sign_in(session, client, body.code)
    session.commit()
    if isinstance(result, tsp_sign_in.ConsentRequired):
        required = TspConsentRequired(pending_id=result.pending_id,
                                      summary=TspConsentSummary(name=result.name, keeps=result.keeps))
        return JSONResponse(required.model_dump(mode="json"), status_code=status.HTTP_202_ACCEPTED)
    return _start_session(result, response, settings)


@router.post("/consent", response_model=SessionResponse, dependencies=Guards,
             responses={204: {"description": "Declined: nothing was kept."}})
def answer_tsp_consent(body: TspConsentRequest, response: Response, session: SessionDep, settings: EnabledSettings):
    learner = tsp_sign_in.consent(session, body.pending_id, body.accept)
    session.commit()
    if learner is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return _start_session(learner, response, settings)


@router.get("/profile", response_model=TspProfile, dependencies=[Depends(enabled_settings)],
            responses={404: {"description": "The learner isn't linked to a Skill Passport."}})
def read_tsp_profile(learner: CurrentLearner, session: SessionDep):
    """What the learner's Skill Passport held at their last sign-in. Refreshed each time they sign in from TSP."""
    profile = tsp_sign_in.linked_profile(session, learner)
    if profile is None:
        raise NotFoundError("This account isn't linked to a Skill Passport.")
    return TspProfile(**tsp_sign_in.profile_labels(profile))


def _start_session(learner: Learner, response: Response, settings: Settings) -> SessionResponse:
    token, expires_in = create_access_token(learner.id, learner.token_version, settings)
    set_session_cookie(response, token, expires_in, settings)
    return SessionResponse(learner=LearnerPublic.model_validate(learner), expires_in=expires_in)
