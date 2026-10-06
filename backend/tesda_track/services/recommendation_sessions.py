"""Saved runs of the pathway finder: the learner's goal, follow-up answers, matches and pathway."""
import uuid

from sqlmodel import Session, select

from tesda_track.models import Goal, Learner, RecommendationSession
from tesda_track.schemas.analysis import Match, PathwayRecommendation, Profile
from tesda_track.schemas.records import (RecommendationSessionCreate, RecommendationSessionPublic,
                                         RecommendationSessionUpdate)
from tesda_track.services import analysis, catalog
from tesda_track.services.embeddings import Embedder
from tesda_track.services.ownership import get_owned, resolve_owned

FOLLOW_UP_FIELDS = ("experience_years", "has_certification")


def to_public(record: RecommendationSession) -> RecommendationSessionPublic:
    return RecommendationSessionPublic(
        id=record.id, goal_id=record.goal_id, query=record.query, analysis_source=record.analysis_source,
        profile=Profile.model_validate(record.profile), matches=[Match.model_validate(m) for m in record.matches],
        selected_qualification=catalog.summary(record.qualification) if record.qualification else None,
        pathway=PathwayRecommendation.model_validate(record.pathway) if record.pathway else None,
        created_at=record.created_at, updated_at=record.updated_at)


def list_for(session: Session, learner: Learner, limit: int, offset: int) -> list[RecommendationSession]:
    query = (select(RecommendationSession).where(RecommendationSession.learner_id == learner.id)
             .order_by(RecommendationSession.created_at.desc()).limit(limit).offset(offset))
    return list(session.exec(query))


def get(session: Session, learner: Learner, record_id: uuid.UUID) -> RecommendationSession:
    return get_owned(session, RecommendationSession, record_id, learner, "Recommendation session")


def start(session: Session, learner: Learner, request: RecommendationSessionCreate,
          analyzed: analysis.GoalAnalysisResult, embedder: Embedder | None = None) -> RecommendationSession:
    goal = resolve_owned(session, Goal, request.goal_id, learner, "Goal")
    refined, matches = analysis.match(session, request.query, analyzed.profile, embedder)
    record = RecommendationSession(
        learner_id=learner.id, goal_id=goal.id if goal else None, query=request.query,
        analysis_source=analyzed.source, analysis_profile=analyzed.profile.model_dump(mode="json"),
        profile=refined.model_dump(mode="json"), matches=[m.model_dump(mode="json") for m in matches])
    session.add(record)
    session.flush()
    return record


def update(session: Session, record: RecommendationSession, request: RecommendationSessionUpdate,
           embedder: Embedder | None = None) -> RecommendationSession:
    fields = request.model_fields_set
    # Start again from the original analysis so changed answers replace earlier ones.
    merged = dict(record.analysis_profile)
    for field in FOLLOW_UP_FIELDS:
        merged[field] = getattr(request, field) if field in fields else record.profile.get(field)
    refined, matches = analysis.match(session, record.query, Profile.model_validate(merged), embedder)
    if "qualification_code" in fields:
        code = request.qualification_code
        record.qualification = catalog.resolve_qualification(session, code) if code else None
    record.profile = refined.model_dump(mode="json")
    record.matches = [m.model_dump(mode="json") for m in matches]
    record.pathway = analysis.pathway(session, refined, record.qualification.code).model_dump(mode="json") \
        if record.qualification else None
    session.flush()
    return record
