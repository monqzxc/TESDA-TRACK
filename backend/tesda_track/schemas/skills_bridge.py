from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


SkillTerm = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SkillsBridgeMatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skills: list[SkillTerm] = Field(min_length=1, max_length=25)
    limit: int = Field(default=6, ge=1, le=10)

    @field_validator("skills")
    @classmethod
    def unique_terms(cls, skills: list[str]) -> list[str]:
        seen = set()
        unique = []
        for term in skills:
            if term.casefold() not in seen:
                unique.append(term)
                seen.add(term.casefold())
        return unique


class SkillsBridgeOccupationSearchRequest(BaseModel):
    """Occupation titles are searched separately from capability/skill matching."""
    model_config = ConfigDict(extra="forbid")
    occupations: list[SkillTerm] = Field(min_length=1, max_length=10)
    limit: int = Field(default=6, ge=1, le=10)

    @field_validator("occupations")
    @classmethod
    def unique_terms(cls, occupations: list[str]) -> list[str]:
        seen = set()
        unique = []
        for term in occupations:
            if term.casefold() not in seen:
                unique.append(term)
                seen.add(term.casefold())
        return unique
