"""A TESDA Skill Passport profile as evidence for recommending: normalized, deduplicated, and without identifiers.

Reads a Hercules tracker profile (the `data` of GET /v1/tracker/profile) or the copy sign-in keeps
(tsp_sign_in.kept_profile); both have the same sections. What comes out is only what a recommendation could use:

    skills          the learner's own words, trimmed and without repeats
    qualifications  T2MIS codes (or names) from the qualifications section and the certificates, with the catalog
                    code each maps to where the crosswalk or the catalog's names know it
    credentials     one per certificate: its qualification, level, whether it is valid today and when it expires
    units           competency units, one per unit code, each with the qualifications it came from, its type
                    (BASIC, COMMON, CORE) and whether any of those certificates is still valid
    assessments     each assessment's qualification and whether the result was competent
    trainings, experience   readable labels, where present

Never kept: sso_id, ULI, names, contact details, birth date, address, certificate numbers, assessment or
certificate ids, credential ids, URLs and file keys, issuing organisations.

Two rules follow how the evidence should be read. BASIC and COMMON units (workplace communication, teamwork, shop
maintenance) are shared by dozens to hundreds of qualifications, so they say little about a trade; CORE units are the
occupational evidence. And an expired certificate is history: its units still show what the learner learned, but the
certificate is not held today, so suggesting its qualification again is a renewal, not a duplicate.

Problems in the data (a status that contradicts the expiry date, a unit given two types, an unreadable date) are
resolved conservatively and listed in `warnings`, without the values themselves.
"""
import csv
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Literal

UnitType = Literal["BASIC", "COMMON", "CORE", "UNKNOWN"]
Status = Literal["active", "expired", "unknown"]
UNIT_TYPES: tuple[UnitType, ...] = ("BASIC", "COMMON", "CORE")
# The least specialised wins when the same unit is given two types: never claim more than the data agrees on.
_SPECIALISATION = {"UNKNOWN": 0, "BASIC": 1, "COMMON": 2, "CORE": 3}
LABEL_LIMIT = 200
_MONTHS = {name: number for number, name in enumerate(
    ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november",
     "december"), 1)}
_HUMAN_DATE = re.compile(r"^\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\s*,?\s*(\d{4})\s*$", re.IGNORECASE)
_ISO_DATE = re.compile(r"^\s*(\d{4})-(\d{2})-(\d{2})")
_LABEL_KEYS = ("name", "title", "certificate_title", "training_title", "course", "program", "qualification",
               "qualification_name", "QualificationName", "job_title", "position", "occupation", "label")


@dataclass(frozen=True)
class Qualification:
    given: str                 # as the profile gave it: a T2MIS code such as ALTDRV204, or a name
    catalog_code: str | None   # TESDA-TRACK's code, when known


@dataclass(frozen=True)
class Credential:
    qualification: Qualification
    title: str | None
    kind: str | None           # NC, COC, ...
    level: str | None
    status: Status
    valid_today: bool
    expires_on: date | None
    issued_on: date | None


@dataclass(frozen=True)
class Unit:
    code: str | None
    title: str
    type: UnitType
    sources: tuple[str, ...]   # catalog codes (or given codes) of the certificates that list it
    status: Status             # active when any of those certificates is valid today, otherwise expired or unknown


@dataclass(frozen=True)
class Assessment:
    qualification: Qualification | None
    competent: bool | None
    assessed_on: date | None


@dataclass(frozen=True)
class NormalizedProfile:
    skills: tuple[str, ...] = ()
    qualifications: tuple[Qualification, ...] = ()
    credentials: tuple[Credential, ...] = ()
    units: tuple[Unit, ...] = ()
    assessments: tuple[Assessment, ...] = ()
    trainings: tuple[str, ...] = ()
    experience: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    def units_of(self, *types: UnitType) -> tuple[Unit, ...]:
        return tuple(unit for unit in self.units if unit.type in types)

    @property
    def held_today(self) -> frozenset[str]:
        """Catalog codes of qualifications with a certificate valid today: suggesting one again is a duplicate."""
        return frozenset(c.qualification.catalog_code for c in self.credentials
                         if c.valid_today and c.qualification.catalog_code)

    @property
    def held_before(self) -> frozenset[str]:
        """Catalog codes held only through expired certificates: suggesting one again is a renewal."""
        expired = {c.qualification.catalog_code for c in self.credentials
                   if not c.valid_today and c.qualification.catalog_code}
        return frozenset(expired - self.held_today)

    @property
    def has_occupational_evidence(self) -> bool:
        """Self-declared skills or CORE units: what a suggestion can honestly be worked out from."""
        return bool(self.skills or self.units_of("CORE"))


@dataclass(frozen=True)
class CodeBook:
    """How given qualification codes and names map to catalog codes."""
    by_official_code: Mapping[str, str] = field(default_factory=dict)
    by_name: Mapping[str, str] = field(default_factory=dict)

    def resolve(self, given: str) -> Qualification:
        key = given.strip()
        return Qualification(key, self.by_official_code.get(key.upper()) or self.by_name.get(_norm(key)))

    @classmethod
    def from_catalog(cls, crosswalk: Path, names: Mapping[str, str]) -> "CodeBook":
        """crosswalk: seed/sources/qualification_code_crosswalk.csv; names: catalog name -> catalog code."""
        official, by_name = {}, {_norm(name): code for name, code in names.items()}
        if crosswalk.exists():
            with crosswalk.open(encoding="utf-8") as handle:
                for row in csv.DictReader(handle):
                    if row["relation"] == "same" and row["qualification_code"] in names.values():
                        official[row["official_code"].strip().upper()] = row["qualification_code"]
                        by_name.setdefault(_norm(f"{row['official_title']} NC {row['level']}"),
                                           row["qualification_code"])
        return cls(official, by_name)


def normalize(profile: Mapping, codes: CodeBook, today: date) -> NormalizedProfile:
    """The profile as recommendation evidence; `today` decides which certificates are still valid."""
    warnings: list[str] = []
    credentials_raw = profile.get("credentials") or {}
    if not isinstance(credentials_raw, Mapping):
        warnings.append("credentials_not_an_object")
        credentials_raw = {}

    skills = _unique(_label(entry) for entry in _list(profile.get("skills"), "skills", warnings))
    certificates_raw = [c for c in _list(credentials_raw.get("certificates"), "certificates", warnings)
                        if isinstance(c, Mapping)]

    credentials, units = [], {}
    seen_certificates = set()
    for raw in certificates_raw:
        given = _text(raw.get("qual_code")) or _label(raw) or ""
        qualification = codes.resolve(given) if given else Qualification("", None)
        expires, issued = _date(raw.get("expiration_date"), warnings), _date(raw.get("issuance_date"), warnings)
        status, valid = _validity(_text(raw.get("status")), expires, today, warnings)
        identity = (_text(raw.get("certificate_number")) or "", qualification.given, expires, issued)
        if identity in seen_certificates:
            warnings.append("duplicate_certificate")
            continue
        seen_certificates.add(identity)
        credentials.append(Credential(qualification, _text(raw.get("certificate_title")) or _label(raw),
                                      _text(raw.get("certificate_type")), _text(raw.get("level")), status, valid,
                                      expires, issued))
        source = qualification.catalog_code or qualification.given or "?"
        competencies = raw.get("competencies")
        if competencies is None:
            warnings.append("certificate_without_competencies")
        for entry in _list(competencies, "competencies", warnings):
            if not isinstance(entry, Mapping) or not _text(entry.get("title")):
                warnings.append("unit_without_title")
                continue
            _add_unit(units, entry, source, valid, status, warnings)

    qualifications = _unique_qualifications(
        [codes.resolve(given) for given in
         (_label(entry) for entry in _list(profile.get("qualifications"), "qualifications", warnings)) if given]
        + [c.qualification for c in credentials if c.qualification.given])

    assessments, seen_assessments = [], set()
    for raw in _list(credentials_raw.get("assessments"), "assessments", warnings):
        if not isinstance(raw, Mapping):
            continue
        name = _text(raw.get("QualificationName") or raw.get("qualification_name"))
        result = (_text(raw.get("AsseResult") or raw.get("result")) or "").casefold()
        assessed = _date(raw.get("AssessmentDate") or raw.get("assessment_date"), warnings)
        key = (name, result, assessed)
        if key in seen_assessments:
            warnings.append("duplicate_assessment")
            continue
        seen_assessments.add(key)
        assessments.append(Assessment(codes.resolve(name) if name else None,
                                      True if result == "competent" else False if "not yet" in result else None,
                                      assessed))

    trainings = _unique(_label(entry) for entry in _list(credentials_raw.get("trainings"), "trainings", warnings))
    experience = _unique(_label(entry) for entry in _list(profile.get("experience"), "experience", warnings))
    return NormalizedProfile(skills, qualifications, tuple(credentials), tuple(units.values()), tuple(assessments),
                             trainings, experience, tuple(dict.fromkeys(warnings)))


# --- helpers -------------------------------------------------------------------------------------------------------


def _add_unit(units: dict, entry: Mapping, source: str, valid: bool, status: Status, warnings: list[str]) -> None:
    title = " ".join(str(entry["title"]).split())[:LABEL_LIMIT]
    kind = (_text(entry.get("type")) or "").upper()
    kind = next((t for t in UNIT_TYPES if kind.startswith(t)), "UNKNOWN")
    if kind == "UNKNOWN":
        warnings.append("unit_type_unknown")
    code = _text(entry.get("unit_code"))
    key = code.upper() if code else f"title:{_norm(title)}"
    earlier = units.get(key)
    unit_status: Status = "active" if valid else status
    if earlier is None:
        units[key] = Unit(code, title, kind, (source,), unit_status)
        return
    if earlier.type != kind:
        warnings.append("unit_type_conflict")
        kind = min(earlier.type, kind, key=_SPECIALISATION.__getitem__)
    if _norm(earlier.title) != _norm(title):
        warnings.append("unit_title_conflict")
    merged: Status = ("active" if "active" in (earlier.status, unit_status)
                      else "expired" if "expired" in (earlier.status, unit_status) else "unknown")
    units[key] = Unit(earlier.code, earlier.title, kind, tuple(dict.fromkeys(earlier.sources + (source,))), merged)


def _validity(status: str | None, expires: date | None, today: date, warnings: list[str]) -> tuple[Status, bool]:
    """Valid today only when nothing says otherwise: an Active status with an expiry still ahead (or none given).
    A passed expiry date wins over an Active status; an Expired status wins over a date still ahead."""
    said = (status or "").casefold()
    if said not in ("active", "expired", ""):
        warnings.append("certificate_status_unknown")
        return "unknown", False
    if expires and expires < today:
        if said == "active":
            warnings.append("certificate_active_but_past_expiry")
        return "expired", False
    if said == "expired":
        if expires:
            warnings.append("certificate_expired_before_expiry_date")
        return "expired", False
    if said == "active":
        return "active", True
    warnings.append("certificate_status_missing")
    return "unknown", False


def _date(value, warnings: list[str]) -> date | None:
    text = _text(value)
    if not text:
        return None
    if match := _ISO_DATE.match(text):
        try:
            return date(int(match[1]), int(match[2]), int(match[3]))
        except ValueError:
            pass
    elif match := _HUMAN_DATE.match(text):
        month = _MONTHS.get(match[2].casefold())
        if month:
            try:
                return date(int(match[3]), month, int(match[1]))
            except ValueError:
                pass
    else:
        try:
            return datetime.strptime(text, "%m/%d/%Y").date()
        except ValueError:
            pass
    warnings.append("date_unreadable")
    return None


def _list(value, section: str, warnings: list[str]) -> list:
    if value is None:
        return []
    if not isinstance(value, list):
        warnings.append(f"{section}_not_a_list")
        return []
    return value


def _label(entry) -> str | None:
    if isinstance(entry, Mapping):
        entry = next((entry[key] for key in _LABEL_KEYS if isinstance(entry.get(key), str) and entry[key].strip()),
                     None)
    if not isinstance(entry, str):
        return None
    return " ".join(entry.split())[:LABEL_LIMIT] or None


def _text(value) -> str | None:
    if not isinstance(value, str):
        return None
    return " ".join(value.split()) or None


def _unique(values: Iterable[str | None]) -> tuple[str, ...]:
    seen, kept = set(), []
    for value in values:
        if value and _norm(value) not in seen:
            seen.add(_norm(value))
            kept.append(value)
    return tuple(kept)


def _unique_qualifications(values: list[Qualification]) -> tuple[Qualification, ...]:
    kept: dict[str, Qualification] = {}
    for value in values:
        kept.setdefault(value.catalog_code or value.given.upper(), value)
    return tuple(kept.values())


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold().replace("(superseded)", "")).strip()
