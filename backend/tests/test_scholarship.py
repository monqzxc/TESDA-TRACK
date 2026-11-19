"""US-0019: "Scholarship open" only while a scholarship is open."""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select

from tesda_track import sample_scholarships
from tesda_track.models import TrainingProgram
from tesda_track.services.training import philippine_today, scholarship_open

TODAY = date(2026, 11, 15)


@pytest.mark.parametrize("available, closes_on, expected", [
    (True, None, True),                       # listed, no close date known
    (True, TODAY, True),                      # open through its last day
    (True, TODAY + timedelta(days=30), True),
    (True, TODAY - timedelta(days=1), False),  # closed yesterday: the tag goes
    (False, None, False),
    (False, TODAY + timedelta(days=30), False),
])
def test_a_scholarship_is_open_only_until_it_closes(available, closes_on, expected):
    program = SimpleNamespace(scholarship_available=available, scholarship_closes_on=closes_on)

    assert scholarship_open(program, TODAY) is expected


def programs(client, **params):
    response = client.get("/api/v1/training-programs", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_the_api_says_whether_a_scholarship_is_open_and_whether_it_is_sample(client, make_program):
    today = philippine_today()
    open_one = make_program(scholarship_available=True, scholarship_is_sample=True,
                            scholarship_closes_on=str(today + timedelta(days=30)))
    closed = make_program(scholarship_available=True, scholarship_is_sample=True,
                          scholarship_closes_on=str(today - timedelta(days=1)), title="SMAW NC II Batch 2")
    none = make_program(title="SMAW NC II Batch 3")

    listed = {p["id"]: p for p in programs(client, qualification_code="SMAW-NC-II")}
    assert (listed[open_one["id"]]["scholarship_open"], listed[open_one["id"]]["scholarship_is_sample"]) == (True, True)
    assert listed[closed["id"]]["scholarship_open"] is False
    assert listed[closed["id"]]["scholarship_available"] is True, "the listing is kept; only the tag goes"
    assert (listed[none["id"]]["scholarship_open"], listed[none["id"]]["scholarship_is_sample"]) == (False, False)

    only = {p["id"] for p in programs(client, qualification_code="SMAW-NC-II", scholarship_only=True)}
    assert only == {open_one["id"]}


def test_sample_scholarships_are_added_once_marked_and_cleared_without_touching_real_ones(session, make_program):
    real = make_program(scholarship_available=True)
    made = [make_program(title=f"SMAW NC II Batch {n}") for n in range(8)]

    first = sample_scholarships.apply(session)
    session.flush()
    assert sample_scholarships.apply(session) == {"sample_scholarships_added": {"open": 0, "closed": 0}}

    rows = {p.id: p for p in session.exec(select(TrainingProgram)).all()}
    samples = [rows[p["id"]] for p in made if rows[p["id"]].scholarship_is_sample]
    added = first["sample_scholarships_added"]
    assert len(samples) == added["open"] + added["closed"] > 0
    assert added["closed"] >= 1, "the demo includes a scholarship that has closed"
    assert all(p.scholarship_available and p.scholarship_closes_on for p in samples)
    assert not rows[real["id"]].scholarship_is_sample and rows[real["id"]].scholarship_closes_on is None

    removed = sample_scholarships.clear(session)
    session.flush()
    assert removed == {"sample_scholarships_removed": len(samples)}
    assert all(not p.scholarship_available and p.scholarship_closes_on is None for p in samples)
    assert rows[real["id"]].scholarship_available, "real scholarship data stays"


def test_every_qualification_with_a_program_gets_an_open_sample_scholarship(session, make_program):
    """QA's path (a cook's goal, any city) must find one: each qualification's first program gets an open one."""
    cookery = make_program(qualification_code="COOKERY-NC-II", title="Cookery NC II Batch 1")
    eim = [make_program(qualification_code="EIM-NC-II", title=f"EIM NC II Batch {n}") for n in range(2)]

    sample_scholarships.apply(session)
    session.flush()

    rows = {p.id: p for p in session.exec(select(TrainingProgram)).all()}
    for program in (cookery, eim[0]):
        row = rows[program["id"]]
        assert row.scholarship_is_sample and row.scholarship_closes_on == sample_scholarships.SAMPLE_CLOSES_ON
    assert not rows[eim[1]["id"]].scholarship_available

