"""Offline semantic/integrity checks; no database or application mutations."""
import ast,csv,hashlib,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def rows(name):
    with (R/"datasets"/name).open(encoding="utf-8-sig",newline="") as f:return list(csv.DictReader(f))
n=rows("verified_national_2025_2026_forecast.csv");v=rows("observed_2026_vacancies.csv")
assert len(n)==442 and sum(x["classification"]=="in_demand" for x in n)==354
assert sum(x["classification"]=="hard_to_fill" for x in n)==88
assert all(x["geographic_scope"]=="national" and x["period_type"]=="forecast" and x["page_pdf"] for x in n)
assert not rows("verified_ncr_2026_forecast.csv")
assert len(v)==20 and len({x["source_url"] for x in v})==20
assert all(x["source_date"].startswith("2026-") and x["vacancy_count"]=="" and x["current_open_status"]=="not_revalidated" for x in v)
ncr=rows("verified_ncr_2026_observed_occupations.csv");assert len(ncr)==10 and all(x["work_region"]=="NCR" for x in ncr)
catalog=json.loads((R/"evidence/inputs/qualification_catalog_snapshot.json").read_text(encoding="utf-8"));codes={x["code"] for x in catalog}
m=rows("forecast_mapping_proposals.csv")+rows("observed_mapping_proposals.csv")
assert all(x["qualification_code"] in codes and x["mapping_status"]=="pending_review" and x["approved_for_integration"]=="false" for x in m)
for f in (R/"scripts").glob("*.py"):ast.parse(f.read_text(encoding="utf-8"))
for x in json.loads((R/"evidence/input-manifest.json").read_text(encoding="utf-8")):
    assert hashlib.sha256((R/"evidence/inputs"/x["file"]).read_bytes()).hexdigest()==x["sha256"]
# Confirm the successful API response contains a populated observation, unlike the initial missing-cell probe.
a=json.loads((R/"raw/supplement-capture/employment_august2026.txt").read_text(encoding="utf-8-sig"))
assert a["data"] and a["data"][0]["values"][0] not in [".","..",""]
result=dict(status="passed",national_rows=len(n),observed_postings=len(v),mapping_pairs=len(m),catalog_codes=len(codes),forecast_mapping_title_strings=len({x['occupation_title_as_printed'] for x in rows('forecast_mapping_proposals.csv')}),checks="Classification, period/geography separation, unique URLs, null vacancy counts, pending mapping flags, valid qualification codes, input hashes, Python syntax and populated API observation")
(R/"evidence/dataset-validation.json").write_text(json.dumps(result,indent=2),encoding="utf-8");print(json.dumps(result,indent=2))
