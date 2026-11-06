"""Database-free checks of tsp_profile.normalize. Run with --confcutdir=backend/tests/unit.

The payload copies the shape of a real staging tracker profile (2026-11-06), with every value invented: no name,
identifier, date or certificate here belongs to anyone."""
import copy
import dataclasses
import json
from datetime import date

import pytest

from tesda_track.services.tsp_profile import CodeBook, normalize

TODAY = date(2026, 11, 6)
CODES = CodeBook(by_official_code={"TRSCOK214": "COOKERY-NC-II", "TRSHSK205": "HOUSEKEEPING-NC-II",
                                   "ELCEIM215": "EIM-NC-II"},
                 by_name={"cookery nc ii": "COOKERY-NC-II", "electrical installation and maintenance nc ii":
                          "EIM-NC-II"})
BASIC = [{"unit_code": "FIX-B1", "type": "BASIC", "title": "Participate in workplace communication"},
         {"unit_code": "FIX-B2", "type": "BASIC", "title": "Work in team environment"}]


def certificate(code, title, status, expires, core, common=(), number="FIXTURE-CERT-1", issued="1st of May, 2024 "):
    return {"qual_code": code, "certificate_number": number, "certificate_title": title, "qualification_name": title,
            "certificate_type": "NC", "level": "II", "expiration_date": expires, "issuance_date": issued,
            "status": status,
            "competencies": BASIC + [{"unit_code": c, "type": "COMMON", "title": t} for c, t in common]
                            + [{"unit_code": c, "type": "CORE", "title": t} for c, t in core]}


def payload():
    return {
        "sso_id": "fixture-sso-0001", "uli": "FIX-00-000-00000-000",
        "personal_information": {"sso_id": "fixture-sso-0001", "uli": "FIX-00-000-00000-000", "first_name": "FIXTURE",
                                 "last_name": "LEARNER", "date_of_birth": "1990-01-01", "mobile_number": "09000000000",
                                 "email_address": "fixture@example.test", "address": "1 FIXTURE ST",
                                 "region": "REGION FIXTURE"},
        "skills": ["Cooking", " cooking ", "Kitchen sanitation"],
        "experience": [{"job_title": "Kitchen helper"}], "education": [],
        "qualifications": ["TRSCOK214", "TRSHSK205", "TRSCOK214"],
        "credentials": {
            "certificates": [
                certificate("TRSCOK214", "Cookery NC II", "Active", "18th of July, 2031 ",
                            [("FIX-C1", "Prepare stocks, sauces and soups"), ("FIX-C2", "Prepare egg dishes")],
                            [("FIX-M1", "Use food preparation equipment")]),
                certificate("TRSHSK205", "Housekeeping NC II", "Expired", "14th of November, 2023 ",
                            [("FIX-H1", "Provide housekeeping services to guests")],
                            [("FIX-M1", "Use food preparation equipment")], number="FIXTURE-CERT-2",
                            issued="15th of November, 2018 "),
            ],
            "trainings": [],
            "assessments": [
                {"ULI": "FIX-00-000-00000-000", "Certificate_Number": "FIXTURE-CERT-1", "QualificationName": "Cookery NC II",
                 "QualId": 1, "AsseResult": "Competent", "AssessmentDate": "2026-07-19T00:00:00", "AssessmentId": 999,
                 "CertId": 998},
            ],
            "external_certificates": [
                {"id": 1, "sso_id": "fixture-sso-0001", "certificate_title": "Fixture course",
                 "credential_id": "FIXTURE-CRED", "credential_url": "https://badges.example.test/x",
                 "file_key": "certificates/fixture.pdf"},
            ],
        },
    }


def test_keeps_the_evidence_and_none_of_the_identifiers():
    result = normalize(payload(), CODES, TODAY)
    assert result.skills == ("Cooking", "Kitchen sanitation")
    assert [q.catalog_code for q in result.qualifications] == ["COOKERY-NC-II", "HOUSEKEEPING-NC-II"]
    assert result.experience == ("Kitchen helper",)
    assert [(a.qualification.catalog_code, a.competent) for a in result.assessments] == [("COOKERY-NC-II", True)]
    text = json.dumps(dataclasses.asdict(result), default=str)
    for identifier in ("fixture-sso", "FIX-00-000", "FIXTURE", "LEARNER", "1990-01-01", "09000000000", "example.test",
                       "FIXTURE-CERT", "FIXTURE-CRED", "certificates/fixture", "1 FIXTURE ST", "REGION FIXTURE"):
        assert identifier not in text


def test_units_are_one_per_code_with_every_source_and_the_best_status():
    result = normalize(payload(), CODES, TODAY)
    by_code = {u.code: u for u in result.units}
    assert len(result.units) == 6  # 2 BASIC + 1 COMMON shared by both certificates, 3 CORE
    assert by_code["FIX-B1"].sources == ("COOKERY-NC-II", "HOUSEKEEPING-NC-II")
    assert by_code["FIX-M1"].status == "active"  # also on the valid Cookery certificate
    assert by_code["FIX-H1"].status == "expired"  # only on the expired one: history
    assert [u.code for u in result.units_of("CORE")] == ["FIX-C1", "FIX-C2", "FIX-H1"]


def test_an_expired_certificate_is_history_not_a_holding():
    result = normalize(payload(), CODES, TODAY)
    housekeeping = next(c for c in result.credentials if c.qualification.catalog_code == "HOUSEKEEPING-NC-II")
    assert (housekeeping.status, housekeeping.valid_today, housekeeping.expires_on) == ("expired", False,
                                                                                         date(2023, 11, 14))
    assert result.held_today == {"COOKERY-NC-II"} and result.held_before == {"HOUSEKEEPING-NC-II"}
    # Valid on the day it expires, expired the day after.
    raw = payload()
    raw["credentials"]["certificates"][0]["expiration_date"] = "6th of November, 2026"
    assert normalize(raw, CODES, TODAY).held_today == {"COOKERY-NC-II"}
    assert normalize(raw, CODES, date(2026, 11, 7)).held_today == frozenset()


@pytest.mark.parametrize(("status", "expires", "expected", "warning"), [
    ("Active", "1st of January, 2020", ("expired", False), "certificate_active_but_past_expiry"),
    ("Expired", "1st of January, 2030", ("expired", False), "certificate_expired_before_expiry_date"),
    ("", "1st of January, 2030", ("unknown", False), "certificate_status_missing"),
    ("Revoked", "1st of January, 2030", ("unknown", False), "certificate_status_unknown"),
    ("Active", None, ("active", True), None),
])
def test_inconsistent_status_and_expiry_resolve_against_validity(status, expires, expected, warning):
    raw = payload()
    raw["credentials"]["certificates"][0].update(status=status, expiration_date=expires)
    result = normalize(raw, CODES, TODAY)
    cookery = result.credentials[0]
    assert (cookery.status, cookery.valid_today) == expected
    assert (warning in result.warnings) if warning else not result.warnings


def test_a_unit_given_two_types_keeps_the_less_specialised_one():
    raw = payload()
    raw["credentials"]["certificates"][1]["competencies"].append(
        {"unit_code": "FIX-C1", "type": "COMMON", "title": "Prepare stocks and sauces"})
    result = normalize(raw, CODES, TODAY)
    unit = next(u for u in result.units if u.code == "FIX-C1")
    assert unit.type == "COMMON" and unit.title == "Prepare stocks, sauces and soups"
    assert {"unit_type_conflict", "unit_title_conflict"} <= set(result.warnings)


def test_repeated_certificates_and_assessments_count_once():
    raw = payload()
    raw["credentials"]["certificates"].append(copy.deepcopy(raw["credentials"]["certificates"][0]))
    raw["credentials"]["assessments"].append(copy.deepcopy(raw["credentials"]["assessments"][0]))
    result = normalize(raw, CODES, TODAY)
    assert len(result.credentials) == 2 and len(result.assessments) == 1
    assert {"duplicate_certificate", "duplicate_assessment"} <= set(result.warnings)


def test_an_empty_profile_is_empty_evidence():
    for raw in ({}, {"sso_id": "x", "skills": [], "credentials": {}}, {"credentials": None}):
        result = normalize(raw, CODES, TODAY)
        assert result == type(result)() and not result.has_occupational_evidence


def test_partial_and_malformed_sections_are_kept_apart_and_reported():
    raw = {"skills": "Cooking", "qualifications": [None, 42, "ELCEIM215"],
           "credentials": {"certificates": [{"qual_code": "UNKNOWN999", "status": "Active"},
                                            {"qual_code": "TRSCOK214", "status": "Active",
                                             "competencies": [{"unit_code": "X", "type": "Elective", "title": "Plate"},
                                                              {"type": "CORE"}]}],
                           "assessments": "none"}}
    result = normalize(raw, CODES, TODAY)
    assert result.skills == ()
    assert [(q.given, q.catalog_code) for q in result.qualifications] == [
        ("ELCEIM215", "EIM-NC-II"), ("UNKNOWN999", None), ("TRSCOK214", "COOKERY-NC-II")]
    assert [u.type for u in result.units] == ["UNKNOWN"]
    assert {"skills_not_a_list", "assessments_not_a_list", "certificate_without_competencies",
            "unit_type_unknown", "unit_without_title"} <= set(result.warnings)


@pytest.mark.parametrize(("text", "expected"), [
    ("18th of July, 2031 ", date(2031, 7, 18)), ("1st of March 2030", date(2030, 3, 1)),
    ("2031-07-18T00:00:00", date(2031, 7, 18)), ("07/18/2031", date(2031, 7, 18)), ("31st of February, 2030", None),
    ("soon", None),
])
def test_reads_the_date_formats_tsp_sends(text, expected):
    raw = payload()
    raw["credentials"]["certificates"][0]["expiration_date"] = text
    result = normalize(raw, CODES, TODAY)
    assert result.credentials[0].expires_on == expected
    assert ("date_unreadable" in result.warnings) == (expected is None)


def test_generic_units_alone_are_not_occupational_evidence():
    raw = {"credentials": {"certificates": [certificate("TRSCOK214", "Cookery NC II", "Active", None, core=[],
                                                        common=[("FIX-M1", "Use food preparation equipment")])]}}
    result = normalize(raw, CODES, TODAY)
    assert result.units_of("BASIC", "COMMON") and not result.units_of("CORE")
    assert not result.has_occupational_evidence


def test_certificates_never_become_skills_or_interests():
    raw = payload()
    raw["skills"] = []
    result = normalize(raw, CODES, TODAY)
    assert result.skills == () and result.has_occupational_evidence  # CORE units are evidence, not stated interests
