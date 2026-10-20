from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from tesda_track.models.base import utcnow

EvidenceText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
VerificationStatus = Literal["unknown", "verified", "unavailable", "expired"]


class Prerequisite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["verified_certification", "manual_review"]
    description: EvidenceText
    source_reference: EvidenceText
    qualification_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None = None

    @model_validator(mode="after")
    def certificate_code(self):
        if self.kind == "verified_certification" and not self.qualification_code:
            raise ValueError("A certificate prerequisite needs an official qualification code.")
        if self.kind == "manual_review" and self.qualification_code is not None:
            raise ValueError("Manual requirements do not accept a certificate qualification code.")
        return self


class VerificationWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: VerificationStatus = "unknown"
    source_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    source_reference: EvidenceText | None = None
    source_record_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    source_version: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None
    reviewed_at: AwareDatetime | None = None
    review_due_at: AwareDatetime | None = None
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    is_synthetic: bool = False
    requirements_reviewed: bool = False
    requirements: list[Prerequisite] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def evidence_complete(self):
        if self.status == "verified" and (self.is_synthetic or not all((
                self.source_name, self.source_reference, self.reviewed_at, self.review_due_at))):
            raise ValueError("Verified services need non-synthetic source evidence and a bounded review period.")
        if self.reviewed_at and self.reviewed_at > utcnow():
            raise ValueError("The review timestamp cannot be in the future.")
        if self.review_due_at and (not self.reviewed_at or self.review_due_at <= self.reviewed_at):
            raise ValueError("Review expiry must follow the review timestamp.")
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("Service validity must end after it begins.")
        if self.requirements_reviewed and not all((self.source_reference, self.reviewed_at, self.review_due_at)):
            raise ValueError("Reviewed prerequisites need source evidence and a bounded review period.")
        return self


class VerificationPublic(BaseModel):
    status: VerificationStatus = "unknown"
    source_name: str | None = None
    source_reference: str | None = None
    source_record_id: str | None = None
    source_version: str | None = None
    reviewed_at: AwareDatetime | None = None
    review_due_at: AwareDatetime | None = None
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    is_synthetic: bool = False
    requirements_reviewed: bool = False
    requirements: list[Prerequisite] = Field(default_factory=list)


class EligibilityCheck(BaseModel):
    description: str
    status: Literal["satisfied", "unsatisfied", "unknown"]
    reason: str


class EligibilityPublic(BaseModel):
    status: Literal["satisfied", "unsatisfied", "unknown"] = "unknown"
    checks: list[EligibilityCheck] = Field(default_factory=list)


class AvailabilityWrite(BaseModel):
    availability_status: Literal["unknown", "available", "unavailable"] = "unknown"
    availability_source: EvidenceText | None = None
    availability_checked_at: AwareDatetime | None = None
    availability_valid_until: AwareDatetime | None = None

    @model_validator(mode="after")
    def availability_evidence(self):
        if self.availability_status != "unknown" and not all((self.availability_source,
                self.availability_checked_at, self.availability_valid_until)):
            raise ValueError("Availability claims need a source and a bounded observation period.")
        if self.availability_checked_at and self.availability_checked_at > utcnow():
            raise ValueError("Availability cannot be checked in the future.")
        if self.availability_valid_until and (not self.availability_checked_at or
                self.availability_valid_until <= self.availability_checked_at):
            raise ValueError("Availability expiry must follow its observation timestamp.")
        return self


class AvailabilityPublic(BaseModel):
    status: Literal["unknown", "available", "unavailable"] = "unknown"
    source_reference: str | None = None
    checked_at: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None


class AvailabilityPatch(BaseModel):
    availability_status: Literal["unknown", "available", "unavailable"] | None = None
    availability_source: EvidenceText | None = None
    availability_checked_at: AwareDatetime | None = None
    availability_valid_until: AwareDatetime | None = None


class VerificationImportRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["training", "assessment"]
    site_id: int = Field(gt=0)
    qualification_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    evidence: VerificationWrite


class VerificationImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dry_run: bool = True
    records: list[VerificationImportRow] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def unique_services(self):
        keys = [(r.kind, r.site_id, r.qualification_code) for r in self.records]
        if len(keys) != len(set(keys)):
            raise ValueError("An import cannot contain duplicate service keys.")
        return self
