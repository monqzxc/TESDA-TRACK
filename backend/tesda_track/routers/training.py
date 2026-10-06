from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from tesda_track.db import SessionDep
from tesda_track.deps import require_admin
from tesda_track.schemas.delivery import (ProgramSearch, RegionPublic, TrainingProgramCreate,
                                          TrainingProgramPublic, TrainingProgramUpdate, TrainingProviderCreate,
                                          TrainingProviderPublic, TrainingProviderUpdate)
from tesda_track.services import embeddings, sites, training
from tesda_track.services.embeddings import EmbedderDep

router = APIRouter(tags=["training"])
admin_router = APIRouter(prefix="/admin", tags=["admin: training"], dependencies=[Depends(require_admin)])


@router.get("/regions", response_model=list[RegionPublic], tags=["catalog"])
def list_regions(session: SessionDep):
    return sites.regions(session)


@router.get("/training-providers", response_model=list[TrainingProviderPublic])
def list_providers(session: SessionDep, region_code: str | None = None):
    return training.list_providers(session, region_code)


@router.get("/training-providers/{provider_id}", response_model=TrainingProviderPublic)
def get_provider(provider_id: int, session: SessionDep):
    return training.get_provider(session, provider_id)


@router.get("/training-programs", response_model=list[TrainingProgramPublic])
def search_programs(session: SessionDep, search: Annotated[ProgramSearch, Query()]):
    """Active programs; give near_lat/near_lon to sort by distance and radius_km to limit it."""
    rows = training.search_programs(session, search)
    return [training.program_public(program, distance) for program, distance in rows]


@router.get("/training-programs/{program_id}", response_model=TrainingProgramPublic)
def get_program(program_id: int, session: SessionDep):
    return training.program_public(training.get_program(session, program_id))


@admin_router.post("/training-providers", response_model=TrainingProviderPublic, status_code=status.HTTP_201_CREATED)
def create_provider(request: TrainingProviderCreate, session: SessionDep):
    provider = training.create_provider(session, request)
    session.commit()
    return provider


@admin_router.patch("/training-providers/{provider_id}", response_model=TrainingProviderPublic)
def update_provider(provider_id: int, request: TrainingProviderUpdate, session: SessionDep):
    provider = training.get_provider(session, provider_id, active_only=False)
    sites.apply_update(session, provider, request)
    session.commit()
    return provider


@admin_router.post("/training-programs", response_model=TrainingProgramPublic, status_code=status.HTTP_201_CREATED)
def create_program(request: TrainingProgramCreate, session: SessionDep, embedder: EmbedderDep):
    program = training.create_program(session, request)
    embeddings.refresh_program(session, embedder, program)
    session.commit()
    return training.program_public(program)


@admin_router.patch("/training-programs/{program_id}", response_model=TrainingProgramPublic)
def update_program(program_id: int, request: TrainingProgramUpdate, session: SessionDep, embedder: EmbedderDep):
    program = training.update_program(session, training.get_program(session, program_id, active_only=False), request)
    embeddings.refresh_program(session, embedder, program)
    session.commit()
    return training.program_public(program)
