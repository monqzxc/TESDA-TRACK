"""Six-language training recipe: Kapampangan plus v3, with reviewable language drafts."""
import argparse
import json
from pathlib import Path

from training import v3

DATA = Path(__file__).resolve().parent / "data" / "v4"
LANGUAGES = {**v3.LANGUAGES, "pam": "Kapampangan"}
# Synthetic, code-switched drafts. Review these two patterns before expanding them across jobs.
JOB_TEMPLATES = {**v3.JOB_TEMPLATES, "pam": (
    "Buri kung maging {job}.",
    "Buri kung magobra bilang {job}.",
)}


def records(qualifications, directory=DATA):
    return v3.records(qualifications, directory, languages=LANGUAGES, job_templates=JOB_TEMPLATES, profile="v4")


def enrich(qualifications, synthetic, exclude, directory=DATA):
    return v3.enrich(qualifications, synthetic, exclude, directory, languages=LANGUAGES,
                     job_templates=JOB_TEMPLATES, profile="v4")


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
    # Count native tasks separately: thousands of repeated job patterns do not imply fluency.
    rows = records(qualifications)
    report["regional_languages"] = {lang: {
        "name": name,
        "native_task_rows": sum(r["lang"] == lang and r["kind"] == "native_task"
                                and normalize(r["query"]) not in exclusions for r in rows),
    } for lang, name in LANGUAGES.items()}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "qualification_coverage"}, indent=2))


if __name__ == "__main__":
    main()
