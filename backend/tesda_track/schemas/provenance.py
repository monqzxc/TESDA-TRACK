"""Unknown source dates stay unknown; record update time is not a source review."""
from datetime import date, datetime, timezone
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (AfterValidator, AwareDatetime, BaseModel, Field, HttpUrl, StringConstraints,
                      TypeAdapter, ValidationError, field_validator, model_validator)


def source_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("Public source links cannot contain credentials.")
        TypeAdapter(HttpUrl).validate_python(value)
    except (ValidationError, ValueError) as error:
        raise ValueError("Use an absolute HTTP(S) source link without credentials.") from error
    return value


SourceName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
SourceReference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
SourceUrl = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000), AfterValidator(source_url)]


class ProvenancePublic(BaseModel):
    status: Literal["verified", "incomplete", "example"] = "incomplete"
    source_name: str | None = None
    source_reference: str | None = None
    source_url: str | None = None
    source_updated_on: date | None = None
    reviewed_at: AwareDatetime | None = None
    record_updated_at: AwareDatetime | None = None

    @field_validator("source_name", "source_reference", "source_url", mode="before")
    @classmethod
    def blank_evidence_is_missing(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("source_url")
    @classmethod
    def unsafe_links_are_missing(cls, value):
        if value is not None:
            try:
                return source_url(value)
            except ValueError:
                return None
        return value

    @model_validator(mode="after")
    def require_review_for_verified(self):
        now = datetime.now(timezone.utc)
        if self.source_updated_on and self.source_updated_on > now.date():
            self.source_updated_on = None
        if self.reviewed_at and self.reviewed_at > now:
            self.reviewed_at = None
        if self.status == "verified" and not (
            self.source_name and self.source_reference and self.source_url and self.source_updated_on
            and self.reviewed_at
        ):
            self.status = "incomplete"
        return self


class ProvenanceWrite(BaseModel):
    data_status: Literal["verified", "incomplete", "example"] = "incomplete"
    source_name: SourceName | None = None
    source_reference: SourceReference | None = None
    source_url: SourceUrl | None = None
    source_updated_on: date | None = None
    source_reviewed_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def honest_review(self):
        if self.source_reviewed_at and self.source_reviewed_at > datetime.now(timezone.utc):
            raise ValueError("The source review cannot be in the future.")
        if self.source_updated_on and self.source_updated_on > datetime.now(timezone.utc).date():
            raise ValueError("The source date cannot be in the future.")
        if self.data_status == "verified" and not all((self.source_name, self.source_reference,
                self.source_url, self.source_updated_on, self.source_reviewed_at)):
            raise ValueError("Verified records need a named source, reference, link, source date and review date.")
        return self


class ProvenancePatch(BaseModel):
    data_status: Literal["verified", "incomplete", "example"] | None = None
    source_name: SourceName | None = None
    source_reference: SourceReference | None = None
    source_url: SourceUrl | None = None
    source_updated_on: date | None = None
    source_reviewed_at: AwareDatetime | None = None
