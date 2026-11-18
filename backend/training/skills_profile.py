"""Synthetic TSP skill profiles and a synthetic 2023-2026 demand trend, for the skills-profile Colab round.

Everything here is invented from the committed catalog (seed/qualifications.json) and seed/regions.json. No learner,
TSP, worker or job-posting record is read. Both outputs are marked synthetic and must not be shown as real figures.

Outputs (training/data/skills_profile/):
  profiles.jsonl         one synthetic Skill Passport per line: skills, experience, certificates, region, and labels
                         (target qualification codes, route, split). `query` is exactly what the app embeds for a
                         TSP suggestion: the skills joined with ", " (services/analysis.suggestion_text).
  demand_quarterly.csv   region x qualification x quarter, 2023-Q1 .. 2026-Q4: postings, vacancies, applicants,
                         hires, demand/supply ratio and a 0-100 demand index. 2026-Q4 is flagged as a projection.

Standard library only, deterministic:  python3 training/skills_profile.py [--per-qualification 24] [--seed 7]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = HERE.parent / "seed"
OUT = HERE / "data" / "skills_profile"

LEVEL = re.compile(r"\s+NC\s+(IV|III|II|I)\b.*$")
LEVEL_ORDER = {"I": 1, "II": 2, "III": 3, "IV": 4}
ROUTE_ASSESS, ROUTE_TRAIN = "ASSESSMENT_READINESS", "TRAINING_AND_ASSESSMENT"

GENERIC_SKILLS = [
    "Customer service", "Teamwork", "Communication skills", "MS Office", "Time management", "Basic computer",
    "Problem solving", "Cash handling", "Social media", "Leadership", "English and Filipino", "Driving",
    "Inventory", "Data entry", "Marunong makisama", "Masipag", "Sales", "First aid", "Typing", "Canva",
]
# Skills with no TESDA qualification behind them: these profiles must get no match.
UNRELATED_SKILLS = [
    "Legal research", "Litigation", "Stock trading", "Investment banking", "Auditing (CPA)", "Pharmacology",
    "Clinical surgery", "Dentistry", "Architecture design", "Civil engineering licensure", "Teaching (LET passer)",
    "Academic research", "Psychology counseling", "Public administration", "Political campaigning",
    "Theology", "Philosophy", "Astrophysics", "Actuarial science", "Corporate law", "Patent drafting",
    "Radiology", "Veterinary surgery", "Tax law", "Mathematics olympiad", "Journalism", "Film directing",
    "Diplomacy", "Military strategy", "Real estate brokering (licensed)",
]
EDUCATION = ["Elementary graduate", "High School graduate", "Senior High School, TVL track",
             "Senior High School, ABM track", "Senior High School, STEM track", "Senior High School, HUMSS track",
             "College undergraduate", "College graduate", "ALS completer"]

# Annual growth of job postings by sector: 2023->2024, 2024->2025, 2025->2026. Invented but shaped after the
# broad story (construction and ICT up with infrastructure and BPO/IT growth, tourism recovering then normalising,
# health care steady, agriculture and garments flat to declining).
SECTOR_GROWTH = {
    "Construction": (0.11, 0.09, 0.07),
    "Information and Communication Technology": (0.14, 0.17, 0.19),
    "Tourism": (0.22, 0.09, 0.05),
    "Health, Social and Other Community Development Services": (0.07, 0.08, 0.08),
    "Human Health/Health Care": (0.09, 0.10, 0.11),
    "Agriculture, Forestry and Fishery": (0.00, -0.02, 0.01),
    "Metals and Engineering": (0.05, 0.06, 0.04),
    "Automotive and Land Transportation": (0.06, 0.05, 0.05),
    "Automotive Manufacturing": (0.03, 0.04, 0.02),
    "Automotive Industry (manufacturing": (0.03, 0.04, 0.02),
    "Electrical and Electronics": (0.08, 0.10, 0.09),
    "Heating, Ventilation, Air Conditioning and Refrigeration Technology": (0.07, 0.08, 0.09),
    "Utilities": (0.05, 0.07, 0.10),
    "Maritime": (0.04, 0.03, 0.04),
    "Processed Food and Beverages": (0.04, 0.05, 0.04),
    "Garments": (-0.03, -0.04, -0.02),
    "Transport and Logistics": (0.09, 0.08, 0.10),
    "Creative": (0.06, 0.08, 0.07),
    "Media": (0.03, 0.05, 0.06),
    "Wholesale and Retail Trading": (0.06, 0.05, 0.05),
}
DEFAULT_GROWTH = (0.03, 0.03, 0.03)
# Quarter multipliers (Q1..Q4).
SECTOR_SEASON = {
    "Tourism": (0.95, 1.05, 0.90, 1.10),
    "Construction": (1.10, 1.05, 0.88, 0.97),
    "Agriculture, Forestry and Fishery": (1.05, 0.95, 0.95, 1.05),
    "Wholesale and Retail Trading": (0.92, 0.96, 0.97, 1.15),
    "Processed Food and Beverages": (0.95, 0.97, 0.98, 1.10),
}
# Rough share of national job postings by region (sums to about 1).
REGION_WEIGHT = {"NCR": 0.17, "CAR": 0.02, "I": 0.04, "II": 0.03, "III": 0.11, "IV-A": 0.16, "MIMAROPA": 0.02,
                 "V": 0.04, "VI": 0.05, "NIR": 0.02, "VII": 0.08, "VIII": 0.03, "IX": 0.03, "X": 0.04, "XI": 0.06,
                 "XII": 0.03, "XIII": 0.02, "BARMM": 0.02}
# Where a sector is stronger (x) or weaker than its national share.
REGION_SECTOR = {
    "Tourism": {"VII": 1.8, "MIMAROPA": 2.2, "VI": 1.4, "NIR": 1.3, "CAR": 1.4, "I": 1.2, "XIII": 1.3},
    "Agriculture, Forestry and Fishery": {"II": 2.0, "X": 1.7, "XII": 1.8, "VI": 1.4, "XI": 1.4, "BARMM": 1.8,
                                          "NCR": 0.2, "IV-A": 0.7},
    "Information and Communication Technology": {"NCR": 1.9, "IV-A": 1.3, "VII": 1.5, "XI": 1.2, "BARMM": 0.4},
    "Construction": {"NCR": 1.3, "IV-A": 1.3, "III": 1.3},
    "Automotive Manufacturing": {"IV-A": 2.5, "III": 1.6, "NCR": 0.8},
    "Electrical and Electronics": {"IV-A": 1.8, "III": 1.3, "VII": 1.2},
    "Maritime": {"VII": 2.0, "VIII": 1.6, "NCR": 1.3, "VI": 1.2},
    "Garments": {"III": 1.4, "IV-A": 1.4, "NCR": 1.2},
}
# Qualifications with many postings everywhere (matched on the name).
POPULAR = {"cookery": 3.0, "housekeeping": 2.4, "food and beverage": 2.6, "shielded metal arc": 2.4,
           "electrical installation": 2.6, "carpentry": 2.0, "masonry": 2.0, "driving": 2.8,
           "computer systems servicing": 2.2, "bookkeeping": 2.0, "caregiving": 2.4, "contact center": 3.0,
           "bread and pastry": 2.0, "massage": 1.6, "barista": 1.8, "automotive servicing": 1.8,
           "plumbing": 1.6, "front office": 1.6, "visual graphic design": 1.6, "programming": 1.8,
           "events management": 1.4, "beauty care": 1.5, "hairdressing": 1.5, "bartending": 1.4,
           "tile setting": 1.3, "scaffold": 1.5, "rac servicing": 1.7, "heavy equipment": 1.6}
PERIODS = [(year, quarter) for year in range(2023, 2027) for quarter in range(1, 5)]
PROJECTION = {(2026, 4)}


def family(name: str) -> str:
    return LEVEL.sub("", name).strip()


def level(name: str) -> int | None:
    found = re.search(r"\bNC\s+(IV|III|II|I)\b", name)
    return LEVEL_ORDER[found.group(1)] if found else None


def tidy(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\(.*?\)", "", text)).strip(" .,;")


def typo(text: str, rng: random.Random) -> str:
    if len(text) < 5:
        return text
    i = rng.randrange(1, len(text) - 2)
    kind = rng.random()
    if kind < 0.4:
        return text[:i] + text[i + 1] + text[i] + text[i + 2:]
    if kind < 0.75:
        return text[:i] + text[i + 1:]
    return text[:i] + text[i] + text[i:]


def styled(text: str, rng: random.Random) -> str:
    r = rng.random()
    return text.lower() if r < 0.45 else text[:1].upper() + text[1:] if r < 0.85 else text.title()


def skill_pool(q: dict) -> dict[str, list[str]]:
    core = [tidy(c["name"]) for c in q["competencies"] if c["category"] == "Core"]
    return {"label": [q["skill_label"]] if q.get("skill_label") else [],
            "keywords": [k for k in q.get("career_keywords", []) if len(k) > 2],
            "core": [c for c in core if 3 < len(c) < 70]}


def make_profile(rng: random.Random, quals: list[dict], by_family: dict, pid: str) -> dict:
    """One synthetic Skill Passport for one or two qualifications (same sector), with labels."""
    main = quals[0]
    skills, core_used, core_total = [], 0, 0
    for q in quals:
        pool = skill_pool(q)
        core_total += len(pool["core"])
        picks = pool["label"] if rng.random() < 0.6 else []
        picks += rng.sample(pool["keywords"], k=min(len(pool["keywords"]), rng.choice((0, 1, 1, 2, 2, 3))))
        chosen_core = rng.sample(pool["core"], k=min(len(pool["core"]), rng.choice((0, 0, 1, 1, 2, 3, 4))))
        core_used += len(chosen_core)
        picks += chosen_core
        if not picks:
            picks = pool["keywords"][:1] or pool["label"] or [q["name"]]
        skills += picks
    skills += rng.sample(GENERIC_SKILLS, k=rng.choice((0, 0, 1, 1, 2, 3)))
    rng.shuffle(skills)
    skills = [typo(s, rng) if rng.random() < 0.08 else s for s in skills]
    unique: dict[str, str] = {}
    for s in skills:
        unique.setdefault(s.casefold(), styled(s, rng))
    skills = list(unique.values())[:8]

    years = rng.choice((0, 0, 0, 0.5, 1, 1, 2, 2, 3, 4, 5, 7, 10))
    jobs = main.get("possible_jobs") or [main["skill_label"] or main["name"]]
    experience = [] if years == 0 else [{"job_title": rng.choice(jobs).title(), "years": years}]

    # Some learners already hold a lower level of the same family: they aim for the next level.
    targets, certificates = [q["code"] for q in quals], []
    main_level = level(main["name"])
    if main_level and main_level > 1 and rng.random() < 0.3:
        lower = [q for q in by_family[family(main["name"])] if (level(q["name"]) or 0) < main_level]
        if lower:
            held = rng.choice(lower)
            certificates.append({"qualification_code": held["code"], "name": held["name"], "status": "valid"})

    coverage = core_used / core_total if core_total else 0.0
    # Ready for assessment: enough experience plus evidence of the Core work (or a long time doing the job).
    ready = years >= 2 and (coverage >= 0.4 or core_used >= 2 or bool(certificates) or years >= 4)
    return {"id": pid, "region_code": None, "education": rng.choice(EDUCATION), "skills": skills,
            "experience": experience, "experience_years": years, "certificates": certificates,
            "query": ", ".join(skills), "targets": targets, "sector": main["sector"],
            "route": ROUTE_ASSESS if ready else ROUTE_TRAIN, "core_coverage": round(coverage, 3),
            "kind": "two_qualifications" if len(quals) > 1 else "single", "synthetic": True}


def make_unrelated(rng: random.Random, pid: str) -> dict:
    skills = rng.sample(UNRELATED_SKILLS, k=rng.choice((1, 2, 2, 3)))
    skills += rng.sample(GENERIC_SKILLS, k=rng.choice((0, 1, 2)))
    rng.shuffle(skills)
    skills = [styled(s, rng) for s in skills]
    return {"id": pid, "region_code": None, "education": rng.choice(EDUCATION[5:8]), "skills": skills,
            "experience": [], "experience_years": rng.choice((0, 1, 3, 5)), "certificates": [],
            "query": ", ".join(skills), "targets": [], "sector": None, "route": None, "core_coverage": 0.0,
            "kind": "unrelated", "synthetic": True}


def profiles(catalog: list[dict], regions: list[str], per_q: int, rng: random.Random) -> list[dict]:
    by_family: dict[str, list[dict]] = {}
    by_sector: dict[str, list[dict]] = {}
    for q in catalog:
        by_family.setdefault(family(q["name"]), []).append(q)
        by_sector.setdefault(q["sector"], []).append(q)
    rows = []
    for q in catalog:
        for i in range(per_q):
            pair = [q]
            if rng.random() < 0.15 and len(by_sector[q["sector"]]) > 1:
                other = rng.choice([o for o in by_sector[q["sector"]]
                                    if o["code"] != q["code"] and family(o["name"]) != family(q["name"])] or [q])
                if other is not q:
                    pair.append(other)
            rows.append(make_profile(rng, pair, by_family, f"syn-{q['code']}-{i:03d}"))
    rows += [make_unrelated(rng, f"syn-unrelated-{i:04d}") for i in range(max(200, len(catalog) * per_q // 20))]
    weights = [REGION_WEIGHT[r] for r in regions]
    for row in rows:
        row["region_code"] = rng.choices(regions, weights)[0]
    # Split by qualification-profile index so every qualification appears in all three splits.
    for row in rows:
        h = int.from_bytes(row["id"].encode(), "little") % 1000003
        row["split"] = "test" if h % 10 == 0 else "val" if h % 10 == 1 else "train"
    rng.shuffle(rows)
    return rows


def demand(catalog: list[dict], regions: dict[str, str], rng: random.Random) -> list[dict]:
    rows = []
    for q in catalog:
        name = q["name"].lower()
        popularity = math.exp(rng.gauss(0, 0.45)) * max([v for k, v in POPULAR.items() if k in name] or [1.0])
        sector = q["sector"]
        g = SECTOR_GROWTH.get(sector, DEFAULT_GROWTH)
        drift = rng.gauss(0, 0.04)  # qualification's own trend around its sector
        season = SECTOR_SEASON.get(sector, (1.0, 1.0, 1.0, 1.0))
        for code, region_name in regions.items():
            regional = REGION_WEIGHT[code] * REGION_SECTOR.get(sector, {}).get(code, 1.0)
            base = 900 * popularity * regional * math.exp(rng.gauss(0, 0.25))  # postings per quarter in 2023
            supply = base * rng.uniform(0.7, 1.8)  # applicants per quarter in 2023
            supply_growth = rng.gauss(0.04, 0.03)
            level_ = 1.0
            for year, quarter in PERIODS:
                if quarter == 1 and year > 2023:
                    level_ *= 1 + g[year - 2024] + drift
                mean = base * level_ * season[quarter - 1]
                postings = max(0, round(mean * math.exp(rng.gauss(0, 0.12))))
                vacancies = max(postings, round(postings * rng.uniform(1.0, 2.4)))
                applicants = max(0, round(supply * (1 + supply_growth) ** (year - 2023) * math.exp(rng.gauss(0, 0.15))))
                hires = min(vacancies, round(min(vacancies, applicants) * rng.uniform(0.35, 0.7)))
                rows.append({"period": f"{year}-Q{quarter}", "year": year, "quarter": quarter,
                             "region_code": code, "region_name": region_name, "sector": sector,
                             "qualification_code": q["code"], "qualification_name": q["name"],
                             "job_postings": postings, "vacancies": vacancies, "applicants": applicants,
                             "hires": hires, "demand_supply_ratio": round(vacancies / max(applicants, 1), 3),
                             "is_projection": (year, quarter) in PROJECTION, "synthetic": True})
    # Demand index: log vacancies scaled to 0-100 over the whole table.
    logs = [math.log1p(r["vacancies"]) for r in rows]
    lo, hi = min(logs), max(logs)
    for r, value in zip(rows, logs):
        r["demand_index"] = round(100 * (value - lo) / (hi - lo), 1)
    return rows


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--per-qualification", type=int, default=24)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args(argv)

    catalog = json.loads((SEED / "qualifications.json").read_text(encoding="utf-8"))
    regions = {r["code"]: r["name"] for r in json.loads((SEED / "regions.json").read_text(encoding="utf-8"))}
    missing = set(regions) ^ set(REGION_WEIGHT)
    if missing:
        raise SystemExit(f"Region codes differ from seed/regions.json: {sorted(missing)}")
    args.output.mkdir(parents=True, exist_ok=True)

    people = profiles(catalog, list(regions), args.per_qualification, random.Random(args.seed))
    with (args.output / "profiles.jsonl").open("w", encoding="utf-8") as f:
        for row in people:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    table = demand(catalog, regions, random.Random(args.seed + 1))
    with (args.output / "demand_quarterly.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)

    counts: dict[str, int] = {}
    for row in people:
        counts[f"{row['kind']}/{row['split']}"] = counts.get(f"{row['kind']}/{row['split']}", 0) + 1
    routes = {r: sum(p["route"] == r for p in people) for r in (ROUTE_ASSESS, ROUTE_TRAIN)}
    print(f"{len(people):,} profiles {dict(sorted(counts.items()))}; routes {routes}")
    print(f"{len(table):,} demand rows ({len(catalog)} qualifications x {len(regions)} regions x {len(PERIODS)} quarters)")


if __name__ == "__main__":
    main()
