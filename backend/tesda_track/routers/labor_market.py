import uuid
from typing import Literal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import select
from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, require_permission
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
    CareerGoalSelection,
)
from tesda_track.services import labor_market as service, goals, catalog
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
