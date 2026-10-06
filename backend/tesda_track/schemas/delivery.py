"""Regions, training providers and programs, assessment centers, schedules and applications."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

from tesda_track.models import APPLICATION_STATUSES, ASSESSMENT_RESULTS, DELIVERY_MODES, SCHEDULE_STATUSES
from tesda_track.schemas.catalog import QualificationSummary

Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
RegionCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
QualificationCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]
Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
DeliveryMode = Literal[DELIVERY_MODES]


def check_location(latitude: float | None, longitude: float | None) -> None:
    if (latitude is None) != (longitude is None):
        raise ValueError("Give both latitude and longitude, or neither.")


class RegionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    center_city: str
    latitude: float
    longitude: float


class _Site(BaseModel):
    """Fields shared by training providers and assessment centers."""
    name: Text200
    region_code: RegionCode
    province: OptionalText = None
    city: OptionalText = None
    address: OptionalText = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    contact_email: EmailStr | None = None
    contact_phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None = None

    @model_validator(mode="after")
    def location_complete(self):
        check_location(self.latitude, self.longitude)
        return self


class _SiteUpdate(BaseModel):
    name: Text200 | None = None
    region_code: RegionCode | None = None
    province: OptionalText = None
    city: OptionalText = None
    address: OptionalText = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    contact_email: EmailStr | None = None
    contact_phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None = None
    is_active: bool | None = None


class TrainingProviderCreate(_Site):
    website: OptionalText = None


class TrainingProviderUpdate(_SiteUpdate):
    website: OptionalText = None


class TrainingProviderPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region_code: str
    province: str | None
    city: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    is_active: bool


class SiteSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region_code: str
    city: str | None
    latitude: float | None
    longitude: float | None


class TrainingProgramCreate(BaseModel):
    provider_id: int
    qualification_code: QualificationCode
    title: Text200
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] | None = None
    delivery_mode: DeliveryMode
    duration_hours: Annotated[int, Field(gt=0)] | None = None
    cost: Money | None = None
    scholarship_available: bool = False
    start_date: date | None = None
    end_date: date | None = None
    slots: Annotated[int, Field(gt=0)] | None = None

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("The end date can't be before the start date.")
        return self


class TrainingProgramUpdate(BaseModel):
    title: Text200 | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] | None = None
    delivery_mode: DeliveryMode | None = None
    duration_hours: Annotated[int, Field(gt=0)] | None = None
    cost: Money | None = None
    scholarship_available: bool | None = None
    start_date: date | None = None
    end_date: date | None = None
    slots: Annotated[int, Field(gt=0)] | None = None
    is_active: bool | None = None


class TrainingProgramPublic(BaseModel):
    id: int
    title: str
    description: str | None
    qualification: QualificationSummary
    provider: SiteSummary
    delivery_mode: DeliveryMode
    duration_hours: int | None
    cost: Decimal | None
    scholarship_available: bool
    start_date: date | None
    end_date: date | None
    slots: int | None
    is_active: bool
    distance_km: float | None = None


class AssessmentCenterCreate(_Site):
    pass


class AssessmentCenterUpdate(_SiteUpdate):
    pass


class AssessmentCenterPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region_code: str
    province: str | None
    city: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    contact_email: str | None
    contact_phone: str | None
    is_active: bool


class AssessmentScheduleCreate(BaseModel):
    center_id: int
    qualification_code: QualificationCode
    scheduled_at: AwareDatetime
    slots: Annotated[int, Field(gt=0)]
    fee: Money | None = None


class AssessmentScheduleUpdate(BaseModel):
    scheduled_at: AwareDatetime | None = None
    slots: Annotated[int, Field(gt=0)] | None = None
    fee: Money | None = None
    status: Literal[SCHEDULE_STATUSES] | None = None


class AssessmentSchedulePublic(BaseModel):
    id: int
    qualification: QualificationSummary
    center: SiteSummary
    scheduled_at: datetime
    slots: int
    seats_left: int
    fee: Decimal | None
    status: Literal[SCHEDULE_STATUSES]
    distance_km: float | None = None


class ApplicationCreate(BaseModel):
    schedule_id: int


class AssessmentApplicationPublic(BaseModel):
    id: uuid.UUID
    schedule: AssessmentSchedulePublic
    status: Literal[APPLICATION_STATUSES]
    result: Literal[ASSESSMENT_RESULTS] | None
    reviewer_note: str | None
    created_at: datetime
    updated_at: datetime


class LearnerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str


class AssessmentApplicationAdmin(AssessmentApplicationPublic):
    learner: LearnerSummary


class ApplicationReview(BaseModel):
    status: Literal["approved", "rejected", "completed"] | None = None
    result: Literal[ASSESSMENT_RESULTS] | None = None
    reviewer_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None

    @model_validator(mode="after")
    def result_only_on_completion(self):
        if self.status == "completed" and self.result is None:
            raise ValueError("A completed assessment needs a result.")
        if self.result is not None and self.status != "completed":
            raise ValueError("Results can only be recorded when completing an assessment.")
        return self


class NearbySearch(BaseModel):
    """Optional point to sort by distance; radius_km also filters out anything farther (or unmapped)."""
    model_config = ConfigDict(extra="forbid")

    qualification_code: str | None = None
    region_code: str | None = None
    limit: Annotated[int, Field(ge=1, le=100)] = 20
    offset: Annotated[int, Field(ge=0)] = 0
    near_lat: Latitude | None = None
    near_lon: Longitude | None = None
    radius_km: Annotated[float, Field(gt=0, le=2000)] | None = None

    @model_validator(mode="after")
    def complete(self):
        check_location(self.near_lat, self.near_lon)
        if self.radius_km is not None and self.near_lat is None:
            raise ValueError("radius_km needs near_lat and near_lon.")
        return self


class ProgramSearch(NearbySearch):
    delivery_mode: DeliveryMode | None = None
