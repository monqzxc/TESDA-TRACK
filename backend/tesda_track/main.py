import logging
import threading
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.db import get_engine
from tesda_track.errors import AuthenticationError, DomainError, SessionCookieError
from tesda_track.routers import (analysis, assessments, auth, certifications, feedback, goals, health, integrations,
                                 me, meta, pathways, qualifications, readiness_checks, recommendation_sessions,
                                 recommendations, reports, routes, skills_bridge, training)
from tesda_track.security import clear_session_cookie
from tesda_track.services import cache
from tesda_track.services.embeddings import get_embedder
from tesda_track.services.rate_limit import RateLimiter

logger = logging.getLogger("tesda_track")
CACHE_PURGE_INTERVAL_SECONDS = 600


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the embedding model in the background so the first learner doesn't wait for it.
    threading.Thread(target=get_embedder, name="embedding-warmup", daemon=True).start()
    stop = threading.Event()
    threading.Thread(target=cache.purge_until_stopped, name="cache-purge", daemon=True,
                     args=(lambda: Session(get_engine()), stop, CACHE_PURGE_INTERVAL_SECONDS)).start()
    yield
    stop.set()


def create_app() -> FastAPI:
    settings = get_settings()
    logger.setLevel(settings.log_level)
    app = FastAPI(
        title="TESDA-TRACK API", version="1.0.0", lifespan=lifespan,
        description="Training and assessment pathway recommendations backed by PostgreSQL.",
        docs_url="/api/docs" if settings.docs_enabled else None,
        openapi_url="/api/openapi.json" if settings.docs_enabled else None, redoc_url=None,
    )
    app.state.skills_bridge_limits = skills_bridge.BridgeLimits()
    app.state.route_limits = routes.RouteLimits()
    app.state.feedback_limits = RateLimiter()
    routes.hide_coordinates_in_access_log()
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                           allow_headers=["Authorization", "Content-Type"])

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        headers = {"WWW-Authenticate": "Bearer"} if isinstance(error, AuthenticationError) else None
        response = JSONResponse({"detail": error.detail}, status_code=error.status_code, headers=headers)
        if isinstance(error, SessionCookieError):
            clear_session_cookie(response, settings)
        return response

    @app.exception_handler(OperationalError)
    async def database_unavailable(request: Request, error: OperationalError):
        # Request bodies are never logged: they can contain learners' personal information.
        logger.error("Database unavailable during %s %s: %s", request.method, request.url.path,
                     type(error.orig).__name__)
        return JSONResponse({"detail": "The service is temporarily unavailable. Please try again shortly."},
                            status_code=503)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception):
        logger.exception("Unhandled error during %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)

    app.include_router(health.router)
    api = APIRouter(prefix="/api/v1")
    for router in (qualifications.router, analysis.router, feedback.router, auth.router, me.router, goals.router,
                   recommendation_sessions.router, readiness_checks.router, certifications.router,
                   pathways.router, pathways.learner_router, training.router, assessments.router,
                   assessments.learner_router, recommendations.router, pathways.admin_router, training.admin_router,
                   assessments.admin_router, integrations.router, reports.router, skills_bridge.router,
                   routes.router, meta.router):
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
