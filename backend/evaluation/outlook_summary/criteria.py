"""Pass or fail, decided before any model was chosen. A summary passes only if it passes every check.

1. figures   Every figure in the summary is one the counts hold, and the writer typed none itself.
2. slots     Only the slots it was given, all filled; the demand and the supply are both stated.
3. verdict   It says what the computed balance says, and nothing a different balance would say.
4. stance    It says whether the learner stays or would relocate, and names other regions only when it should.
5. caution   Small counts are called a rough signal; nothing is promised (no "job openings", "vacancies", "hiring").
6. length    90 words or fewer.
7. reading   A senior high graduate reads it easily: Flesch-Kincaid grade 12 or lower, names left out of the count.

The same checks judge the rule-written summary, so a check the rules fail is a fault in the check or the rules.
"""
import re

from evaluation.outlook_summary.slots import SLOT, fill

MAX_WORDS = 90
MAX_GRADE = 12.0
CHECKS = ("figures", "slots", "verdict", "stance", "caution", "length", "reading")

# What each balance must say, and words that belong to a different verdict.
VERDICT = {
    "more_supply": (r"saturat", r"balanced|demand is ahead|ahead of supply"),
    "more_demand": (r"demand is ahead|ahead of supply|demand (is )?(higher|stronger|greater) than", r"saturat|balanced"),
    "balanced": (r"balanced|in balance|even", r"saturat|demand is ahead|ahead of supply"),
    "demand_only": (r"another region|other region|elsewhere", r"saturat|balanced"),
    "supply_only": (r"no (local |recorded )?posting", r"saturat|balanced|demand is ahead"),
    "no_records": (r"nothing|no records|not enough", r"saturat|balanced|demand is ahead"),
}
PROMISES = r"job opening|vacanc|hiring|guarantee|will get (a |the )?job|sure to"
STAYS = r"not to relocate|prefer to stay|staying|stay (in|near|close)|not relocat|don.t want to (move|relocate)"
MOVES = r"open to relocat|willing to (relocate|move)|if you relocate|ready to (relocate|move)"


def _numbers(text: str) -> set[str]:
    return {run.replace(",", "").lstrip("0") or "0" for run in re.findall(r"\d[\d,]*", text)}


def _syllables(word: str) -> int:
    word = re.sub(r"[^a-z]", "", word.lower())
    if not word:
        return 0
    count = len(re.findall(r"[aeiouy]+", word))
    if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(count, 1)


def grade(text: str) -> float:
    """Flesch-Kincaid grade level."""
    sentences = max(len(re.findall(r"[.!?]+(?:\s|$)", text)), 1)
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return 0.0
    return 0.39 * len(words) / sentences + 11.8 * sum(map(_syllables, words)) / len(words) - 15.59


def as_template(text: str, slots: dict[str, str]) -> str:
    """Finished prose (the rule-written summary) with the slots' own text put back as slots, longest first, so it is
    judged exactly as a model's template is. Two slots with the same text (the national view's regions ahead, and
    where to look first) take its occurrences in turn."""
    for name, value in sorted(slots.items(), key=lambda item: (-len(item[1]), item[0] == "alternatives")):
        text = text.replace(value, "{" + name + "}", 1 if list(slots.values()).count(value) > 1 else -1)
    return text


def judge(template: str, facts: dict, *, prose: bool = False) -> dict:
    """Each check's verdict for one summary: {} of check -> reason it failed. An empty answer passes. `prose` is a
    finished text rather than a template: its figures are checked against the counts, and it is held to naming the
    area rather than to using the slots."""
    slots = facts["slots"]
    if prose:
        template = as_template(template, slots)
    text, unknown = fill(template, slots)
    low = text.lower()
    used = set(SLOT.findall(template))
    failed: dict[str, str] = {}

    typed = _numbers(SLOT.sub(" ", template)) - _numbers(slots["qualification"])
    held = _numbers(" ".join(slots.values()))
    if prose:
        if not _numbers(text) <= held:
            failed["figures"] = f"a figure the counts don't hold: {sorted(_numbers(text) - held)}"
    elif typed:
        failed["figures"] = f"typed a figure itself: {sorted(typed)}"

    if unknown or "{" in text or "}" in text:
        failed["slots"] = f"unknown or unfilled slot: {unknown or 'stray brace'}"
    elif not prose and not {"demand", "supply"} <= used:
        failed["slots"] = f"left out {sorted({'demand', 'supply'} - used)}"
    elif facts["scope"] == "region" and "area" not in used:
        failed["slots"] = "never names the area"

    if facts["balance"]:
        must, never = VERDICT[facts["balance"]]
        if not re.search(must, low):
            failed["verdict"] = f"doesn't say the area is {facts['balance']}"
        elif re.search(never, low):
            failed["verdict"] = f"says what another verdict would: {re.search(never, low).group(0)!r}"

    if facts["scope"] == "region" and facts["at_home"]:
        want, other = (MOVES, STAYS) if facts["relocate"] else (STAYS, MOVES)
        if not re.search(want, low):
            failed["stance"] = "doesn't say whether the learner would relocate"
        elif re.search(other, low) and not (not facts["relocate"] and re.search(r"if your plans change", low)):
            failed["stance"] = "gets the relocation choice the wrong way round"
    if "stance" not in failed:
        named = "alternatives" in used
        if facts["mention_alternatives"] and not named:
            failed["stance"] = "doesn't say where else to look"
        elif named and not facts["mention_alternatives"]:
            failed["stance"] = "names other regions when it shouldn't"

    if re.search(PROMISES, low):
        failed["caution"] = f"promises or misnames the records: {re.search(PROMISES, low).group(0)!r}"
    elif facts["limited"] and not re.search(r"small|rough|few|limited|careful|caution", low):
        failed["caution"] = "small counts aren't called a rough signal"
    elif facts["examples_counted"] and "example" not in low:
        failed["caution"] = "doesn't say the centers include example sites"

    words = len(text.split())
    if words > MAX_WORDS:
        failed["length"] = f"{words} words"
    elif words < 12:
        failed["length"] = f"only {words} words"

    # Names (regions, the qualification) aren't the writer's choice, so they don't count against its reading level.
    level = grade(SLOT.sub("Place", template))
    if level > MAX_GRADE:
        failed["reading"] = f"grade {level:.1f}"
    return failed
