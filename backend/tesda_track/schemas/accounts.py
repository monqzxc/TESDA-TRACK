import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, StringConstraints

NormalizedEmail = Annotated[EmailStr, BeforeValidator(lambda value: value.strip().lower() if isinstance(value, str) else value)]
NewPassword = Annotated[str, StringConstraints(min_length=10, max_length=128)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]


class RegisterRequest(BaseModel):
    email: NormalizedEmail
    password: NewPassword
    full_name: FullName
    privacy_consent: bool = Field(description="The learner agreed to the privacy notice (required).")


class LearnerPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: Literal["learner", "admin"]
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class LearnerUpdate(BaseModel):
    full_name: FullName | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: NewPassword
