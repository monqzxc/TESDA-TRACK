import uuid
from functools import lru_cache
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func
from sqlmodel import select
from tesda_track.db import SessionDep
from tesda_track.schemas.nearby_suggestions import NearbySuggestionRequest, NearbySuggestions
from tesda_track.services import nearby_suggestions
from tesda_track.services.embeddings import EmbedderDep
from tesda_track.deps import CurrentLearner, require_permission
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
    CareerGoalSelection,
)
from tesda_track.services import labor_market as service, goals, catalog, evidence_panel
from tesda_track.schemas.evidence import QualificationEvidencePanel
from tesda_track.schemas.area_qualifications import AreaQualifications
from tesda_track.services import area_qualifications
from tesda_track.services import area_jobs
from tesda_track.schemas.area_jobs import AreaJobs
from tesda_track.config import Settings, get_settings
from tesda_track.schemas.outlook import OutlookSummary, QualificationOutlook
from tesda_track.services import outlook_summary, qualification_outlook
from tesda_track.services.rate_limit import client_address_key
from tesda_track.schemas.labor_market import ReviewInput, DatasetStatusInput
from tesda_track.schemas.records import GoalCreate, GoalUpdate, GoalPublic
from tesda_track.errors import InvalidRequestError

router = APIRouter(prefix="/labor-market", tags=["labor market"])
admin_router = APIRouter(
    prefix="/admin/labor-market",
    tags=["admin: labor market"],
    dependencies=[Depends(require_permission("labor-market:review"))],
)
goal_router = APIRouter(prefix="/me/goals", tags=["goals"])
SettingsDep = Annotated[Settings, Depends(get_settings)]
QualificationCode = Annotated[str, Query(min_length=1, max_length=40)]
RegionCode = Annotated[str | None, Query(max_length=20)]


@lru_cache
def _writer_for(api_key: str, model: str, timeout_seconds: float) -> outlook_summary.ClaudeWriter:
    # One client for every request, so its connections are reused.
    return outlook_summary.ClaudeWriter(api_key, model, timeout_seconds)


def summary_writer(settings: SettingsDep) -> outlook_summary.SummaryWriter | None:
    """Claude, or None when the deployment hasn't turned AI-written summaries on."""
    if not (settings.outlook_ai_summary_enabled and settings.anthropic_api_key):
        return None
    return _writer_for(settings.anthropic_api_key.get_secret_value(), settings.outlook_summary_model,
                       settings.outlook_summary_timeout_seconds)


@router.get("/indicators")
def public_indicators(
    session: SessionDep,
    qualification_code: str = Query(min_length=1, max_length=40),
    region_code: str | None = None,
) -> dict:
    return dict(
        items=service.indicators(session, qualification_code, region_code),
        postings=service.observed_postings(session, qualification_code, region_code),
        region_code=region_code,
        note="Only explicitly approved mappings from active forecast periods are shown. National evidence is not regional evidence.",
    )


@router.get("/evidence", response_model=QualificationEvidencePanel)
def qualification_evidence(
    session: SessionDep,
    qualification_code: str = Query(min_length=1, max_length=40),
    region_code: str | None = None,
) -> QualificationEvidencePanel:
    return evidence_panel.build(session, qualification_code, region_code)


@router.get("/qualifications", response_model=AreaQualifications)
def area_qualification_evidence(
    session: SessionDep,
    region_code: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AreaQualifications:
    """Reviewed qualification links for an area; observations and forecasts stay separate."""
    return area_qualifications.discover(session, region_code, limit=limit, offset=offset)


@router.get("/jobs", response_model=AreaJobs)
def area_job_evidence(
    session: SessionDep,
    region_code: str | None = None,
    locality: str | None = Query(default=None, max_length=120),
    qualification_code: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AreaJobs:
    return area_jobs.discover(session, region_code, locality, qualification_code, limit=limit, offset=offset)


@router.get("/outlook", response_model=QualificationOutlook)
def qualification_outlook_view(
    session: SessionDep,
    settings: SettingsDep,
    writer: Annotated[outlook_summary.SummaryWriter | None, Depends(summary_writer)],
    qualification_code: QualificationCode,
    region_code: RegionCode = None,
    home_region_code: RegionCode = None,
    relocate: bool = False,
) -> QualificationOutlook:
    """One qualification across the regions: posting records beside the recorded training and assessment centers,
    each region's balance of the two, and the analysis of `region_code` in plain words. `home_region_code` is the
    learner's own region and `relocate` whether they would move; both only change the wording. No sign-in needed,
    and no learner input or coordinates are read."""
    return qualification_outlook.build(session, qualification_code, region_code, home_region_code, relocate,
                                       ai_summary_available=writer is not None,
                                       include_examples=settings.outlook_include_example_sites)


@router.post("/suggestions", response_model=NearbySuggestions)
def nearby_suggestions_view(request: NearbySuggestionRequest, session: SessionDep,
                            embedder: EmbedderDep) -> NearbySuggestions:
    """A few other qualifications in demand in the learner's region, ranked by demand and how well they fit the
    learner's skills, each with its reasons (Card 4). An empty list means none is in demand there. The skills are in
    the body and are neither stored nor logged; no sign-in needed."""
    return nearby_suggestions.suggest(session, request, embedder)


@router.get("/outlook/summary", response_model=OutlookSummary)
def qualification_outlook_summary(
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
    writer: Annotated[outlook_summary.SummaryWriter | None, Depends(summary_writer)],
    qualification_code: QualificationCode,
    region_code: RegionCode = None,
    home_region_code: RegionCode = None,
    relocate: bool = False,
) -> OutlookSummary:
    """The outlook's analysis as one short paragraph. `source` is "ai" when Claude wrote it from the counts
    (OUTLOOK_AI_SUMMARY_ENABLED), and "rules" when AI summaries are off, busy or unavailable: the same analysis in
    the rules' own words."""
    outlook = qualification_outlook.build(session, qualification_code, region_code, home_region_code, relocate,
                                          ai_summary_available=writer is not None,
                                          include_examples=settings.outlook_include_example_sites)
    limits = request.app.state.outlook_summary_limits

    def allow_request() -> bool:
        # A learner behind a busy address, or a burst from everyone, reads the rules' words rather than waiting.
        return not (limits.hit(client_address_key(request), settings.outlook_summary_rate_limit_per_minute)
                    or limits.hit("*", settings.outlook_summary_upstream_per_minute))

    return outlook_summary.summarize(session, outlook, writer, allow_request=allow_request,
                                     ttl_seconds=settings.outlook_summary_cache_ttl_seconds)


@admin_router.get("/mappings")
def mappings(
    session: SessionDep,
    status: Literal["pending", "approved", "rejected"] | None = None,
    confidence: Literal["high_confidence", "needs_review", "rejected"] | None = None,
    classification: (
        Literal["in_demand", "hard_to_fill", "observed_posting", "cross_cutting"] | None
    ) = None,
    search: str = Query(default="", max_length=200),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    statement = (
        select(Mapping, Evidence, Dataset, Qualification)
        .join(Evidence, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .join(Qualification, Mapping.qualification_id == Qualification.id)
    )
    if status:
        statement = statement.where(Mapping.decision == status)
    if confidence:
        statement = statement.where(Mapping.proposal == confidence)
    if classification:
        statement = statement.where(Evidence.classification == classification)
    if search:
        statement = statement.where(Evidence.occupation_title.ilike("%" + search + "%"))
    total = session.exec(select(func.count()).select_from(statement.subquery())).one()
    rows = session.exec(
        statement.order_by(Mapping.id).offset(offset).limit(limit)
    ).all()
    return dict(
        total=total,
        limit=limit,
        offset=offset,
        items=[service.mapping_public(session, *r) for r in rows],
    )


@admin_router.post("/mappings/{mapping_id}/review")
def review_mapping(
    mapping_id: int, body: ReviewInput, session: SessionDep, actor: CurrentLearner
) -> dict:
    row = service.decide(session, mapping_id, body, actor)
    session.commit()
    return dict(id=row.id, decision=row.decision)


@admin_router.get("/datasets")
def datasets(session: SessionDep) -> list[dict]:
    return [
        d.model_dump(mode="json")
        for d in session.exec(select(Dataset).order_by(Dataset.id)).all()
    ]


@admin_router.post("/datasets/{dataset_id}/status")
def dataset_status(
    dataset_id: int,
    body: DatasetStatusInput,
    session: SessionDep,
    actor: CurrentLearner,
) -> dict:
    row = service.set_dataset_status(session, dataset_id, body.status, body.note, actor)
    session.commit()
    return dict(id=row.id, status=row.status)


@goal_router.put("/career-selection/{journey_key}", response_model=GoalPublic)
def career_selection(
    journey_key: uuid.UUID,
    body: GoalCreate,
    session: SessionDep,
    learner: CurrentLearner,
):
    # Serialise writes for one account. Repeated requests for a journey update one owned Goal.
    from tesda_track.models import Learner

    session.exec(
        select(Learner).where(Learner.id == learner.id).with_for_update()
    ).one()
    if not body.target_qualification_code:
        raise InvalidRequestError("Choose a qualification for the occupation.")
    q = catalog.resolve_qualification(session, body.target_qualification_code)
    key = service.job_key(body.title)
    permitted = key in {service.job_key(j) for j in catalog.to_public(q).possible_jobs}
    if not permitted:
        permitted = (
            session.exec(
                select(Mapping.id)
                .join(Evidence, Mapping.evidence_id == Evidence.id)
                .join(Dataset, Evidence.dataset_id == Dataset.id)
                .where(
                    Mapping.qualification_id == q.id,
                    Mapping.decision == "approved",
                    Mapping.proposal == "high_confidence",
                    Evidence.normalized_title == key,
                    Dataset.status == "active",
                )
            ).first()
            is not None
        )
    if not permitted:
        raise InvalidRequestError(
            "Occupation is not associated with this qualification."
        )
    selection = session.exec(
        select(CareerGoalSelection).where(
            CareerGoalSelection.learner_id == learner.id,
            CareerGoalSelection.journey_key == journey_key,
        )
    ).first()
    if selection:
        goal = goals.get(session, learner, selection.goal_id)
        goal = goals.update(
            session,
            goal,
            GoalUpdate(
                title=body.title, target_qualification_code=q.code, status="active"
            ),
        )
    else:
        goal = goals.create(session, learner, body)
        session.add(
            CareerGoalSelection(
                learner_id=learner.id, journey_key=journey_key, goal_id=goal.id
            )
        )
    session.commit()
    return goals.to_public(goal)
