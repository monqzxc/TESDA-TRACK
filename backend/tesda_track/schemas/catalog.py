from pydantic import BaseModel, ConfigDict


class CompetencyPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    name: str
    category: str


class QualificationSummary(BaseModel):
    code: str
    name: str
    sector: str


class QualificationPublic(QualificationSummary):
    possible_jobs: list[str]
    competencies: list[CompetencyPublic]
