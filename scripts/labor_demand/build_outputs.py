"""Turn the collected raw data into the clean CSVs.

Usage: python -I -X utf8 build_outputs.py <scratch_out_dir> <dest_dir> <snapshot_date>
"""
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

PROVINCE_REGION = {
    "FIRST DISTRICT": "NCR", "SECOND DISTRICT": "NCR", "THIRD DISTRICT": "NCR", "FOURTH DISTRICT": "NCR",
    "NCR": "NCR", "METRO MANILA": "NCR", "NATIONAL CAPITAL REGION": "NCR",
    **dict.fromkeys(["ABRA", "APAYAO", "BENGUET", "IFUGAO", "KALINGA", "MOUNTAIN PROVINCE"], "CAR"),
    **dict.fromkeys(["ILOCOS NORTE", "ILOCOS SUR", "LA UNION", "PANGASINAN"], "I"),
    **dict.fromkeys(["BATANES", "CAGAYAN", "ISABELA", "NUEVA VIZCAYA", "QUIRINO"], "II"),
    **dict.fromkeys(["AURORA", "BATAAN", "BULACAN", "NUEVA ECIJA", "PAMPANGA", "TARLAC", "ZAMBALES"], "III"),
    **dict.fromkeys(["BATANGAS", "CAVITE", "LAGUNA", "QUEZON", "RIZAL"], "IV-A"),
    **dict.fromkeys(["MARINDUQUE", "OCCIDENTAL MINDORO", "ORIENTAL MINDORO", "PALAWAN", "ROMBLON"], "MIMAROPA"),
    **dict.fromkeys(["ALBAY", "CAMARINES NORTE", "CAMARINES SUR", "CATANDUANES", "MASBATE", "SORSOGON"], "V"),
    **dict.fromkeys(["AKLAN", "ANTIQUE", "CAPIZ", "GUIMARAS", "ILOILO"], "VI"),
    **dict.fromkeys(["NEGROS OCCIDENTAL", "NEGROS ORIENTAL", "SIQUIJOR"], "NIR"),
    **dict.fromkeys(["BOHOL", "CEBU"], "VII"),
    **dict.fromkeys(["BILIRAN", "EASTERN SAMAR", "LEYTE", "NORTHERN SAMAR", "SAMAR", "WESTERN SAMAR",
                     "SOUTHERN LEYTE"], "VIII"),
    **dict.fromkeys(["ZAMBOANGA DEL NORTE", "ZAMBOANGA DEL SUR", "ZAMBOANGA SIBUGAY", "CITY OF ISABELA"], "IX"),
    **dict.fromkeys(["BUKIDNON", "CAMIGUIN", "LANAO DEL NORTE", "MISAMIS OCCIDENTAL", "MISAMIS ORIENTAL"], "X"),
    **dict.fromkeys(["DAVAO DE ORO", "COMPOSTELA VALLEY", "DAVAO DEL NORTE", "DAVAO DEL SUR", "DAVAO OCCIDENTAL",
                     "DAVAO ORIENTAL"], "XI"),
    **dict.fromkeys(["COTABATO", "NORTH COTABATO", "SARANGANI", "SOUTH COTABATO", "SULTAN KUDARAT"], "XII"),
    **dict.fromkeys(["AGUSAN DEL NORTE", "AGUSAN DEL SUR", "DINAGAT ISLANDS", "SURIGAO DEL NORTE",
                     "SURIGAO DEL SUR"], "XIII"),
    **dict.fromkeys(["BASILAN", "LANAO DEL SUR", "MAGUINDANAO", "MAGUINDANAO DEL NORTE", "MAGUINDANAO DEL SUR",
                     "SULU", "TAWI-TAWI", "COTABATO CITY"], "BARMM"),
}


def write(path: Path, rows: list[dict], fields: list[str] | None = None) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields or list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows):>5} rows  {path.name}")


def salary_numbers(text: str) -> list[int]:
    return [int(n.replace(",", "")) for n in re.findall(r"(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d+)?", text or "")]


def careers(src: Path, dest: Path, date: str) -> None:
    rows = list(csv.DictReader(src.open(encoding="utf-8")))
    for row in rows:
        numbers = salary_numbers(row["salary_text"])
        row["salary_min_php"] = min(numbers) if numbers else ""
        row["salary_max_php"] = max(numbers) if numbers else ""
        row["fetched_on"] = date
    order = ["lists", "title", "slug", "url", "industries", "salary_text", "salary_min_php", "salary_max_php",
             "tesda_mentions", "qualifications", "competencies", "cost_of_training", "career_advancement",
             "description", "categories", "salary_band_tag", "post_id", "fetched_on"]
    write(dest / "careerinfo_ph_careers.csv", rows, order)


def jlmf(src: Path, dest: Path) -> None:
    rows = list(csv.DictReader(src.open(encoding="utf-8")))
    write(dest / "jlmf_calabarzon_2026_2027_priority_occupations.csv", rows)


def region_of(location: str) -> str:
    province = location.rsplit(",", 1)[-1].strip().upper()
    province = re.sub(r"\s*\(.*$", "", province)  # "SAMAR (WESTERN SAMAR)", sometimes cut before the ")"
    if province == "PHILIPPINES":
        return "PH-UNSPECIFIED"  # no city or province given
    return PROVINCE_REGION.get(province, "OVERSEAS/OTHER")


def normalise(title: str) -> str:
    return re.sub(r"\s+", " ", title.strip().lower())


def vacancies(src: Path, dest: Path, date: str) -> None:
    seen, rows = set(), []
    for line in src.read_text(encoding="utf-8").splitlines():
        page = json.loads(line)
        for job in page["jobs"]:
            if job["job_id"] in seen:
                continue
            seen.add(job["job_id"])
            salary = salary_numbers(job["salary"])
            rows.append({**job, "region": region_of(job["location"]),
                         "salary_php": salary[0] if salary else "", "title_normalized": normalise(job["title"]),
                         "list_page": page["page"], "snapshot_date": date})
    unmatched = Counter(r["location"].rsplit(",", 1)[-1].strip() for r in rows if r["region"] == "OVERSEAS/OTHER")
    print("  locations tagged OVERSEAS/OTHER:", unmatched.most_common(25))
    write(dest / f"philjobnet_vacancies_{date}.csv", rows)

    groups = defaultdict(list)
    for row in rows:
        groups[(row["region"], row["title_normalized"])].append(row)
    summary = []
    for (region, title), items in groups.items():
        paid = sorted(r["salary_php"] for r in items if r["salary_php"])
        summary.append({
            "region": region, "title_normalized": title, "postings": len(items),
            "employers": len({r["employer"] for r in items}),
            "median_salary_php": paid[len(paid) // 2] if paid else "",
            "education_most_common": Counter(r["education"] for r in items).most_common(1)[0][0],
            "snapshot_date": date,
        })
    summary.sort(key=lambda r: (r["region"] != "NCR", r["region"], -r["postings"], r["title_normalized"]))
    write(dest / f"philjobnet_postings_by_region_title_{date}.csv", summary)

    by_region = Counter(r["region"] for r in rows)
    print("  postings by region:", by_region.most_common())
    ncr = [s for s in summary if s["region"] == "NCR"][:25]
    print("  NCR top titles:", [(s["title_normalized"], s["postings"], s["employers"]) for s in ncr])
    national = Counter(r["title_normalized"] for r in rows if r["region"] != "OVERSEAS/OTHER")
    print("  PH top titles:", national.most_common(25))


def main() -> None:
    out, dest, date = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    dest.mkdir(parents=True, exist_ok=True)
    careers(out / "cip_careers.csv", dest, date)
    jlmf(out / "jlmf_calabarzon_2026_2027.csv", dest)
    if (out / "philjobnet_pages.jsonl").exists():
        vacancies(out / "philjobnet_pages.jsonl", dest, date)


if __name__ == "__main__":
    main()
