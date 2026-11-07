"""Employer demand for jobs as labelled matching data for the v5 model (no torch or database).

The sources are the 2026-11-04 snapshot in seed/sources/labor_demand/ (see its README): PhilJobNet postings
(DOLE-BLE), Career Info PH job profiles (DOLE-BLE) and the DOLE IV-A JLMF 2026-2027 priority occupations. Only job
titles and counts are used: no employer names, no location finer than the region, nothing about a person.

Run from backend/ in the main environment:
    python -m training.demand_labeled worksheet --model-path models/tesda-e5-small-v3 --output training/runs/demand-worksheet.json
    (label every title in the worksheet with accept, relation and note: see V5.md)
    python -m training.demand_labeled build --worksheet training/runs/demand-worksheet.json --labels training/runs/demand-labels.json
build writes data/v5/demand_jobs.json (every title with its labels and a split fixed by a hash of its key) and the
held-out goal files goals_v2/dev/V5_demand.json and goals_v2/sealed/V5_demand.json. Titles in the train split become
training queries (training/v5_demand.py); dev and sealed titles become evaluation goals and never training queries.
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
import re
from pathlib import Path

from tesda_track.utils.helpers import normalize

BACKEND = Path(__file__).resolve().parents[1]
SOURCES = BACKEND / "seed" / "sources" / "labor_demand"
SNAPSHOT = "2026-11-04"
DATA = Path(__file__).resolve().parent / "data" / "v5"
DEMAND_PATH = DATA / "demand_jobs.json"
GOALS_DIR = Path(__file__).resolve().parent / "data" / "goals_v2"
GOAL_FILE = "V5_demand.json"
RELATIONS = ("direct", "near", "none")
# direct: the qualification trains for the job's work. near: the job needs a degree or licence, and the qualification
# is the nearest TESDA route (the dev set's near_tvet convention: "civil engineer" -> Technical Drafting NC II).
# none: nothing in the catalog trains for the job's work; such a title is only ever an evaluation goal (rejection).
SPLIT_SHARES = (("train", 70), ("dev", 85), ("sealed", 100))  # cumulative percent, by a hash of the key
HIGH_DEMAND = 5  # PhilJobNet postings from which a title gets the extra phrasings below
CANDIDATES = 6


def title_key(title: str) -> str:
    """Groups the spellings of one job: "Electrician (General)", "electrician" -> "electrician".

    The key decides the split, so two spellings of one title never land on both sides of it."""
    text = normalize(title)
    stripped = re.sub(r"\([^)]*\)", " ", text)
    stripped = re.sub(r"[^\w&/+'-]+", " ", stripped)
    stripped = re.sub(r"\s*/\s*", "/", stripped)
    return " ".join(stripped.split()) or " ".join(text.split())


def clean_title(title: str) -> str:
    """The title as a learner might type it: PhilJobNet's "(general)" dropped, spacing tidied."""
    return " ".join(re.sub(r"\(\s*general\s*\)", " ", title, flags=re.IGNORECASE).split())


def hash_split(key: str) -> str:
    bucket = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16) % 100
    return next(split for split, upper in SPLIT_SHARES if bucket < upper)


def catalog_terms(qualifications) -> set[str]:
    """Keys of every name, skill, job and keyword in the catalog: titles the catalog already trains on."""
    terms = set()
    for q in qualifications:
        for text in (q.name, q.skill_label or "", *q.possible_jobs, *q.career_keywords):
            if text.strip():
                terms.add(title_key(text))
    return terms


def _read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def collect(sources: Path = SOURCES) -> dict[str, dict]:
    """Every demand title by key, with what each source says about it (counts and qualification text, no employers)."""
    found: dict[str, dict] = defaultdict(lambda: {"titles": Counter(), "postings": 0, "employers": set(),
                                                  "ncr_postings": 0, "regions": set(), "education": Counter(),
                                                  "careerinfo": [], "jlmf": []})
    for row in _read_csv(sources / f"philjobnet_vacancies_{SNAPSHOT}.csv"):
        entry = found[title_key(row["title_normalized"])]
        entry["titles"][clean_title(row["title_normalized"])] += 1
        entry["postings"] += 1
        entry["employers"].add(row["employer"])  # counted only; names never leave this function
        entry["ncr_postings"] += row["region"] == "NCR"
        entry["regions"].add(row["region"])
        entry["education"][row["education"]] += 1
    for row in _read_csv(sources / "careerinfo_ph_careers.csv"):
        entry = found[title_key(row["title"])]
        entry["titles"][clean_title(normalize(row["title"]))] += 0
        entry["careerinfo"].append({"list": row["lists"], "title": row["title"],
                                    "tesda_mentions": row["tesda_mentions"],
                                    "qualifications": row["qualifications"][:300]})
    for row in _read_csv(sources / "jlmf_calabarzon_2026_2027_priority_occupations.csv"):
        entry = found[title_key(row["occupation"])]
        entry["titles"][clean_title(normalize(row["occupation"]))] += 0
        entry["jlmf"].append({"sector": row["sector"], "occupation": row["occupation"],
                              "in_demand": row["in_demand"] == "True", "hard_to_fill": row["hard_to_fill"] == "True",
                              "qualification": row["general_qualification"][:300],
                              "mentions_tesda": row["mentions_tesda_or_nc"] == "True"})
    result = {}
    for key, entry in found.items():
        titles = [t for t, _ in sorted(entry["titles"].items(), key=lambda item: (-item[1], len(item[0]), item[0]))]
        result[key] = {
            "key": key, "title": titles[0], "variants": titles[:5],
            "demand": {"philjobnet_postings": entry["postings"], "philjobnet_employers": len(entry["employers"]),
                       "ncr_postings": entry["ncr_postings"], "regions": len(entry["regions"]),
                       "education": entry["education"].most_common(1)[0][0] if entry["education"] else None,
                       "careerinfo_lists": sorted({c["list"] for c in entry["careerinfo"]}),
                       "jlmf_sectors": sorted({j["sector"] for j in entry["jlmf"]})},
            "careerinfo": entry["careerinfo"], "jlmf": entry["jlmf"]}
    return dict(sorted(result.items(), key=lambda item: (-item[1]["demand"]["philjobnet_postings"], item[0])))


def is_high_demand(row: dict) -> bool:
    demand = row["demand"]
    return (demand["philjobnet_postings"] >= HIGH_DEMAND or bool(demand["careerinfo_lists"])
            or bool(demand["jlmf_sectors"]))


def worksheet(sources: Path, model_name: str, model_path: str | None) -> list[dict]:
    """The titles to label, each with the current model's closest qualifications as a starting point."""
    import numpy as np

    from tesda_track.services.embeddings import E5Embedder, qualification_text
    from training.catalog import load_catalog

    qualifications, _ = load_catalog()
    known = catalog_terms(qualifications)
    rows = list(collect(sources).values())
    embedder = E5Embedder(model_name, None, model_path)
    passages = np.array(embedder.embed_passages([qualification_text(q) for q in qualifications]))
    queries = np.array(embedder.embed_queries([row["title"] for row in rows]))
    similarity = queries @ passages.T
    for row, scores in zip(rows, similarity):
        best = np.argsort(-scores)[:CANDIDATES]
        row["candidates"] = [[qualifications[i].name, round(float(scores[i]), 3)] for i in best]
        row["catalog_known"] = row["key"] in known
    return rows


def article(title: str) -> str:
    return "an" if title[:1].lower() in "aeiou" else "a"


# Phrasings of a held-out title as a learner's goal; none of them is used for training queries (see training/v5_demand.py).
EVAL_PHRASINGS = (("{title}", "en", ["short"]), ("{title}", "en", ["short"]),
                  ("looking for work as {article} {title}", "en", []),
                  ("gusto kong mag-apply bilang {title}", "taglish", []))


def _phrasings(key: str):
    start = int(hashlib.sha256(f"phrasing:{key}".encode("utf-8")).hexdigest()[:8], 16) % len(EVAL_PHRASINGS)
    return EVAL_PHRASINGS[start:] + EVAL_PHRASINGS[:start]


def eval_goals(rows: list[dict], taken: set[str]) -> dict[str, list[dict]]:
    """One goal per dev or sealed title, in a phrasing that is neither an existing goal nor a training query."""
    result = {"dev": [], "sealed": []}
    for row in rows:
        if row["split"] == "train":
            continue
        for template, lang, extra in _phrasings(row["key"]):
            text = template.format(title=row["title"], article=article(row["title"]))
            if normalize(text) not in taken:
                break
        else:
            continue
        taken.add(normalize(text))
        tags = ["demand", "job_title", *extra]
        tags += {"near": ["near_tvet"], "none": ["no_tvet"]}.get(row["relation"], [])
        result[row["split"]].append({"goal": text, "accept": list(row["accept"]), "lang": lang, "tags": tags,
                                     "group": "demand"})
    return result


def validate(rows: list[dict], names: set[str]) -> None:
    keys = Counter(row["key"] for row in rows)
    if duplicated := [key for key, count in keys.items() if count > 1]:
        raise ValueError(f"demand titles labelled more than once: {duplicated[:5]}")
    for row in rows:
        where = f"demand title {row['key']!r}"
        if row.get("relation") not in RELATIONS:
            raise ValueError(f"{where} has relation {row.get('relation')!r}; choose from {', '.join(RELATIONS)}")
        accept = row.get("accept")
        if not isinstance(accept, list) or len(set(accept)) != len(accept):
            raise ValueError(f"{where} needs an accept list without repeats")
        if unknown := [name for name in accept if name not in names]:
            raise ValueError(f"{where} accepts unknown qualification {unknown[0]!r}")
        if (row["relation"] == "none") != (not accept):
            raise ValueError(f"{where}: relation 'none' and an empty accept list go together")
        if row.get("split") not in ("train", "dev", "sealed"):
            raise ValueError(f"{where} has split {row.get('split')!r}")
        if row.get("review_status") not in ("draft", "reviewed"):
            raise ValueError(f"{where} has review_status {row.get('review_status')!r}")
        if not isinstance(row.get("title"), str) or not row["title"].strip():
            raise ValueError(f"{where} has no title")


def load(path: Path = DEMAND_PATH) -> list[dict]:
    """The labelled demand titles, validated against the catalog."""
    from training.catalog import load_catalog

    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError(f"{path.name}: expected a JSON list")
    validate(rows, {q.name for q in load_catalog()[0]})
    return rows


def build(worksheet_rows: list[dict], labels: list[dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    """Labelled demand rows with fixed splits, and the dev and sealed goals made from the held-out ones."""
    from training import goals, v4
    from training.catalog import load_catalog
    from training.pairs import load_synthetic, training_pairs

    qualifications, _ = load_catalog()
    by_key = {label["key"]: label for label in labels}
    if missing := [row["key"] for row in worksheet_rows if row["key"] not in by_key]:
        raise ValueError(f"{len(missing)} titles have no label, e.g. {missing[:5]}")
    if extra := sorted(set(by_key) - {row["key"] for row in worksheet_rows}):
        raise ValueError(f"labels for titles not in the worksheet: {extra[:5]}")
    rows = []
    for row in worksheet_rows:
        label = by_key[row["key"]]
        rows.append({"key": row["key"], "title": row["title"], "variants": row["variants"], "demand": row["demand"],
                     "accept": list(label["accept"]), "relation": label["relation"], "note": label.get("note", ""),
                     "split": "train" if row["catalog_known"] else hash_split(row["key"]),
                     "catalog_known": row["catalog_known"], "review_status": "draft"})
    validate(rows, {q.name for q in qualifications})
    # A goal must not equal a training query (it would be dropped from training) or another goal (the loader refuses).
    own = {normalize(g) for split in ("dev", "sealed") for g in _goal_texts(GOALS_DIR / split / GOAL_FILE)}
    taken = {normalize(text) for text in goals.curated_texts()} - own
    synthetic, _ = v4.enrich(qualifications, load_synthetic(), set())
    taken |= {normalize(query) for query, _ in training_pairs(qualifications, set(), synthetic)}
    from training import v5_demand as v5

    taken |= {normalize(query) for row in rows if row["split"] == "train" for query in v5.queries(row)}
    return rows, eval_goals(rows, taken)


def _goal_texts(path: Path) -> list[str]:
    return [g["goal"] for g in json.loads(path.read_text(encoding="utf-8"))] if path.is_file() else []


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    sheet = commands.add_parser("worksheet", help="titles to label, with the current model's suggestions")
    sheet.add_argument("--sources", type=Path, default=SOURCES)
    sheet.add_argument("--model", default=None, help="model name; default tesda-track/<model-path folder>")
    sheet.add_argument("--model-path", type=Path, required=True)
    sheet.add_argument("--output", type=Path, required=True)
    building = commands.add_parser("build", help="write data/v5/demand_jobs.json and the V5 goal files")
    building.add_argument("--worksheet", type=Path, required=True)
    building.add_argument("--labels", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "worksheet":
        rows = worksheet(args.sources, args.model or f"tesda-track/{args.model_path.name}", str(args.model_path))
        _write(args.output, rows)
        print(f"{args.output}: {len(rows)} titles, {sum(r['catalog_known'] for r in rows)} already catalog terms")
        return
    rows, goal_sets = build(json.loads(args.worksheet.read_text(encoding="utf-8")),
                            json.loads(args.labels.read_text(encoding="utf-8")))
    _write(DEMAND_PATH, rows)
    for split, items in goal_sets.items():
        _write(GOALS_DIR / split / GOAL_FILE, items)
    print(json.dumps({"titles": len(rows), "by_split": Counter(r["split"] for r in rows),
                      "by_relation": Counter(r["relation"] for r in rows),
                      "goals": {split: len(items) for split, items in goal_sets.items()}}, indent=2))


if __name__ == "__main__":
    main()
