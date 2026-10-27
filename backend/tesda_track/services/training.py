from sqlalchemy import null
from sqlalchemy.orm import object_session, selectinload
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import Qualification, TrainingProgram, TrainingProvider
from tesda_track.schemas.delivery import (ProgramSearch, SiteSummary, TrainingProgramCreate, TrainingProgramPublic,
                                          TrainingProgramUpdate, TrainingProviderCreate)
from tesda_track.services import catalog, geo, sites, verification
from tesda_track.services.provenance import validate_update

PROGRAM_REQUIRED_FIELDS = {"title", "delivery_mode", "scholarship_available", "is_active"}


def program_public(program: TrainingProgram, distance_km: float | None = None) -> TrainingProgramPublic:
    session = object_session(program)
    record = verification.get(session, "training", program.provider_id, program.qualification_id) if session else None
    return TrainingProgramPublic(
        provenance=program.provenance,
        verification=verification.public(record), availability=verification.availability(program),
        id=program.id, title=program.title, description=program.description,
        qualification=catalog.summary(program.qualification), provider=SiteSummary.model_validate(program.provider),
        delivery_mode=program.delivery_mode, duration_hours=program.duration_hours, cost=program.cost,
        scholarship_available=program.scholarship_available, start_date=program.start_date,
        end_date=program.end_date, slots=program.slots, is_active=program.is_active,
        distance_km=round(distance_km, 1) if distance_km is not None else None)


def list_providers(session: Session, region_code: str | None) -> list[TrainingProvider]:
    query = select(TrainingProvider).where(TrainingProvider.is_active)
    if region_code:
        query = query.where(TrainingProvider.region_code == region_code)
    return list(session.exec(query.order_by(TrainingProvider.name)))


def get_provider(session: Session, provider_id: int, active_only: bool = True) -> TrainingProvider:
    provider = session.get(TrainingProvider, provider_id)
    if provider is None or (active_only and not provider.is_active):
        raise NotFoundError("Training provider was not found.")
    return provider


def create_provider(session: Session, request: TrainingProviderCreate) -> TrainingProvider:
    sites.require_region(session, request.region_code)
    provider = TrainingProvider(**request.model_dump())
    session.add(provider)
    session.flush()
    return provider


def get_program(session: Session, program_id: int, active_only: bool = True) -> TrainingProgram:
    program = session.get(TrainingProgram, program_id)
    if program is None or (active_only and not (program.is_active and program.provider.is_active)):
        raise NotFoundError("Training program was not found.")
    return program


def create_program(session: Session, request: TrainingProgramCreate) -> TrainingProgram:
    provider = session.get(TrainingProvider, request.provider_id)
    if provider is None:
        raise InvalidRequestError("Training provider was not found.")
    program = TrainingProgram(provider=provider, qualification=catalog.resolve_qualification(session, request.qualification_code),
                              **request.model_dump(exclude={"provider_id", "qualification_code"}))
    session.add(program)
    session.flush()
    return program


def update_program(session: Session, program: TrainingProgram, request: TrainingProgramUpdate) -> TrainingProgram:
    validate_update(program, request)
    verification.validate_availability_update(program, request)
    fields = request.model_fields_set
    start = request.start_date if "start_date" in fields else program.start_date
    end = request.end_date if "end_date" in fields else program.end_date
    if start and end and end < start:
        raise InvalidRequestError("The end date can't be before the start date.")
    needs_review = verification.availability_needs_review(program, request,
        {"start_date", "end_date", "title", "slots", "delivery_mode", "cost", "is_active"})
    for field in fields:
        value = getattr(request, field)
        if value is None and field in PROGRAM_REQUIRED_FIELDS:
            continue
        setattr(program, field, value)
    if needs_review:
        program.availability_status = "unknown"
    session.flush()
    return program


def search_programs(session: Session, search: ProgramSearch) -> list[tuple[TrainingProgram, float | None]]:
    distance = geo.distance_km(TrainingProvider, search) if search.near_lat is not None else null()
    query = (select(TrainingProgram, distance.label("distance_km"))
             .join(TrainingProvider).join(Qualification, TrainingProgram.qualification_id == Qualification.id)
             .where(TrainingProgram.is_active, TrainingProvider.is_active, Qualification.is_active)
             .options(selectinload(TrainingProgram.provider),
                      selectinload(TrainingProgram.qualification).selectinload(Qualification.sector)))
    if search.qualification_code:
        query = query.where(Qualification.code == search.qualification_code)
    if search.region_code:
        query = query.where(TrainingProvider.region_code == search.region_code)
    if search.provider_id is not None:
        query = query.where(TrainingProgram.provider_id == search.provider_id)
    if search.delivery_mode:
        query = query.where(TrainingProgram.delivery_mode == search.delivery_mode)
    if search.scholarship_only:
        query = query.where(TrainingProgram.scholarship_available)
    if search.radius_km is not None:
        query = query.where(geo.within_radius(TrainingProvider, search))
    order = (distance.asc().nulls_last(), TrainingProgram.id) if search.near_lat is not None else (TrainingProgram.id,)
    rows = list(session.exec(query.order_by(*order).limit(search.limit).offset(search.offset)).all())
    verification.preload(session, "training", {(p.provider_id, p.qualification_id) for p, _ in rows})
    return rows
