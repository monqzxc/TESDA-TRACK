from sqlalchemy import CheckConstraint, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field, Relationship, SQLModel

from tesda_track.models.base import Timestamped

COMPETENCY_CATEGORIES = ("Basic", "Common", "Core")


class Sector(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(sa_type=String(120), unique=True)

    qualifications: list["Qualification"] = Relationship(back_populates="sector")


class Qualification(Timestamped, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(sa_type=String(40), unique=True)
    name: str = Field(sa_type=String(200))
    sector_id: int = Field(foreign_key="sector.id", ondelete="RESTRICT", index=True)
    skill_label: str = Field(sa_type=String(120))
    career_keywords: list[str] = Field(default_factory=list, sa_type=ARRAY(Text))
    possible_jobs: list[str] = Field(default_factory=list, sa_type=ARRAY(Text))
    # Archived instead of deleted so saved learner records keep their references.
    is_active: bool = True

    sector: Sector = Relationship(back_populates="qualifications")
    competencies: list["Competency"] = Relationship(
        back_populates="qualification", sa_relationship_kwargs={"order_by": "Competency.position"})


class Competency(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("qualification_id", "position", name="uq_competency_qualification_position"),
        CheckConstraint("category IN ('Basic', 'Common', 'Core')", name="category_valid"),
        CheckConstraint("position > 0", name="position_positive"),
    )

    id: int | None = Field(default=None, primary_key=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    position: int
    name: str = Field(sa_type=String(255))
    category: str = Field(sa_type=String(20))
    is_active: bool = True

    qualification: Qualification = Relationship(back_populates="competencies")
