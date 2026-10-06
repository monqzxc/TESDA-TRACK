import copy
import json

import pytest
from sqlmodel import select

from tesda_track.models import Competency, Qualification, Sector
from tesda_track.seed import SEED_DIR, SeedError, parse_catalog, sync_catalog


@pytest.fixture
def entries():
    return json.loads((SEED_DIR / "qualifications.json").read_text(encoding="utf-8"))


def qualification(session, code):
    return session.exec(select(Qualification).where(Qualification.code == code)).one()


def test_seeded_catalog_matches_the_seed_file(session):
    codes = session.exec(select(Qualification.code).order_by(Qualification.code)).all()
    assert codes == ["COOKERY-NC-II", "CSS-NC-II", "EIM-NC-II", "FBS-NC-II", "SMAW-NC-II"]
    smaw = qualification(session, "SMAW-NC-II")
    assert smaw.sector.name == "Metals and Engineering"
    assert smaw.possible_jobs == ["Welder", "Fabricator", "Structural Welder"]
    assert [(c.position, c.name) for c in smaw.competencies][:2] == [
        (1, "Observe workplace safety procedures"), (2, "Interpret welding drawings and symbols")]
    assert session.exec(select(Sector.name).order_by(Sector.name)).all() == [
        "Construction", "Information and Communication Technology", "Metals and Engineering", "Tourism"]


def test_reseeding_unchanged_data_keeps_ids_and_changes_nothing(session, entries):
    before = {c.id: (c.qualification_id, c.position, c.name) for c in session.exec(select(Competency)).all()}
    report = sync_catalog(session, parse_catalog(entries))
    after = {c.id: (c.qualification_id, c.position, c.name) for c in session.exec(select(Competency)).all()}
    assert after == before
    assert (report.created, report.updated, report.archived) == (0, 0, 0)


def test_changed_entries_are_updated_in_place(session, entries):
    smaw_id = qualification(session, "SMAW-NC-II").id
    changed = copy.deepcopy(entries)
    changed[0]["name"] = "Shielded Metal Arc Welding NC II"
    changed[0]["sector"] = "Welding Trades"
    changed[0]["competencies"][1]["name"] = "Read welding blueprints"
    report = sync_catalog(session, parse_catalog(changed))
    session.expire_all()
    smaw = qualification(session, "SMAW-NC-II")
    assert smaw.id == smaw_id
    assert smaw.name == "Shielded Metal Arc Welding NC II" and smaw.sector.name == "Welding Trades"
    assert smaw.competencies[1].name == "Read welding blueprints"
    assert report.updated == 2


def test_removed_entries_are_archived_not_deleted(session, entries):
    trimmed = copy.deepcopy(entries)
    trimmed = [entry for entry in trimmed if entry["code"] != "FBS-NC-II"]
    trimmed[0]["competencies"] = trimmed[0]["competencies"][:5]
    sync_catalog(session, parse_catalog(trimmed))
    session.expire_all()
    assert qualification(session, "FBS-NC-II").is_active is False
    smaw = qualification(session, "SMAW-NC-II")
    assert [c.is_active for c in smaw.competencies] == [True, True, True, True, True, False]


def test_re_added_entries_are_reactivated(session, entries):
    sync_catalog(session, parse_catalog([entry for entry in entries if entry["code"] != "FBS-NC-II"]))
    sync_catalog(session, parse_catalog(entries))
    session.expire_all()
    assert qualification(session, "FBS-NC-II").is_active is True


def test_new_qualification_is_created(session, entries):
    new = copy.deepcopy(entries[0])
    new.update(code="PLUMBING-NC-II", name="Plumbing NC II", sector="Construction")
    report = sync_catalog(session, parse_catalog([*entries, new]))
    plumbing = qualification(session, "PLUMBING-NC-II")
    assert plumbing.sector.name == "Construction" and len(plumbing.competencies) == 6
    assert report.created == 1


@pytest.mark.parametrize("mutate", [
    lambda e: e[0].pop("code"),
    lambda e: e[0]["competencies"][0].update(category="Advanced"),
    lambda e: e[0].update(competencies=[]),
    lambda e: e.append(copy.deepcopy(e[0])),  # duplicate code
    lambda e: e[0]["competencies"][1].update(id=1),  # duplicate competency position
])
def test_invalid_seed_data_is_rejected_before_any_write(session, entries, mutate):
    broken = copy.deepcopy(entries)
    mutate(broken)
    with pytest.raises(SeedError):
        parse_catalog(broken)
