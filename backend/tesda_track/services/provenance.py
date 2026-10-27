"""Validate partial provenance edits against the record's resulting evidence."""
from pydantic import ValidationError

from tesda_track.errors import InvalidRequestError
from tesda_track.schemas.provenance import ProvenanceWrite


def validate_update(record, request) -> None:
    fields = set(ProvenanceWrite.model_fields)
    if not fields.intersection(request.model_fields_set):
        return
    values = {name: getattr(request, name) if name in request.model_fields_set else getattr(record, name)
              for name in fields}
    try:
        ProvenanceWrite.model_validate(values)
    except ValidationError as error:
        raise InvalidRequestError("Invalid source evidence: " + error.errors()[0]["msg"]) from None
