"""Demand-informed recipe: v4 plus the job titles employers post (PhilJobNet, Career Info PH, DOLE IV-A JLMF).

Each train-split title of data/v5/demand_jobs.json (see training/demand_labeled.py) becomes queries for the qualifications
it was labelled with: the title as employers write it and as a short goal in English and Filipino. Titles in demand
(HIGH_DEMAND postings, or listed by Career Info PH or the JLMF) also get a hiring-style question and the v4 regional
job patterns. Titles labelled "none" have no qualification, so they never train; dev and sealed titles never train,
and neither does a train title any of whose spellings or queries equals an evaluation goal (all of it is held out).
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from training import demand_labeled as demand, v4

LANGUAGES = v4.LANGUAGES
BASE_TEMPLATES = ("{title}", "I want to work as {article} {title}", "gusto kong maging {title}")
DEMAND_TEMPLATES = ("may hiring na {title}, anong training ang kailangan ko?",
                    "what training do I need to get hired as {article} {title}?")


def queries(row: dict) -> list[str]:
    """The training queries of one demand title (empty for dev, sealed and 'none' titles)."""
    if row["split"] != "train" or not row["accept"]:
        return []
    titles = list(dict.fromkeys([row["title"], *(demand.clean_title(v) for v in row["variants"][:3])]))
    result = [title.title() for title in titles[:1]] + titles[1:]
    templates = BASE_TEMPLATES + (DEMAND_TEMPLATES if demand.is_high_demand(row) else ())
    result += [template.format(title=row["title"], article=demand.article(row["title"])) for template in templates]
    if demand.is_high_demand(row):
        result += [patterns[0].format(job=row["title"]) for patterns in v4.JOB_TEMPLATES.values()]
    return list(dict.fromkeys(" ".join(q.split()) for q in result if q.strip()))


def trainable(row: dict, exclude) -> bool:
    """A train title with a qualification, none of whose spellings or queries is an evaluation goal."""
    from tesda_track.utils.helpers import normalize

    texts = [row["title"], *row["variants"], *queries(row)]
    return bool(queries(row)) and not any(normalize(text) in exclude for text in texts)


def records(path: Path = demand.DEMAND_PATH, exclude=frozenset()) -> list[dict]:
    rows = demand.load(path)
    return [dict(qualification=name, query=query, lang="en", kind="demand_job", key=row["key"])
            for row in rows if trainable(row, exclude) for query in queries(row) for name in row["accept"]]


def enrich(qualifications, synthetic, exclude, path: Path = demand.DEMAND_PATH, v4_directory: Path = v4.DATA):
    merged, report = v4.enrich(qualifications, synthetic, exclude, v4_directory)
    kept = records(path, exclude)
    for row in kept:
        merged.setdefault(row["qualification"], []).append(row["query"])
    merged = {name: list(dict.fromkeys(items)) for name, items in merged.items()}
    rows = demand.load(path)
    report = {**report, "profile": "v5",
              "demand": {"snapshot": demand.SNAPSHOT, "titles": len(rows),
                         "by_split": dict(Counter(r["split"] for r in rows)),
                         "by_relation": dict(Counter(r["relation"] for r in rows)),
                         "train_titles_with_queries": len({r["key"] for r in kept}),
                         "train_postings_covered": sum(r["demand"]["philjobnet_postings"] for r in rows
                                                       if r["split"] == "train" and r["accept"]),
                         "query_rows": len(kept),
                         "review_status": dict(Counter(r["review_status"] for r in rows)),
                         "data_sha256": hashlib.sha256(json.dumps(kept, sort_keys=True, ensure_ascii=False)
                                                       .encode()).hexdigest()}}
    return merged, report


def main():
    from tesda_track.utils.helpers import normalize
    from training.catalog import load_catalog
    from training.pairs import eval_exclusions, load_synthetic, training_pairs

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    qualifications, _ = load_catalog()
    exclusions = eval_exclusions()
    synthetic, report = enrich(qualifications, load_synthetic(), exclusions)
    pairs = training_pairs(qualifications, exclusions, synthetic)
    report["training_pairs"] = len(pairs)
    report["evaluation_overlap"] = sum(normalize(q) in exclusions for q, _ in pairs)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "qualification_coverage"}, indent=2))


if __name__ == "__main__":
    main()
