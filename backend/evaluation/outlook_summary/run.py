"""Run one writer over the fixed test set and judge every case.

    python -m evaluation.outlook_summary.run rules
    python -m evaluation.outlook_summary.run model --gguf /path/model.gguf --name phi-3.5-mini-q4 --threads 2

A model never sees a case's figures as something to write: it is told the situation in words and answers with a
template over named slots (slots.py). Cases that are the same situation (the same verdict, relocation choice and
slots, differing only in names and figures) get the same template, so a model writes once per situation and the code
fills it for every case. Needs llama-cpp-python for `model`; nothing else here does.
"""
import argparse
import json
import resource
import time
from collections import Counter, defaultdict
from pathlib import Path

from evaluation.outlook_summary import cases as case_set
from evaluation.outlook_summary import criteria
from evaluation.outlook_summary.slots import facts as facts_of
from evaluation.outlook_summary.slots import fill

# 1 showed each slot's text for the case ("this time ..."); the smaller model copied the figures out of it instead of
# writing the slot. 2 never shows a figure: it says what kind of phrase each slot is, and lists the slots the note
# must contain. One revision, made after reading version 1's failures and before any rating.
PROMPT_VERSIONS = ("1", "2")
SEED = 20261113
RESULTS = case_set.DATA / "results"

SAYS = {
    "more_supply": "The area looks saturated: there is more training supply than recorded demand, so expect more "
                   "competition for local work. Use the word \"saturated\".",
    "more_demand": "Demand is ahead of supply here, which is a good sign for finding work nearby after qualifying. Say "
                   "\"demand is ahead of supply\".",
    "balanced": "Demand and training supply look balanced here. Use the word \"balanced\".",
    "demand_only": "Employers posted for it here, but no center offers it here, so the learner would need to train or "
                   "get assessed in another region. Say \"another region\".",
    "supply_only": "The learner can train or get assessed here, but there are no local postings for it in this "
                   "snapshot. Say \"no local postings\".",
    "no_records": "There is nothing to compare here yet. Say \"nothing\".",
}
SYSTEM = """\
You write a short note for a learner in the Philippines who is choosing where to train for a TESDA qualification. \
The note appears under a map. You are given the situation and a list of slots. A slot is a name in curly braces, \
such as {area}. The app replaces each slot with real text afterwards.

Rules:
- Write the note as a template: use the slots exactly as named, and never type a number or a percent yourself.
- Use only the slots listed. Use {demand} and {supply} once each.
- 3 to 5 short, plain sentences, at most 75 words. Speak to the learner as "you".
- The records are dated posting records and recorded centers. Do not call them job openings or vacancies, and do not \
promise work.
- Answer with the note only: no title, no list, no quotation marks."""
EXAMPLE = (
    "Situation: The learner is in {area}, their own region, and prefers not to relocate. Demand and training supply "
    "look balanced here. Use the word \"balanced\".\n"
    "Slots: {qualification} = the qualification's name; {area} = the region's name; "
    "{demand} = how many posting records are here, e.g. \"6 of the 20 posting records nationwide (30%)\"; "
    "{supply} = how many centers are here, e.g. \"3 of its 10 recorded centers (30%)\"",
    "You are in {area} and prefer not to relocate. For {qualification}, {demand} are here, and {supply}. Demand and "
    "training supply look balanced here.",
)
LANGUAGES = {
    "en": "",
    "fil": "\nWrite the note in everyday Filipino (Tagalog), as spoken in the Philippines. Keep the slots exactly as "
           "named, in curly braces; do not translate the slot names.",
}


def situation(facts: dict) -> tuple:
    """What a writer's template depends on: everything but the names and the figures themselves. One posting or one
    center reads differently from several or none, so that is part of it."""
    def kind(text: str) -> str:
        first = text.split()[0]
        return "one" if first == "1" else "none" if first in ("none", "no") else "some"
    slots = facts["slots"]
    return (facts["scope"], facts["balance"], facts["limited"], facts["relocate"], facts["at_home"],
            facts["mention_alternatives"], facts["examples_counted"], kind(slots["demand"]), kind(slots["supply"]),
            tuple(sorted(slots)))


def prompt(facts: dict, language: str = "en", version: str = "2") -> str:
    slots = facts["slots"]
    said = []
    if facts["scope"] == "country":
        said.append("No region is selected: this is the national picture.")
    elif facts["at_home"]:
        said.append("The learner is in {area}, their own region, and "
                    + ("is open to relocating." if facts["relocate"] else "prefers not to relocate."))
        said.append("Say so: \"open to relocating\"." if facts["relocate"] else "Say so: \"prefer not to relocate\".")
    else:
        said.append("The learner is looking at {area}.")
    if facts["balance"]:
        said.append(SAYS[facts["balance"]])
    if "ahead" in slots:
        said.append("Demand is ahead of supply in {ahead}: say so.")
    if "crowded" in slots:
        said.append("Supply is ahead of demand in {crowded}: say so.")
    if facts["limited"]:
        said.append("The counts are small: say they are a rough signal.")
    if facts["mention_alternatives"]:
        said.append("End by saying that, if they relocate, they should look first at {alternatives}." if facts["relocate"]
                    else "End by saying that, if their plans change, {alternatives} shows more demand against its "
                         "supply.")
    else:
        said.append("Do not name any other region.")
    if facts["examples_counted"]:
        said.append("Add that the center counts include example sites, shown for demonstration.")
    meaning = {"qualification": "the qualification's name", "area": "the region's name",
               "demand": "how many posting records are here", "supply": "how many centers are here",
               "alternatives": "the other region or regions to look at", "ahead": "regions where demand is ahead",
               "crowded": "regions where supply is ahead"}
    if facts["scope"] == "country":
        meaning.update(demand="how many posting records there are", supply="how many centers there are")
    order = [name for name in ("qualification", "area", "demand", "supply", "alternatives", "ahead", "crowded")
             if name in slots]
    if version == "1":
        listed = "; ".join(f"{{{name}}} = {meaning[name]}"
                           + (f", this time \"{slots[name]}\"" if name in ("demand", "supply") else "")
                           for name in order)
        return f"Situation: {' '.join(said)}\nSlots: {listed}{LANGUAGES[language]}"
    # What kind of phrase the slot will be, never its figures: the note has to read well around it.
    reads = {"some": "a phrase that starts with a number, like \"several of the ... nationwide\"",
             "one": "a phrase about exactly one, like \"one of the ... nationwide\"",
             "none": "a phrase that says there are none"}
    kinds = dict(zip(("demand", "supply"), situation(facts)[7:9]))
    listed = "; ".join(f"{{{name}}} = {meaning[name]}" + (f" ({reads[kinds[name]]})" if name in kinds else "")
                       for name in order)
    must = " ".join("{" + name + "}" for name in order if name != "alternatives" or facts["mention_alternatives"])
    return (f"Situation: {' '.join(said)}\nSlots: {listed}\n"
            f"Your note must contain each of these exactly once: {must}{LANGUAGES[language]}")


def clean(text: str) -> str:
    """A model's answer as one paragraph, without the wrapping some models add."""
    text = " ".join(text.strip().split())
    for lead in ("Note:", "Template:", "Answer:"):
        if text.startswith(lead):
            text = text[len(lead):].strip()
    return text.strip('"').strip()


# The checks that read English can't judge another language: there only these three are automatic.
ANY_LANGUAGE = ("figures", "slots", "length")


def judge_all(cases: list[dict], template_for, only: tuple[str, ...] = criteria.CHECKS) -> dict:
    """Every case judged on the checks in `only`, with each failure kept for the report."""
    failures: Counter = Counter()
    failed_cases, passed = [], 0
    for case in cases:
        facts = facts_of(case["outlook"])
        template, prose = template_for(case, facts)
        failed = criteria.judge(template, facts, prose=prose) if template else {"slots": "no answer"}
        failed = {check: why for check, why in failed.items() if check in only}
        if failed:
            failures.update(failed.keys())
            text = fill(template, facts["slots"])[0] if template and not prose else template
            failed_cases.append({"id": case["id"], "failed": failed, "text": text})
        else:
            passed += 1
    # The rule-written summary passes every check on every case (run `rules`), so after the fallback all cases pass
    # as long as each failure is caught by a check: what a check can't see is for the blind ratings to find.
    return {"cases": len(cases), "passed": passed, "pass_rate": round(passed / len(cases), 4),
            "failures_by_check": dict(failures.most_common()), "failed_cases": failed_cases}


def run_rules(cases: list[dict]) -> dict:
    return {"writer": "rules", **judge_all(cases, lambda case, facts: (case["outlook"]["insight"]["summary"], True))}


def run_model(cases: list[dict], gguf: Path, name: str, threads: int, language: str, version: str) -> dict:
    from llama_cpp import Llama

    groups: dict[tuple, list[dict]] = defaultdict(list)
    for case in cases:
        groups[situation(facts_of(case["outlook"]))].append(case)
    model = Llama(model_path=str(gguf), n_ctx=2048, n_threads=threads, n_threads_batch=threads, seed=SEED,
                  verbose=False)
    templates, timings = {}, []
    for key, members in groups.items():
        facts = facts_of(members[0]["outlook"])
        cpu, wall = time.process_time(), time.perf_counter()
        answer = model.create_chat_completion(
            messages=[{"role": "system", "content": SYSTEM},
                      {"role": "user", "content": EXAMPLE[0]}, {"role": "assistant", "content": EXAMPLE[1]},
                      {"role": "user", "content": prompt(facts, language, version)}],
            temperature=0, seed=SEED, max_tokens=220)
        cpu, wall = time.process_time() - cpu, time.perf_counter() - wall
        usage = answer["usage"]
        templates[key] = clean(answer["choices"][0]["message"]["content"])
        timings.append({"cpu_seconds": round(cpu, 2), "wall_seconds": round(wall, 2),
                        "prompt_tokens": usage["prompt_tokens"], "completion_tokens": usage["completion_tokens"]})
    wall = sum(t["wall_seconds"] for t in timings)
    cpu = sum(t["cpu_seconds"] for t in timings)
    tokens = sum(t["prompt_tokens"] + t["completion_tokens"] for t in timings)
    only = criteria.CHECKS if language == "en" else ANY_LANGUAGE
    judged = judge_all(cases, lambda case, facts: (templates[situation(facts)], False), only)
    by_situation = []
    for key, members in groups.items():
        facts = facts_of(members[0]["outlook"])
        by_situation.append({"cases": len(members), "example_case": members[0]["id"],
                             "prompt": prompt(facts, language, version), "template": templates[key],
                             "example_text": fill(templates[key], facts["slots"])[0],
                             "failed": {check: why for check, why in criteria.judge(templates[key], facts).items()
                                        if check in only}})
    return {
        "writer": name, "gguf": gguf.name, "language": language, "prompt_version": version, "seed": SEED,
        "threads": threads, "checks": list(only), "situations": len(groups),
        "situations_passing": sum(1 for item in by_situation if not item["failed"]), **judged,
        "speed": {
            "seconds_per_summary": round(wall / len(timings), 1),
            "tokens_per_second_overall": round(tokens / wall, 1),
            "generated_tokens_per_summary": round(sum(t["completion_tokens"] for t in timings) / len(timings)),
            "prompt_tokens_per_summary": round(sum(t["prompt_tokens"] for t in timings) / len(timings)),
            "cpu_seconds_per_summary": round(cpu / len(timings), 1),
            # One CPU credit is one vCPU at full use for a minute.
            "cpu_credits_per_summary_if_same_core_speed": round(cpu / len(timings) / 60, 2),
            "peak_memory_gb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024, 2),
        },
        "by_situation": by_situation,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("writer", choices=["rules", "model"])
    parser.add_argument("--gguf", type=Path)
    parser.add_argument("--name")
    parser.add_argument("--threads", type=int, default=2, help="2, as a t3.large has")
    parser.add_argument("--language", choices=sorted(LANGUAGES), default="en")
    parser.add_argument("--prompt", choices=PROMPT_VERSIONS, default="2")
    args = parser.parse_args()
    cases = case_set.load()
    if args.writer == "rules":
        result = run_rules(cases)
    else:
        if not args.gguf or not args.name:
            parser.error("model needs --gguf and --name")
        result = run_model(cases, args.gguf, args.name, args.threads, args.language, args.prompt)
    RESULTS.mkdir(parents=True, exist_ok=True)
    suffix = ("" if args.language == "en" else f"-{args.language}") + (
        f"-prompt{args.prompt}" if args.writer == "model" else "")
    path = RESULTS / f"{result['writer']}{suffix}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    summary = {key: value for key, value in result.items() if key not in ("failed_cases", "by_situation")}
    print(json.dumps(summary, indent=1), f"\n-> {path}")


if __name__ == "__main__":
    main()
