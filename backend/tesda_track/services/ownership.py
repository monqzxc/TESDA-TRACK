import uuid
from typing import TypeVar

from sqlmodel import Session

from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import Learner

Record = TypeVar("Record")


def get_owned(session: Session, model: type[Record], record_id: uuid.UUID, learner: Learner, label: str) -> Record:
    """Another learner's record is reported as missing, so ids can't be probed."""
    record = session.get(model, record_id)
    if record is None or record.learner_id != learner.id:
        raise NotFoundError(f"{label} was not found.")
    return record


def resolve_owned(session: Session, model: type[Record], record_id: uuid.UUID | None, learner: Learner,
                  label: str) -> Record | None:
    """For ids inside request bodies: a foreign or unknown id is invalid input (422)."""
    if record_id is None:
        return None
    try:
        return get_owned(session, model, record_id, learner, label)
    except NotFoundError as error:
        raise InvalidRequestError(error.detail) from None
