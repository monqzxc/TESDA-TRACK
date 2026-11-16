"""The fixed test set: the outlook's own structured answer for every qualification, region and relocation choice that
has data. Exported once from a database and kept in git, so every writer is judged on the same cases.

    python -m evaluation.outlook_summary.cases            # writes evaluation/data/outlook_summary/cases.jsonl.gz
"""
import gzip
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "outlook_summary"
CASES = DATA / "cases.jsonl.gz"


def load(path: Path = CASES) -> list[dict]:
    return [json.loads(line) for line in gzip.decompress(path.read_bytes()).decode().splitlines() if line.strip()]


def export(session, *, include_examples: bool) -> list[dict]:
    """One case per qualification with any record, for the national view and for each region with a record of it,
    with the learner at home there, staying and open to relocating."""
    from sqlmodel import select

    from tesda_track.models import Qualification
    from tesda_track.services import qualification_outlook

    cases = []
    codes = session.exec(select(Qualification.code).where(Qualification.is_active).order_by(Qualification.code)).all()
    for code in codes:
        national = qualification_outlook.build(session, code, include_examples=include_examples)
        if not national.totals.posting_count and not national.totals.training_sites + national.totals.assessment_sites:
            continue
        regions = [None] + [area.region_code for area in national.areas
                            if area.posting_count or area.training_sites + area.assessment_sites]
        for region in regions:
            for relocate in (False, True):
                outlook = qualification_outlook.build(session, code, region, region, relocate,
                                                      include_examples=include_examples)
                # The counts as the endpoint gives them, less what no writer reads: the site ids, the standing
                # limitations, and regions with nothing recorded (the selected one always stays).
                body = outlook.model_dump(mode="json", exclude={"training_site_ids", "assessment_site_ids",
                                                                "limitations"})
                body["areas"] = [area for area in body["areas"]
                                 if area["balance"] != "no_records" or area["region_code"] == region]
                cases.append({"id": f"{code}|{region or 'PH'}|{'move' if relocate else 'stay'}", "outlook": body})
    return cases


def stand_in_supply(session) -> None:
    """Recorded (non-example) centers for every qualification with postings, in a fixed, uneven spread, inside the
    caller's transaction. A database holding only seed examples has almost no region where demand and supply can be
    compared; with these the set also covers demand ahead, balanced and saturated. The caller rolls them back."""
    from sqlmodel import select

    from tesda_track.models import Qualification, Region, TrainingProgram, TrainingProvider
    from tesda_track.services import area_jobs

    regions = [region.code for region in session.exec(select(Region).order_by(Region.position))]
    for q_index, qualification in enumerate(session.exec(select(Qualification).where(Qualification.is_active)
                                                         .order_by(Qualification.code))):
        if not area_jobs.discover(session, None, None, qualification.code, limit=1).posting_count:
            continue
        for r_index, region in enumerate(regions):
            for n in range((q_index * 5 + r_index * 3) % 7 % 4):  # 0 to 3 centers, never random
                provider = TrainingProvider(name=f"Stand-in {qualification.code} {region} {n}", region_code=region)
                session.add(provider)
                session.flush()
                session.add(TrainingProgram(provider_id=provider.id, qualification_id=qualification.id,
                                            title=qualification.name, delivery_mode="unknown"))
    session.flush()


def main() -> None:
    from sqlmodel import Session

    from tesda_track.config import get_settings
    from tesda_track.db import get_engine

    include = get_settings().outlook_include_example_sites
    with Session(get_engine()) as session:
        cases = export(session, include_examples=include)
        # The same qualifications again with stand-in centers, marked ~, never saved.
        stand_in_supply(session)
        cases += [{**case, "id": "~" + case["id"], "stand_in_supply": True}
                  for case in export(session, include_examples=False) if case["outlook"]["totals"]["posting_count"]]
        session.rollback()
    DATA.mkdir(parents=True, exist_ok=True)
    lines = "".join(json.dumps(case, ensure_ascii=False, sort_keys=True) + "\n" for case in cases)
    CASES.write_bytes(gzip.compress(lines.encode(), mtime=0))  # 4.6 MB of JSON; mtime 0 keeps the bytes stable
    print(f"{len(cases)} cases -> {CASES} (example sites counted: {include})")


if __name__ == "__main__":
    main()
