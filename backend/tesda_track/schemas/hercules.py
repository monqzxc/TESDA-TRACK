"""The learner profile Hercules returns from GET /v1/tracker/profile (31-TRACKER_IFRAME_INTEGRATION.md).

Only the fields named here are kept: anything else Hercules sends is dropped on parsing, so identifiers the spec
leaves out (national and digital IDs, blood type, face images) never reach TESDA-TRACK even if Hercules starts
sending them. List items stay as plain JSON until real profiles show their shape (python -m tesda_track.cli
tracker-exchange reports it).
"""
from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

# Named in the spec as intentionally excluded. Never kept at any depth; tracker-exchange reports where Hercules
# sent one.
SENSITIVE_FIELDS = frozenset({"nat_id", "digital_id", "blood_type", "face_url"})


def without_sensitive_fields(value):
    """``value`` with every SENSITIVE_FIELDS key removed, however deep: list items are kept as plain JSON, so the
    field whitelist alone doesn't reach inside them."""
    if isinstance(value, dict):
        return {key: without_sensitive_fields(item) for key, item in value.items() if key not in SENSITIVE_FIELDS}
    if isinstance(value, list):
        return [without_sensitive_fields(item) for item in value]
    return value


class _Ignoring(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PersonalInformation(_Ignoring):
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    sex: str | None = None
    date_of_birth: str | None = None
    mobile_number: str | None = None
    email_address: str | None = None
    address: str | None = None
    baranggay: str | None = None
    municipality: str | None = None
    province: str | None = None
    region: str | None = None
    country: str | None = None
    zip_code: str | None = None
    profile_photo: str | None = None


class TrackerCredentials(_Ignoring):
    certificates: list[JsonValue] = []
    trainings: list[JsonValue] = []
    assessments: list[JsonValue] = []
    external_certificates: list[JsonValue] = []


class TrackerProfile(_Ignoring):
    """Sections outside the granted scopes are missing from the response, so each one defaults to empty."""
    sso_id: str = Field(min_length=1)
    uli: str | None = None
    personal_information: PersonalInformation = PersonalInformation()
    skills: list[JsonValue] = []
    experience: list[JsonValue] = []
    education: list[JsonValue] = []
    qualifications: list[JsonValue] = []
    credentials: TrackerCredentials = TrackerCredentials()

    @model_validator(mode="before")
    @classmethod
    def drop_sensitive_fields(cls, data):
        return without_sensitive_fields(data)
