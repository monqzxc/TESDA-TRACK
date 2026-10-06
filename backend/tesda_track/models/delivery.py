"""Where and how learners train and get assessed: regions, providers, programs, centers and schedules.

Providers and centers store plain latitude/longitude. Migration 0003 adds PostGIS GiST expression
indexes over geography(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)); services.geo builds the
same expression so distance searches use them.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Numeric, String, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from tesda_track.models.base import Timestamped, one_of
from tesda_track.models.catalog import Qualification
from tesda_track.models.learners import Learner

DELIVERY_MODES = ("institution_based", "enterprise_based", "community_based", "online")
SCHEDULE_STATUSES = ("open", "closed", "cancelled", "completed")
APPLICATION_STATUSES = ("pending", "approved", "rejected", "withdrawn", "completed")
ASSESSMENT_RESULTS = ("competent", "not_yet_competent")
LOCATION_CHECKS = (
    CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name="location_complete"),
    CheckConstraint("latitude IS NULL OR latitude BETWEEN -90 AND 90", name="latitude_range"),
    CheckConstraint("longitude IS NULL OR longitude BETWEEN -180 AND 180", name="longitude_range"),
)


class Region(SQLModel, table=True):
    code: str = Field(sa_type=String(20), primary_key=True)
    name: str = Field(sa_type=String(120))
    center_city: str = Field(sa_type=String(120))
    # Approximate regional center, used for coarse proximity when a learner only gives their region.
    latitude: float
    longitude: float
    position: int


class TrainingProvider(Timestamped, table=True):
    __tablename__ = "training_provider"
    __table_args__ = LOCATION_CHECKS

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(sa_type=String(200))
    region_code: str = Field(foreign_key="region.code", ondelete="RESTRICT", index=True)
    province: str | None = Field(default=None, sa_type=String(100))
    city: str | None = Field(default=None, sa_type=String(100))
    address: str | None = Field(default=None, sa_type=String(300))
    latitude: float | None = None
    longitude: float | None = None
    contact_email: str | None = Field(default=None, sa_type=String(254))
    contact_phone: str | None = Field(default=None, sa_type=String(50))
    website: str | None = Field(default=None, sa_type=String(300))
    is_active: bool = True

    programs: list["TrainingProgram"] = Relationship(back_populates="provider")


class TrainingProgram(Timestamped, table=True):
    __tablename__ = "training_program"
    __table_args__ = (
        CheckConstraint(one_of("delivery_mode", DELIVERY_MODES), name="delivery_mode_valid"),
        CheckConstraint("end_date IS NULL OR start_date IS NULL OR end_date >= start_date", name="dates_ordered"),
        CheckConstraint("duration_hours IS NULL OR duration_hours > 0", name="duration_positive"),
        CheckConstraint("cost IS NULL OR cost >= 0", name="cost_not_negative"),
        CheckConstraint("slots IS NULL OR slots > 0", name="slots_positive"),
    )

    id: int | None = Field(default=None, primary_key=True)
    provider_id: int = Field(foreign_key="training_provider.id", ondelete="RESTRICT", index=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    title: str = Field(sa_type=String(200))
    description: str | None = Field(default=None, sa_type=Text)
    delivery_mode: str = Field(sa_type=String(30))
    duration_hours: int | None = None
    cost: Decimal | None = Field(default=None, sa_type=Numeric(10, 2))
    scholarship_available: bool = False
    start_date: date | None = None
    end_date: date | None = None
    slots: int | None = None
    is_active: bool = True

    provider: TrainingProvider = Relationship(back_populates="programs")
    qualification: Qualification = Relationship()


class AssessmentCenter(Timestamped, table=True):
    __tablename__ = "assessment_center"
    __table_args__ = LOCATION_CHECKS

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(sa_type=String(200))
    region_code: str = Field(foreign_key="region.code", ondelete="RESTRICT", index=True)
    province: str | None = Field(default=None, sa_type=String(100))
    city: str | None = Field(default=None, sa_type=String(100))
    address: str | None = Field(default=None, sa_type=String(300))
    latitude: float | None = None
    longitude: float | None = None
    contact_email: str | None = Field(default=None, sa_type=String(254))
    contact_phone: str | None = Field(default=None, sa_type=String(50))
    is_active: bool = True


class AssessmentSchedule(Timestamped, table=True):
    __tablename__ = "assessment_schedule"
    __table_args__ = (
        CheckConstraint(one_of("status", SCHEDULE_STATUSES), name="status_valid"),
        CheckConstraint("slots > 0", name="slots_positive"),
        CheckConstraint("fee IS NULL OR fee >= 0", name="fee_not_negative"),
    )

    id: int | None = Field(default=None, primary_key=True)
    center_id: int = Field(foreign_key="assessment_center.id", ondelete="RESTRICT", index=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    scheduled_at: datetime = Field(sa_type=DateTime(timezone=True), index=True)
    slots: int
    fee: Decimal | None = Field(default=None, sa_type=Numeric(10, 2))
    status: str = Field(default="open", sa_type=String(20))

    center: AssessmentCenter = Relationship()
    qualification: Qualification = Relationship()


class AssessmentApplication(Timestamped, table=True):
    __tablename__ = "assessment_application"
    __table_args__ = (
        UniqueConstraint("learner_id", "schedule_id", name="uq_assessment_application_learner_schedule"),
        CheckConstraint(one_of("status", APPLICATION_STATUSES), name="status_valid"),
        CheckConstraint(f"result IS NULL OR {one_of('result', ASSESSMENT_RESULTS)}", name="result_valid"),
        CheckConstraint("result IS NULL OR status = 'completed'", name="result_only_when_completed"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    schedule_id: int = Field(foreign_key="assessment_schedule.id", ondelete="RESTRICT", index=True)
    status: str = Field(default="pending", sa_type=String(20))
    result: str | None = Field(default=None, sa_type=String(20))
    reviewer_note: str | None = Field(default=None, sa_type=String(500))

    schedule: AssessmentSchedule = Relationship()
    learner: Learner = Relationship()
