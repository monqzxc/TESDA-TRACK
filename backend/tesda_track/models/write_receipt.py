"""Opaque retry receipts: no copies of learner answers or deleted records."""
import uuid

from sqlalchemy import String
from sqlmodel import Field, SQLModel


class WriteReceipt(SQLModel, table=True):
    __tablename__ = "write_receipt"

    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", primary_key=True)
    operation: str = Field(sa_type=String(40), primary_key=True)
    request_id: uuid.UUID = Field(primary_key=True)
    request_hash: str = Field(sa_type=String(64))
    resource_id: uuid.UUID
