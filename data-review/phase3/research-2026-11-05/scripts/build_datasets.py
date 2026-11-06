"""Rebuild research-only CSVs offline from saved official captures and prior audited PDFs."""
import csv, hashlib, html, json, re, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
RUN=Path(__file__).resolve().parents[1]
PRIOR=RUN/"evidence/inputs"
OUT=RUN/"datasets";OUT.mkdir(exist_ok=True)
def read(p):
    with p.open(encoding="utf-8-sig",newline="") as f:return list(csv.DictReader(f))
def write(name,rows,fields=None):
    fields=fields or list(dict.fromkeys(k for r in rows for k in r))
    with (OUT/name).open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
def clean(t):return re.sub(r"\s+"," ",html.unescape(re.sub("<[^>]+>"," ",t))).strip()
national=read(PRIOR/"proposed_national_2025_2026_forecast.csv")
for r in national:
    r.update(source_url="https://ble.dole.gov.ph/jobs-and-labor-market-forecast/",source_url_kind="publication_index_not_verified_pdf_download",publication_label="May 2025",retrieved_date="2026-11-05",web_verification="official_search_index_confirms_publication; direct_origin_403",pdf_sha256="04d0b32dca7889e312e28d126de5a879b9c3c3210da9b8b80cf9e7c94181cc52")
write("verified_national_2025_2026_forecast.csv",national)
for src,dst in [("proposed_national_2025_2026_crosscutting.csv","national_crosscutting_undisaggregated.csv"),("proposed_national_2023_2025_historical.csv","historical_national_2023_2025.csv"),("proposed_ncr_2022_historical.csv","historical_ncr_jobsfit_2022.csv"),("proposed_catalog_mapping_review.csv","forecast_mapping_proposals.csv")]:shutil.copyfile(PRIOR/src,OUT/dst)
s=(RUN/"raw/pasay-capture/pasay_jobs.txt").read_text(encoding="utf-8")
links=list(re.finditer(r'<a href="(https://pasay.gov.ph/(?:peso-jobs|job-openings)/[^"]+)"',s))
observed=[]
for i,m in enumerate(links):
    block=s[m.end():links[i+1].start() if i+1<len(links) else len(s)]
    fields=[clean(f) for f in re.findall(r'<div class="jet-listing-dynamic-field__content"[^>]*>(.*?)</div>',block,re.S)]
    assert len(fields)>=5,(m.group(1),fields)
    title,date=fields[:2];gov=i>=10
    observed.append(dict(record_id=f"PASAY-2026-{i+1:03}",source_id="pasay-official-job-portal",occupation_title_as_printed=title,source_date_as_printed=date,source_date="2026-10-22" if gov else "2026-10-14",retrieved_date="2026-11-05",evidence_class="observed_2026_posting",demand_classification="not_classified_as_in_demand_or_hard_to_fill",publisher_region="NCR",publisher_city="Pasay",work_region="NCR" if gov else "unconfirmed",work_location_basis="Pasay city-government assignment listed" if gov else "PESO jurisdiction does not establish employer worksite",employer="Pasay City Government" if gov else fields[2],plantilla_item=fields[2] if gov else "",vacancy_count="",count_status="not_published_do_not_assume_one",current_open_status="not_revalidated",source_url=m.group(1),extracted_from_url="https://pasay.gov.ph/job-openings/",document_reference=f"HTML listing card {i+1}; exact title + displayed date",raw_capture="raw/pasay-capture/pasay_jobs.txt",source_verification="official_full_html_saved",mapping_status="pending_review",approved_for_integration="false",notes="Dated posting evidence only; no regional shortage inference. Private worksite needs confirmation."))
write("observed_2026_vacancies.csv",observed)
write("verified_ncr_2026_observed_occupations.csv",[r for r in observed if r["work_region"]=="NCR"])
write("verified_ncr_2026_forecast.csv",[],["record_id","occupation_title_as_printed","classification","source_url","period_label","notes"])
# No invented NCR forecast; an empty dataset accurately represents the current evidence gap.
cat=json.loads((PRIOR/"qualification_catalog_snapshot.json").read_text(encoding="utf-8"))
bycode={x["code"]:x for x in cat}; proposals=[]
manual={"Counter Bagger":[("CUSTOMER-SERVICES-NC-II","Counter-checker/bagger relation; title and duties require review")],"Field Customer Expert":[("CUSTOMER-SERVICES-NC-II","Retail customer role; title alone insufficient")],"Administrative Aide III (Driver I)":[("DRIVING-NC-II","Light-vehicle duties must be confirmed; professional license is separate")],"Administrative Aide V (Photographer I)":[("PHOTOGRAPHY-NC-II","Photographer specialization; civil-service requirements remain separate")]}
for r in observed:
    hits=[(x["code"],"Exact catalog possible_jobs string; still requires sector and duty review") for x in cat if r["occupation_title_as_printed"].casefold() in [j.casefold() for j in x.get("possible_jobs",[])]]
    for code,reason in hits+manual.get(r["occupation_title_as_printed"],[]):
        assert code in bycode
        proposals.append(dict(record_id=r["record_id"],occupation_title_as_printed=r["occupation_title_as_printed"],qualification_code=code,qualification_name=bycode[code]["name"],method="manual_candidate" if (code,reason) not in hits else "exact_title_candidate",reason=reason,source_url=r["source_url"],mapping_status="pending_review",approved_for_integration="false"))
write("observed_mapping_proposals.csv",proposals,["record_id","occupation_title_as_printed","qualification_code","qualification_name","method","reason","source_url","mapping_status","approved_for_integration"])
write("observed_mapping_gaps.csv",[dict(record_id=r["record_id"],occupation_title_as_printed=r["occupation_title_as_printed"],reason="No safe catalog candidate proposed; degree/licensed professions must not be mapped to trade qualifications",source_url=r["source_url"]) for r in observed if r["record_id"] not in {p["record_id"] for p in proposals}])
# API catalog update timestamps are not observation periods.
short=[]
for f in sorted((RUN/"raw/api-capture").glob("shortage_*.px.txt")):
    m=json.loads(f.read_text(encoding="utf-8-sig"));years=next(v["valueTexts"] for v in m["variables"] if v["code"]=="Year")
    short.append(dict(source_url="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/1B/ISLE/OSS/"+f.name.removeprefix("shortage_").removesuffix(".txt"),title=m["title"],period_years=";".join(years),geography="Philippines; no regional variable in inspected metadata",evidence_class="historical_statistical_metadata",latest_observation_year=max(years),source_reference=str(f.relative_to(RUN)).replace("\\","/"),use_limit="Historical survey context, not current 2026 vacancies"))
write("historical_psa_shortage_tables.csv",short)
# TESDA source-discovered reports are contextual leads until PDF content can be inspected.
tsir=(RUN/"raw/tesda_tsir.txt").read_text(encoding="utf-8")
leads=[]
for u,t in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',tsir,re.S|re.I):
    text=clean(t)
    if "2026" in text and "Insights" in text:
        leads.append(dict(publisher="TESDA",title=text,reporting_label="2026",evidence_class="publication_discovery_only",publication_index="https://www.tesda.gov.ph/About/TESDA/27897",source_url=html.unescape(u),occupation_extraction_status="PDF content not retrieved; no occupation demand inferred",reuse_status="Google Drive linked file; confirm permitted download path and reuse before bulk extraction"))
write("tesda_2026_publication_leads.csv",leads)
summary=dict(national_forecast_rows=len(national),national_distinct_titles=len({r["occupation_title_as_printed"] for r in national}),national_distinct_titles_case_insensitive=len({r["occupation_title_as_printed"].casefold() for r in national}),national_in_demand_rows=sum(r["classification"]=="in_demand" for r in national),national_hard_to_fill_rows=sum(r["classification"]=="hard_to_fill" for r in national),verified_ncr_forecast_rows=0,observed_posting_rows=len(observed),observed_distinct_titles=len({r["occupation_title_as_printed"] for r in observed}),confirmed_ncr_workplace_posting_rows=sum(r["work_region"]=="NCR" for r in observed),confirmed_ncr_distinct_titles=len({r["occupation_title_as_printed"] for r in observed if r["work_region"]=="NCR"}),psa_historical_table_metadata=len(short),tesda_publication_leads=len(leads),new_mapping_pairs=len(proposals),approved_mapping_pairs=0)
(OUT/"summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
assert len(national)==442 and len(observed)==20 and len({r['source_url'] for r in observed})==20
print(json.dumps(summary,indent=2))
