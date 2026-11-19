"""Centers a learner bookmarks from the map, for My Progress. Saving is idempotent: saving again only updates the
qualification it remembers."""
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import AssessmentCenter, Learner, SavedCenter, TrainingProvider
from tesda_track.schemas.delivery import SavedCenterPublic, SavedCenterSave
from tesda_track.services import catalog

# Enough for anyone comparing centers, and a bound on what one account can store.
MAX_SAVED = 200


def _site_column(kind: str):
    return SavedCenter.training_provider_id if kind == "training" else SavedCenter.assessment_center_id


def _parse(center_id: str) -> tuple[str, int]:
    kind, _, number = center_id.partition("-")
    return kind, int(number)


def to_public(saved: SavedCenter) -> SavedCenterPublic:
    site = saved.training_provider or saved.assessment_center
    kind = "training" if saved.training_provider else "assessment"
    return SavedCenterPublic(
        center_id=f"{kind}-{site.id}", kind=kind, name=site.name, region_code=site.region_code,
        province=site.province, city=site.city, address=site.address, latitude=site.latitude,
        longitude=site.longitude, contact_phone=site.contact_phone, contact_email=site.contact_email,
        website=getattr(site, "website", None), is_active=site.is_active,
        qualification=catalog.summary(saved.qualification) if saved.qualification else None,
        saved_at=saved.created_at)


def list_for(session: Session, learner: Learner) -> list[SavedCenter]:
    return list(session.exec(select(SavedCenter).where(SavedCenter.learner_id == learner.id)
                             .order_by(SavedCenter.created_at.desc(), SavedCenter.id)))


def _find(session: Session, learner: Learner, kind: str, site_id: int) -> SavedCenter | None:
    return session.exec(select(SavedCenter).where(SavedCenter.learner_id == learner.id,
                                                  _site_column(kind) == site_id)).first()


def save(session: Session, learner: Learner, center_id: str, request: SavedCenterSave) -> SavedCenter:
    kind, site_id = _parse(center_id)
    saved = _find(session, learner, kind, site_id)
    if saved is None:
        site = session.get(TrainingProvider if kind == "training" else AssessmentCenter, site_id)
        if site is None or not site.is_active:
            raise NotFoundError("Center was not found.")
        count = len(session.exec(select(SavedCenter.id).where(SavedCenter.learner_id == learner.id)).all())
        if count >= MAX_SAVED:
            raise InvalidRequestError(f"You can save up to {MAX_SAVED} centers. Remove one to save another.")
        saved = SavedCenter(learner_id=learner.id,
                            training_provider_id=site_id if kind == "training" else None,
                            assessment_center_id=site_id if kind == "assessment" else None)
        session.add(saved)
    if "qualification_code" in request.model_fields_set:
        code = request.qualification_code
        saved.qualification = catalog.resolve_qualification(session, code) if code else None
    session.flush()
    session.refresh(saved)
    return saved


def remove(session: Session, learner: Learner, center_id: str) -> None:
    """Removing a center that isn't saved is not an error: the learner's intent is already true."""
    kind, site_id = _parse(center_id)
    saved = _find(session, learner, kind, site_id)
    if saved is not None:
        session.delete(saved)
        session.flush()
