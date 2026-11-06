"""Assessor labels for profile-only suggestions: a blind sheet to fill in, their agreement, and a case file from them.

Run from backend/:

    # 1. A stratified, blind sheet: each sampled profile with every qualification any system would show it
    python -m evaluation.labeling sheet --model-path models/tesda-e5-small-v6-colab --from-db --allow-learner-text \
        --per-stratum 12 --out ../reports/labeling
    # 2. Each assessor fills in their own copy of sheet.csv on their own; then
    python -m evaluation.labeling agreement ../reports/labeling/key.json rater-*.csv --out ../reports/labeling/agreement.json
    # 3. Labels the evaluation can use (source file:suggestion_assessor_v1)
    python -m evaluation.labeling cases ../reports/labeling/key.json rater-*.csv --reviewer "Name, TESDA assessor" ... \
        --out evaluation/data/suggestion_assessor_v1.json

The sheet never says which system showed what, and lists candidates in random order, so assessors judge each one on
its own. Two extra rows per profile ask whether no TESDA qualification fits, and which one would if none listed does.
key.json maps rows back to systems and strata; it holds no learner identifiers, but keep it away from assessors.

With --from-db the sheet holds real learners' Skill Passport skills (no names or identifiers). Sharing them with
assessors is a use of learner data: --allow-learner-text records that you have approval for it.
"""
import argparse
import csv
import hashlib
import json
import random
import statistics
from collections import Counter, defaultdict
from datetime import UTC, datetime
from itertools import combinations
from pathlib import Path

GRADES = (0, 1, 2, 3)
NONE_ROW, OTHER_ROW = "__NONE__", "__OTHER__"
SHEET_COLUMNS = ["row_id", "profile_id", "skills", "candidate_code", "candidate_qualification", "grade",
                 "other_qualification", "notes"]
INSTRUCTIONS = """# Judging qualification suggestions

Each profile is the list of skills on a learner's TESDA Skill Passport. Under it are qualifications that might be
suggested to that learner as a place to start, in no particular order. Judge each one on its own, without asking
which system produced it (the sheet doesn't say).

For each qualification row, write a grade in the `grade` column:

| Grade | Meaning |
| --- | --- |
| 3 | Strongly relevant: the qualification you would point this learner to first |
| 2 | Relevant: a reasonable place to start (another level or a close variant) |
| 1 | Partly relevant: related, but you would not suggest it to this learner |
| 0 | Not relevant: suggesting it would mislead this learner |

Two extra rows per profile:

- `No TESDA qualification fits these skills`: grade 3 if you are sure none fits, 2 if probably none fits, 0 if one
  clearly fits. Fill this in even when you graded the others.
- `Something better that is not listed`: if a qualification you would suggest is missing, write its exact name in
  `other_qualification`. Leave the grade empty.

Judge from the skills alone. Leave `notes` for anything unclear (skills you can't read, mixed languages, typos).
Please fill in the sheet on your own, without discussing it with other assessors: their agreement is part of what
is measured.
"""


# --- Sheet ---------------------------------------------------------------------------------------------------------


def stratum(case, shown_by_suggest: list[str], top_regions: set[str]) -> str:
    from evaluation.suggestions import profile_size

    region = case.region if case.region in top_regions else "other"
    return f"{'shown' if shown_by_suggest else 'abstained'}|size {profile_size(case)}|{region}"


def build_sheet(cases, runs_by_system: dict, items, per_stratum: int, seed: int) -> tuple[list[dict], dict]:
    """Rows for assessors and the key behind them. Cases with no skills are left out: there is nothing to judge."""
    name_of = {item.code: item.summary.name for item in items}
    suggest = runs_by_system["suggest"][0]
    regions = Counter(c.region for c in cases if c.region)
    top_regions = {region for region, _ in regions.most_common(6)}
    by_stratum: dict[str, list[int]] = defaultdict(list)
    for index, case in enumerate(cases):
        if any(s.strip() for s in case.skills):
            by_stratum[stratum(case, suggest[index], top_regions)].append(index)
    rng = random.Random(seed)
    rows, key = [], {"generated_at": datetime.now(UTC).isoformat(timespec="seconds"), "seed": seed,
                     "per_stratum": per_stratum, "strata": {}, "profiles": {}, "rows": {}}
    for name, indices in sorted(by_stratum.items()):
        chosen = sorted(rng.sample(indices, min(per_stratum, len(indices))))
        key["strata"][name] = {"available": len(indices), "sampled": len(chosen)}
        for index in chosen:
            case = cases[index]
            profile_id = "P" + hashlib.sha256(f"{seed}:{case.id}".encode()).hexdigest()[:8]
            candidates: dict[str, dict[str, int]] = defaultdict(dict)
            for system, runs in runs_by_system.items():
                if system.startswith("hybrid_kw") or system == "random":
                    continue
                for rank, code in enumerate(runs[0][index], 1):
                    candidates[code][system] = rank
            order = sorted(candidates)
            rng.shuffle(order)
            skills = " | ".join(s.strip() for s in case.skills if s.strip())
            key["profiles"][profile_id] = {"stratum": name, "kind": case.kind, "language": case.language,
                                           "region": case.region, "origin": case.origin, "source": case.source,
                                           "skills": [s.strip() for s in case.skills if s.strip()]}
            for code in order + [NONE_ROW, OTHER_ROW]:
                row_id = f"{profile_id}-{len([r for r in rows if r['profile_id'] == profile_id]) + 1:02d}"
                label = {NONE_ROW: "No TESDA qualification fits these skills",
                         OTHER_ROW: "Something better that is not listed"}.get(code, name_of.get(code, code))
                rows.append({"row_id": row_id, "profile_id": profile_id, "skills": skills, "candidate_code": code,
                             "candidate_qualification": label, "grade": "", "other_qualification": "", "notes": ""})
                key["rows"][row_id] = {"profile_id": profile_id, "code": code,
                                       "shown_by": candidates.get(code, {})}
    return rows, key


def write_sheet(rows: list[dict], key: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    with (out / "sheet.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=SHEET_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (out / "INSTRUCTIONS.md").write_text(INSTRUCTIONS, encoding="utf-8")
    (out / "key.json").write_text(json.dumps(key, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# --- Reading filled sheets -----------------------------------------------------------------------------------------


def read_ratings(paths: list[Path], key: dict) -> dict[str, dict[str, dict]]:
    """{rater: {row_id: {"grade": int | None, "other": str, "notes": str}}}; the rater is the file's name."""
    ratings = {}
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        missing = set(SHEET_COLUMNS) - set(rows[0] if rows else {})
        if missing:
            raise ValueError(f"{path.name}: missing columns {sorted(missing)}")
        mine = {}
        for row in rows:
            if row["row_id"] not in key["rows"]:
                raise ValueError(f"{path.name}: row {row['row_id']} is not in this key")
            text = (row["grade"] or "").strip()
            if text and text not in {str(g) for g in GRADES}:
                raise ValueError(f"{path.name}: row {row['row_id']} has grade {text!r}; use 0, 1, 2 or 3")
            mine[row["row_id"]] = {"grade": int(text) if text else None,
                                   "other": (row["other_qualification"] or "").strip(),
                                   "notes": (row["notes"] or "").strip()}
        ratings[path.stem] = mine
    if len(ratings) < 2:
        raise ValueError("Agreement needs at least two raters' sheets")
    return ratings


def units(ratings: dict, key: dict) -> dict[str, list[int]]:
    """Graded rows (not the free-text OTHER rows) with every grade given for them."""
    by_row: dict[str, list[int]] = defaultdict(list)
    for mine in ratings.values():
        for row_id, value in mine.items():
            if value["grade"] is not None and key["rows"][row_id]["code"] != OTHER_ROW:
                by_row[row_id].append(value["grade"])
    return dict(by_row)


# --- Agreement -----------------------------------------------------------------------------------------------------


def krippendorff_alpha_ordinal(values_by_unit: dict[str, list[int]]) -> float | None:
    """Krippendorff's alpha with the ordinal distance, over units rated at least twice (missing ratings allowed)."""
    pairable = [v for v in values_by_unit.values() if len(v) >= 2]
    categories = sorted({x for v in pairable for x in v})
    if len(categories) < 2:
        return 1.0 if pairable else None
    index = {c: i for i, c in enumerate(categories)}
    size = len(categories)
    coincidence = [[0.0] * size for _ in range(size)]
    for values in pairable:
        m = len(values)
        for i, a in enumerate(values):
            for j, b in enumerate(values):
                if i != j:
                    coincidence[index[a]][index[b]] += 1 / (m - 1)
    totals = [sum(row) for row in coincidence]
    n = sum(totals)

    def delta(c: int, k: int) -> float:
        low, high = min(c, k), max(c, k)
        return (sum(totals[low:high + 1]) - (totals[low] + totals[high]) / 2) ** 2

    observed = sum(coincidence[c][k] * delta(c, k) for c in range(size) for k in range(size))
    expected = sum(totals[c] * totals[k] * delta(c, k) for c in range(size) for k in range(size))
    return 1 - (n - 1) * observed / expected if expected else None


def fleiss_kappa_binary(values_by_unit: dict[str, list[int]], threshold: int = 2) -> float | None:
    """Fleiss' kappa for 'relevant or better' (grade >= threshold), over units with the same number of raters
    (the most common count), as Fleiss requires."""
    counts = Counter(len(v) for v in values_by_unit.values() if len(v) >= 2)
    if not counts:
        return None
    raters = counts.most_common(1)[0][0]
    table = [[sum(x >= threshold for x in v), sum(x < threshold for x in v)]
             for v in values_by_unit.values() if len(v) == raters]
    n_units = len(table)
    p = [sum(row[j] for row in table) / (n_units * raters) for j in (0, 1)]
    agreement = statistics.fmean((sum(x * x for x in row) - raters) / (raters * (raters - 1)) for row in table)
    chance = sum(x * x for x in p)
    return (agreement - chance) / (1 - chance) if chance < 1 else None


def cohen_kappa_quadratic(a: list[int], b: list[int]) -> float | None:
    """Cohen's kappa with quadratic weights for two raters' grades on the same rows."""
    if not a or len(a) != len(b):
        return None
    size = len(GRADES)
    observed = [[0.0] * size for _ in range(size)]
    for x, y in zip(a, b):
        observed[x][y] += 1
    n = len(a)
    row = [sum(observed[i]) for i in range(size)]
    col = [sum(observed[i][j] for i in range(size)) for j in range(size)]
    weight = lambda i, j: (i - j) ** 2 / (size - 1) ** 2
    disagreement = sum(weight(i, j) * observed[i][j] for i in range(size) for j in range(size)) / n
    chance = sum(weight(i, j) * row[i] * col[j] for i in range(size) for j in range(size)) / (n * n)
    return 1 - disagreement / chance if chance else None


def agreement_report(ratings: dict, key: dict, minimum_alpha: float = 0.667) -> dict:
    graded = units(ratings, key)
    candidates = {row: v for row, v in graded.items() if key["rows"][row]["code"] != NONE_ROW}
    none_rows = {row: v for row, v in graded.items() if key["rows"][row]["code"] == NONE_ROW}
    pairwise = {}
    for first, second in combinations(sorted(ratings), 2):
        shared = [row for row in candidates if ratings[first].get(row, {}).get("grade") is not None
                  and ratings[second].get(row, {}).get("grade") is not None]
        pairwise[f"{first} vs {second}"] = {
            "rows": len(shared),
            "exact_agreement": statistics.fmean(ratings[first][r]["grade"] == ratings[second][r]["grade"]
                                                for r in shared) if shared else None,
            "cohen_kappa_quadratic": cohen_kappa_quadratic([ratings[first][r]["grade"] for r in shared],
                                                           [ratings[second][r]["grade"] for r in shared])}
    alpha = krippendorff_alpha_ordinal(candidates)
    return {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"), "raters": sorted(ratings),
        "profiles": len({key["rows"][r]["profile_id"] for r in graded}),
        "candidate_rows_rated_twice_or_more": sum(len(v) >= 2 for v in candidates.values()),
        "krippendorff_alpha_ordinal": alpha,
        "fleiss_kappa_relevant": fleiss_kappa_binary(candidates),
        "krippendorff_alpha_nothing_fits": krippendorff_alpha_ordinal(none_rows),
        "pairwise": pairwise, "minimum_alpha": minimum_alpha,
        "meets_minimum": alpha is not None and alpha >= minimum_alpha,
    }


# --- Case file from labels -----------------------------------------------------------------------------------------


def case_file(ratings: dict, key: dict, reviewers: list[str], code_by_name: dict[str, str]) -> dict:
    """One labeled case per profile: each candidate's median grade (rounded down), expected-empty when assessors
    say nothing fits and no candidate is relevant, and any missing qualification they named (grade 3)."""
    grades: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    others: dict[str, Counter] = defaultdict(Counter)
    for mine in ratings.values():
        for row_id, value in mine.items():
            row = key["rows"][row_id]
            if row["code"] == OTHER_ROW and value["other"]:
                others[row["profile_id"]][value["other"].casefold()] += 1
            elif value["grade"] is not None:
                grades[row["profile_id"]][row["code"]].append(value["grade"])
    cases, skipped = [], Counter()
    for profile_id, profile in sorted(key["profiles"].items()):
        judged = {code: int(statistics.median_low(v)) for code, v in grades[profile_id].items() if code != NONE_ROW}
        named = {code_by_name[name] for name, n in others[profile_id].items() if n >= 2 and name in code_by_name}
        judged |= {code: 3 for code in named}
        nothing_fits = statistics.median_low(grades[profile_id][NONE_ROW]) >= 2 if grades[profile_id][NONE_ROW] else False
        if any(g > 0 for g in judged.values()):
            judgments, expect_empty = judged, False
        elif nothing_fits:
            judgments, expect_empty = {}, True
        else:
            skipped["no_relevant_candidate_and_not_agreed_nothing_fits"] += 1
            continue
        cases.append({"id": profile_id, "kind": profile["kind"], "language": profile["language"],
                      "skills": profile["skills"], "judgments": judgments, "expect_empty": expect_empty,
                      "region": profile["region"], "origin": profile["origin"]})
    return {"version": "suggestion-assessor-v1", "review_status": "expert_reviewed",
            "provenance": f"Graded by {len(ratings)} TESDA assessors on a blind, stratified sheet "
                          f"(evaluation.labeling, seed {key['seed']}); median grade per candidate. "
                          f"Skipped: {dict(skipped)}",
            "reviewers": reviewers, "cases": cases}


# --- Main ----------------------------------------------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    sheet = commands.add_parser("sheet", help="a blind, stratified sheet for assessors")
    sheet.add_argument("--out", type=Path, required=True)
    sheet.add_argument("--model-path", type=Path, default=None)
    sheet.add_argument("--model", default=None)
    sheet.add_argument("--from-db", action="store_true", help="sample the TSP profiles stored on this server")
    sheet.add_argument("--allow-learner-text", action="store_true",
                       help="required with --from-db: you have approval to show learners' skills to assessors")
    sheet.add_argument("--cases", type=Path, nargs="*", help="sample from labeled case files instead")
    sheet.add_argument("--since", default=None)
    sheet.add_argument("--exclude-subjects", default=None)
    sheet.add_argument("--per-stratum", type=int, default=12)
    sheet.add_argument("--seed", type=int, default=29)
    for name in ("agreement", "cases"):
        sub = commands.add_parser(name)
        sub.add_argument("key", type=Path)
        sub.add_argument("sheets", type=Path, nargs="+", help="one filled sheet per assessor (named after them)")
        sub.add_argument("--out", type=Path, required=True)
        if name == "cases":
            sub.add_argument("--reviewer", action="append", required=True, help="name and role, once per assessor")
    args = parser.parse_args(argv)

    if args.command == "sheet":
        if args.from_db and not args.allow_learner_text:
            parser.error("--from-db puts learners' skills on the sheet; add --allow-learner-text once approved")
        if not args.from_db and not args.cases:
            parser.error("give --from-db or --cases")
        from datetime import date

        import numpy as np

        from evaluation import suggestions as S
        from tesda_track.config import get_settings
        from tesda_track.services.analysis import match_params
        from tesda_track.services.embeddings import E5Embedder, qualification_text
        from training.catalog import load_catalog

        qualifications, items = load_catalog()
        known = {item.code for item in items}
        cases = []
        for path in args.cases or []:
            cases += S.file_cases(path, f"file:{path.stem}", known)[1]
        popularity = None
        if args.from_db:
            exclude = set(Path(args.exclude_subjects).read_text().split()) if args.exclude_subjects else set()
            cases += S.real_cases(items, date.fromisoformat(args.since) if args.since else None, exclude)[0]
            popularity = S.db_popularity(items)
        settings = get_settings()
        model = args.model or (f"tesda-track/{args.model_path.name}" if args.model_path else settings.embedding_model)
        path = args.model_path or (None if args.model else settings.embedding_model_path)
        embedder = E5Embedder(model, settings.embedding_cache_dir, str(path) if path else None)
        passages = S._unit(np.asarray(embedder.embed_passages([qualification_text(q) for q in qualifications])))
        prepared = S.prepare(cases, items, passages, embedder.embed_queries)
        runs = S.systems(prepared, items, match_params(embedder), popularity, 1, args.seed)
        rows, key = build_sheet(cases, runs, items, args.per_stratum, args.seed)
        key["model"] = model
        write_sheet(rows, key, args.out)
        print(f"{len(key['profiles'])} profiles, {len(rows)} rows -> {args.out / 'sheet.csv'}")
        for name, row in key["strata"].items():
            print(f"  {name}: {row['sampled']} of {row['available']}")
        return 0

    key = json.loads(args.key.read_text(encoding="utf-8"))
    ratings = read_ratings(args.sheets, key)
    if args.command == "agreement":
        report = agreement_report(ratings, key)
    else:
        from training.catalog import load_catalog

        _, items = load_catalog()
        code_by_name = {item.summary.name.casefold(): item.code for item in items}
        report = case_file(ratings, key, args.reviewer, code_by_name)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("cases", "pairwise")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
