import csv, json
from datetime import date, timedelta

import pytest
from sqlmodel import select

from tesda_track.models import Learner, Qualification, Region
from tesda_track.models.labor_market import LaborMarketEvidence as Evidence, LaborMarketMapping as Mapping
from tesda_track.schemas.evidence import Geography, measure_sum
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.services import demand_evidence as service
from tesda_track.services import labor_market

CTX = dict(
    evidence_kind="observed",
    geography=Geography(scope="national", label="Philippines"),
    method_version="test-v1",
)
NO_POSTINGS = "No mapped posting records in this extent; absence of evidence is not absence of demand."


def test_measure_sum_states_partial_coverage_exactly():
    m = measure_sum(
        "remaining_seats", "seats", [10, None, 20, None, None], label="remaining seats",
        record_noun="offerings", total_noun="capacity", **CTX,
    )
    assert (m.value, m.known_record_count, m.eligible_record_count, m.unknown_count) == (30, 2, 5, 3)
    assert m.statement == "30 reported remaining seats across 2 of 5 offerings; total capacity unknown."


def test_measure_sum_all_zero_is_observed_zero():
    m = measure_sum(
        "remaining_seats", "seats", [0] * 5, label="remaining seats", record_noun="offerings",
        total_noun="capacity", **CTX,
    )
    assert m.value == 0 and m.coverage == 1 and m.statement == "0 reported remaining seats across 5 of 5 offerings."


def test_measure_sum_all_unknown_and_empty():
    m = measure_sum("s", "seats", [None, None], label="remaining seats", record_noun="offerings", total_noun="capacity", **CTX)
    assert m.value is None and m.coverage == 0
    assert m.statement == "Remaining seats unknown for all 2 offerings."
    e = measure_sum("s", "seats", [], label="remaining seats", record_noun="offerings", total_noun="capacity", **CTX)
    assert e.value is None and e.coverage is None and e.statement == "No offerings in this extent."


@pytest.fixture
def world(tmp_path, session, admin):
    """seed(source, postings) imports one posting snapshot and approves every mapping in it."""
    actor = session.exec(select(Learner).where(Learner.email == "admin@example.com")).one()
    region = session.exec(select(Region).order_by(Region.code)).first()
    other = session.exec(select(Region).where(Region.code != region.code).order_by(Region.code)).first()

    def seed(source, postings, *, region_code="default", observed_on=None, approve=True):
        region_code = region.code if region_code == "default" else region_code
        folder = tmp_path / source
        folder.mkdir()
        year = date.today().year
        meta = dict(
            source_id=source, version=1, publisher="Fixture board", title="Posting snapshot",
            evidence_class="observed_posting", geographic_scope="regional", region_code=region_code,
            period_label=str(year), period_start_year=year - 1, period_end_year=year,
            source_url="https://www.tesda.gov.ph/",
        )
        (folder / "dataset.json").write_text(json.dumps(meta), encoding="utf-8")
        observed = observed_on or date.today()
        ev, mp = [], []
        for i, p in enumerate(postings):
            occ = f"{source}-{i}"
            ev.append(dict(
                occurrence_key=occ, source_record_id=p["id"], occupation_title=p.get("title", "Welder"),
                classification="observed_posting", geographic_scope="regional", region_code=region_code or "",
                locality=p.get("locality", "Quezon City"), period_label=str(year), observed_on=str(observed),
                provenance=json.dumps({k: v for k, v in (("employer", p.get("employer")), ("posted_on", p.get("posted_on"))) if v}),
            ))
            for j, code in enumerate(p.get("codes", ["SMAW-NC-II"])):
                mp.append(dict(
                    mapping_key=f"M-{i}-{j}", occurrence_key=occ, qualification_code=code, proposal="high_confidence",
                    review_reason="Fixture association", competencies='["Welding"]',
                    training_regulation_url="https://www.tesda.gov.ph/", training_regulation_reference="Section 1",
                ))
        for name, rows in (("evidence.csv", ev), ("mappings.csv", mp)):
            with (folder / name).open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(rows[0]))
                w.writeheader()
                w.writerows(rows)
        labor_market.import_bundle(session, folder)
        if approve:
            for m in session.exec(select(Mapping).where(Mapping.mapping_key.like(f"{source}@1:%"))).all():
                labor_market.decide(
                    session, m.id,
                    ReviewInput(decision="approved", expected_decision="pending", note="Approve fixture association"),
                    actor,
                )
        return folder

    seed.region, seed.other = region, other
    return seed


def second_code(session):
    return session.exec(
        select(Qualification.code).where(Qualification.code != "SMAW-NC-II", Qualification.is_active == True)
    ).first()


def test_repeated_capture_counts_once(session, world):
    world("snap-a", [dict(id="job-1", employer="Acme")])
    world("snap-b", [dict(id="job-1", employer="Acme")], observed_on=date.today() - timedelta(days=1))
    ev = service.posting_evidence(session, ["SMAW-NC-II"])
    assert ev.postings.value == 1 and ev.repeated_captures == 1
    assert len(ev.snapshot_dates) == 2 and ev.dataset_keys == ["snap-a@1", "snap-b@1"]


def test_same_title_distinct_ids_are_not_merged(session, world):
    same = dict(employer="  Acme   Corp ", title="Welder", locality="Quezon City", posted_on="1/2/2026")
    world("snap-a", [dict(id="job-1", **same), dict(id="job-2", **{**same, "employer": "ACME corp"})])
    ev = service.posting_evidence(session, ["SMAW-NC-II"])
    assert ev.postings.value == 2 and ev.suspected_duplicate_groups == 1
    assert ev.employers.value == 1 and ev.employers.known_record_count == 2


def test_posting_linked_to_two_codes_counts_once_in_combined_total(session, world):
    other = second_code(session)
    world("snap-a", [dict(id="job-1", codes=["SMAW-NC-II", other])])
    ev = service.posting_evidence(session, ["SMAW-NC-II", other])
    assert ev.by_qualification == {"SMAW-NC-II": 1, other: 1}
    assert ev.postings.value == 1 and ev.overlap_count == 1 and ev.repeated_captures == 0


def test_no_postings_is_null_not_zero(session, world):
    ev = service.posting_evidence(session, ["SMAW-NC-II"])
    assert ev.postings.value is None and ev.postings.statement == NO_POSTINGS
    assert ev.postings.coverage is None and ev.posted_between is None and ev.snapshot_dates == []


def test_last_year_observation_is_not_current(session, world):
    world("snap-a", [dict(id="job-1")], observed_on=date(date.today().year - 1, 12, 31))
    assert service.posting_evidence(session, ["SMAW-NC-II"]).postings.value is None


def test_unallocated_postings_stay_out_of_totals(session, world):
    world("snap-a", [dict(id="job-1")])
    # An import cannot produce this (regional sources need a region), so null the region as legacy rows would have it.
    row = session.exec(select(Evidence).where(Evidence.source_record_id == "job-1")).one()
    row.region_code = None
    session.add(row)
    session.flush()
    world("snap-b", [dict(id="job-2")])
    ev = service.posting_evidence(session, ["SMAW-NC-II"])
    assert ev.postings.value == 1 and ev.unallocated_count == 1


def test_missing_employer_is_unknown_and_geography_follows_region(session, world):
    world("snap-a", [dict(id="job-1", employer="Acme", posted_on="1/5/2026"), dict(id="job-2", posted_on="nonsense")])
    ev = service.posting_evidence(session, ["SMAW-NC-II"])
    assert ev.postings.geography.scope == "multi_regional"
    assert ev.postings.geography.label == "Regions with mapped posting records (not a national total)"
    assert (ev.employers.value, ev.employers.known_record_count, ev.employers.unknown_count) == (1, 1, 1)
    assert ev.posted_between == [date(2026, 1, 5), date(2026, 1, 5)]
    assert ev.postings.limitations == ["Posting records are dated observations, not vacancies or workers; headcount is unknown."]
    scoped = service.posting_evidence(session, ["SMAW-NC-II"], world.region.code)
    assert scoped.postings.geography.scope == "regional" and scoped.postings.geography.label == world.region.name
    assert service.posting_evidence(session, ["SMAW-NC-II"], world.other.code).postings.value is None


def test_revoked_mapping_drops_out_and_changes_fingerprint(session, world):
    world("snap-a", [dict(id="job-1"), dict(id="job-2")])
    before = service.posting_evidence(session, ["SMAW-NC-II"])
    actor = session.exec(select(Learner).where(Learner.email == "admin@example.com")).one()
    m = session.exec(select(Mapping).where(Mapping.mapping_key == "snap-a@1:M-0-0")).one()
    labor_market.decide(
        session, m.id, ReviewInput(decision="rejected", expected_decision="approved", note="Revoke fixture association"), actor
    )
    after = service.posting_evidence(session, ["SMAW-NC-II"])
    assert (before.postings.value, after.postings.value) == (2, 1)
    assert before.fingerprint != after.fingerprint


def test_same_evidence_reproduces_fingerprint(session, world):
    world("snap-a", [dict(id="job-1"), dict(id="job-2")])
    a = service.posting_evidence(session, ["SMAW-NC-II"])
    b = service.posting_evidence(session, ["SMAW-NC-II"])
    assert a.fingerprint == b.fingerprint and len(a.fingerprint) == 64
