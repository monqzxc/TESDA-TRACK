"""The blind rating sheet: rule-written against model-written, side by side, for TESDA staff.

    python -m evaluation.outlook_summary.sheet --model phi-3.5-mini-instruct-q4_k_m

Thirty cases where the model's summary passed every check (where it fails, learners see the rule-written one, so
there is nothing to compare), spread over the verdicts and both relocation choices. Which side is which is decided
by a fixed seed and written to a separate key, which stays with whoever tallies the ratings.
"""
import argparse
import csv
import json
import random
from collections import defaultdict

from evaluation.outlook_summary import cases as case_set
from evaluation.outlook_summary import criteria
from evaluation.outlook_summary.run import RESULTS, SEED, situation
from evaluation.outlook_summary.slots import facts as facts_of
from evaluation.outlook_summary.slots import fill

SIZE = 30
QUESTIONS = ["Accurate to the counts (1-5)", "Easy to understand (1-5)", "Useful to a learner deciding (1-5)"]


def pick(cases: list[dict], templates: dict[tuple, str], rng: random.Random) -> list[tuple[dict, dict, str]]:
    """Up to SIZE passing cases, taken in turn from each verdict and relocation choice, one per situation first."""
    by_kind: dict[tuple, list] = defaultdict(list)
    seen: set[tuple] = set()
    shuffled = cases[:]
    rng.shuffle(shuffled)
    later = []
    for case in shuffled:
        facts = facts_of(case["outlook"])
        key = situation(facts)
        template = templates.get(key)
        if not template or criteria.judge(template, facts):
            continue
        entry = (case, facts, fill(template, facts["slots"])[0])
        (later if key in seen else by_kind[(facts["balance"], facts["relocate"])]).append(entry)
        seen.add(key)
    chosen: list = []
    while len(chosen) < SIZE and any(by_kind.values()):
        for kind in sorted(by_kind, key=str):
            if by_kind[kind] and len(chosen) < SIZE:
                chosen.append(by_kind[kind].pop())
    return chosen + later[:SIZE - len(chosen)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", required=True, help="the writer's name, as in results/<name>.json")
    args = parser.parse_args()
    result = json.loads((RESULTS / f"{args.model}.json").read_text())
    cases = case_set.load()
    by_example = {item["example_case"]: item["template"] for item in result["by_situation"]}
    templates = {situation(facts_of(case["outlook"])): by_example[case["id"]]
                 for case in cases if case["id"] in by_example}
    rng = random.Random(SEED)
    rows, key = [], []
    for number, (case, facts, written) in enumerate(pick(cases, templates, rng), start=1):
        rules = case["outlook"]["insight"]["summary"]
        model_is_a = rng.random() < 0.5
        slots = facts["slots"]
        rows.append({
            "No.": number,
            "Qualification": slots["qualification"],
            "Region": slots.get("area", "Whole country"),
            "Learner": ("open to relocating" if facts["relocate"] else "prefers not to relocate"),
            "Demand (from the records)": slots["demand"],
            "Supply (from the records)": slots["supply"],
            "Summary A": written if model_is_a else rules,
            "Summary B": rules if model_is_a else written,
            **{f"A: {question}": "" for question in QUESTIONS},
            **{f"B: {question}": "" for question in QUESTIONS},
            "Which would you show a learner? (A / B / no difference)": "",
            "Anything wrong or misleading in either?": "",
        })
        key.append({"No.": number, "case": case["id"], "A": args.model if model_is_a else "rules",
                    "B": "rules" if model_is_a else args.model})
    for name, table in (("rating-sheet.csv", rows), ("rating-sheet-key.csv", key)):
        with (case_set.DATA / name).open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=list(table[0]))
            writer.writeheader()
            writer.writerows(table)
    print(f"{len(rows)} cases -> {case_set.DATA / 'rating-sheet.csv'} (key beside it)")


if __name__ == "__main__":
    main()
