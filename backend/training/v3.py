"""Catalog-grounded v3 enrichment and auditable coverage (no torch or database)."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "v3"
LANGUAGES = {"ceb": "Cebuano/Bisaya", "ilo": "Ilocano", "hil": "Hiligaynon/Ilonggo"}
# Deliberately code-switched: official job titles remain in English.
JOB_TEMPLATES = {
    "ceb": ("Gusto ko mahimong {job}.", "Ganahan ko motrabaho isip {job}."),
    "ilo": ("Kayat ko ti agbalin a {job}.", "Kayat ko ti agtrabaho kas {job}."),
    "hil": ("Gusto ko mangin {job}.", "Gusto ko magtrabaho bilang {job}."),
}


def records(qualifications, directory=DATA):
    """Generate bounded task examples and load synthetic language drafts.

    These are training labels, not statements that a learner already qualifies for certification.
    Shared generic Core units are omitted as standalone tasks to avoid noisy labels.
    """
    names = {q.name for q in qualifications}
    owners = {}
    for q in qualifications:
        for c in q.competencies:
            if c.is_active and c.category == "Core":
                owners.setdefault(c.name.casefold(), set()).add(q.name)
    result = []
    for q in qualifications:
        core = list(dict.fromkeys(c.name for c in q.competencies if c.is_active and c.category == "Core"))
        for skill in core:
            if len(owners[skill.casefold()]) <= 3:
                for text in (f"I want to learn how to {skill.lower()}.",
                             f"My work involves this task: {skill.lower()}. Which qualification fits?"):
                    result.append(dict(qualification=q.name, query=text, lang="en", kind="core_task"))
        # Explicit name/level anchors distinguish advanced qualifications without inventing prerequisites.
        if core:
            result.append(dict(qualification=q.name,
                               query=f"I want {q.name} training covering {core[0].lower()}.",
                               lang="en", kind="level_specific"))
        if len(core) > 1:
            result.append(dict(qualification=q.name,
                               query=f"I want to learn these skills: {core[0].lower()}; {core[-1].lower()}.",
                               lang="en", kind="multi_skill"))
        for lang, templates in JOB_TEMPLATES.items():
            for job in list(dict.fromkeys(q.possible_jobs))[:3]:
                for template in templates:
                    result.append(dict(qualification=q.name, query=template.format(job=job),
                                       lang=lang, kind="code_switched_job"))
    for path in sorted(directory.glob("*.json")):
        for row in json.loads(path.read_text(encoding="utf-8")):
            if (row.get("qualification") not in names or row.get("lang") not in LANGUAGES
                    or not isinstance(row.get("query"), str) or not row["query"].strip()
                    or row.get("kind") != "native_task"):
                raise ValueError(f"Invalid v3 training row in {path.name}")
            result.append(row)
    return result


def enrich(qualifications, synthetic, exclude, directory=DATA):
    from tesda_track.utils.helpers import normalize

    merged = {name: list(queries) for name, queries in synthetic.items()}
    kept = [r for r in records(qualifications, directory) if normalize(r["query"]) not in exclude]
    for row in kept:
        merged.setdefault(row["qualification"], []).append(row["query"])
    merged = {name: list(dict.fromkeys(queries)) for name, queries in merged.items()}
    by_name = Counter(r["qualification"] for r in kept)
    report = {
        "profile": "v3", "language_data_status": "synthetic; native-speaker review pending",
        "catalog_qualifications": len(qualifications), "enrichment_rows": len(kept),
        "by_language": dict(Counter(r["lang"] for r in kept)),
        "by_kind": dict(Counter(r["kind"] for r in kept)),
        "qualification_coverage": {q.name: {"added_queries": by_name[q.name],
            "core_units": sum(c.is_active and c.category == "Core" for c in q.competencies),
            "jobs": len(q.possible_jobs)} for q in qualifications},
        "qualifications_without_core_units": [q.name for q in qualifications
            if not any(c.is_active and c.category == "Core" for c in q.competencies)],
        "data_sha256": hashlib.sha256(json.dumps(kept, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
    }
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
