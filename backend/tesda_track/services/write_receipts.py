"""Serialize keyed writes per account and replay the original resource after timeouts.

Receipt and resource commit in the same transaction. A reused key with different
input is rejected. Deleted resources are never recreated by an old retry.
"""
import hashlib
import json

from fastapi import HTTPException
from sqlmodel import select

from tesda_track.models import Learner
from tesda_track.models.write_receipt import WriteReceipt


def perform(session, learner, operation, request, model, create):
    key = request.request_id
    if key is None:
        return create()
    payload = request.model_dump(mode="json", exclude={"request_id"})
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    # A row lock works across API workers and also protects the first insert.
    session.exec(select(Learner).where(Learner.id == learner.id).with_for_update()).one()
    receipt = session.get(WriteReceipt, (learner.id, operation, key))
    if receipt:
        if receipt.request_hash != fingerprint:
            raise HTTPException(409, "This save request was already used for different answers. Start a new save.")
        record = session.get(model, receipt.resource_id)
        if record is None or record.learner_id != learner.id:
            raise HTTPException(410, "The previously saved record has been deleted. Start a new journey.")
        return record
    record = create()
    session.add(WriteReceipt(learner_id=learner.id, operation=operation, request_id=key,
                            request_hash=fingerprint, resource_id=record.id))
    session.flush()
    return record
