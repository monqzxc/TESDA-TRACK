"""Pop-culture role-model goals ("I want to become like Tony Stark") for the pop round of the matcher.

Reads data/pop_culture/directory.txt (129 screen characters and personalities with practical skills and suggested
TVET areas), maps each suggested area to exact catalog names with data/pop_culture/area_map.json, and writes learner
queries in English, Filipino and Taglish with every qualification the character points to as an owner. Characters
whose areas all have no catalog qualification (sports coaching, leadership...) become goals that must get no match,
together with the hand-written superpower and small-talk goals in data/pop_culture/unrelated.json.

Splits, so the notebook can measure generalisation and not memorisation:
  train          seen characters, training templates
  eval_template  seen characters, templates never used in training
  eval_unseen    characters never seen in training (any template)

Standard library only (Python 3.9+). From backend/:
    python3 training/pop_culture.py            # writes data/pop_culture/pop_items.json and prints an audit
"""
import argparse
import hashlib
import json
import random
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "pop_culture"
CATALOG = HERE.parent / "seed" / "qualifications.json"
UNSEEN_SHARE = 0.15
TYPO_SHARE = 0.15
SEED = 42
# Same person listed twice in the directory under different names.
ALIASES = {"bulma briefs": "bulma", "dom toretto": "dominic toretto"}

# Name templates: {n} = character name, {s} = source. Held-out templates are marked with a leading "!".
NAME_TEMPLATES = {
    "en": ["I want to become like {n}", "I want to be like {n}", "I want to be like {n} from {s}",
           "my dream is to be like {n}", "{n} is my idol, what course should I take?",
           "what TESDA course fits someone who wants to be like {n}", "I want a job like {n}",
           "!how do I become like {n}", "!career like {n} from {s}", "!I look up to {n}, what should I study?"],
    "tl": ["gusto kong maging katulad ni {n}", "gusto kong maging kagaya ni {n}", "pangarap kong maging tulad ni {n}",
           "idol ko si {n}, anong kurso ang para sa akin?", "paano maging katulad ni {n}",
           "!gusto kong maging gaya ni {n} sa {s}", "!anong pwedeng aralin para maging tulad ni {n}?"],
    "taglish": ["gusto ko maging like {n}", "I wanna be like {n}, anong TESDA course?",
                "pwede ba ako maging katulad ni {n} from {s}", "idol ko si {n}, ano pwede ko i-take na course",
                "!gusto ko maging {n} level yung skills ko", "!anong course para maging like {n}"],
}
# Skill templates: {a}, {b} = practical skills the character shows.
SKILL_TEMPLATES = {
    "en": ["I want to learn {a} and {b} like {n}", "I want to do {a} like {n} in {s}",
           "!I want skills in {a} like {n}"],
    "tl": ["gusto kong matuto ng {a} tulad ni {n}", "gusto kong marunong ng {a} at {b} gaya ni {n}",
           "!gusto kong matutunan ang {a} na ginagawa ni {n}"],
    "taglish": ["gusto ko matuto ng {a} like {n}", "gusto ko yung skills ni {n} sa {a} at {b}",
                "!paano ako magiging magaling sa {a} like {n}"],
}
FIELDS = ("Source", "Category", "Skills", "TVET Sector", "Suggested TESDA Qualification / Training Area",
          "Why It Matches")


def parse_directory(text: str) -> list:
    entries = []
    for block in re.split(r"\n(?=\d{3}\. )", text)[1:]:
        head = re.match(r"(\d{3})\. (.+)", block)
        row = {"id": head.group(1), "name": head.group(2).strip()}
        for field in FIELDS:
            found = re.search(re.escape(field) + r": (.+)", block)
            if not found:
                raise ValueError(f"Entry {row['id']} has no {field}")
            row[field] = found.group(1).strip()
        entries.append(row)
    return entries


def name_forms(name: str) -> list:
    """'Tony Stark / Iron Man' -> both names; '(screen persona)' and similar notes dropped."""
    name = re.sub(r"\s*\(.*?\)", "", name)
    return [part.strip() for part in name.split(" / ") if part.strip()]


def characters(entries: list, area_map: dict, catalog_names: set) -> list:
    """One row per real character, duplicates merged, owners resolved to catalog names."""
    merged = {}
    for e in entries:
        forms = name_forms(e["name"])
        key = ALIASES.get(forms[0].casefold(), forms[0].casefold())
        areas = [a.strip() for a in e["Suggested TESDA Qualification / Training Area"].split(";") if a.strip()]
        missing = [a for a in areas if a not in area_map]
        if missing:
            raise ValueError(f"{e['id']} {e['name']}: areas missing from area_map.json: {missing}")
        owners = {n for a in areas for n in area_map[a]}
        if unknown := owners - catalog_names:
            raise ValueError(f"area_map.json names unknown qualifications: {sorted(unknown)}")
        c = merged.setdefault(key, {"ids": [], "names": [], "source": e["Source"], "skills": [], "areas": [],
                                    "owners": set(), "why": e["Why It Matches"]})
        c["ids"].append(e["id"])
        c["names"] += [f for f in forms if f not in c["names"]]
        c["skills"] += [s.strip() for s in e["Skills"].split(";") if s.strip() and s.strip() not in c["skills"]]
        c["areas"] += [a for a in areas if a not in c["areas"]]
        c["owners"] |= owners
    return [{**c, "owners": sorted(c["owners"])} for c in merged.values()]


def typo(text: str, rng: random.Random):
    words = text.split(" ")
    spots = [i for i, w in enumerate(words) if len(w) >= 5 and w.isalpha()]
    if not spots:
        return None
    i = rng.choice(spots)
    w = words[i]
    j = rng.randrange(1, len(w) - 1)
    words[i] = w[:j] + w[j + 1:] if rng.random() < 0.5 else w[:j] + w[j + 1] + w[j] + w[j + 2:]
    out = " ".join(words)
    return out if out != text else None


def unseen(key: str) -> bool:
    return int(hashlib.sha256(f"{SEED}:{key}".encode()).hexdigest()[:8], 16) % 1000 < UNSEEN_SHARE * 1000


def generate(chars: list, extra_unrelated: list) -> list:
    rows = []
    for c in chars:
        held_char = unseen(c["names"][0].casefold())
        rng = random.Random(f"{SEED}:{c['names'][0]}")
        related = bool(c["owners"])
        for lang in NAME_TEMPLATES:
            templates = [("name", t) for t in NAME_TEMPLATES[lang]]
            if related:   # skill phrasing only where the skills lead somewhere
                templates += [("skill", t) for t in SKILL_TEMPLATES[lang]]
            for kind, template in templates:
                held_template = template.startswith("!")
                template = template.lstrip("!")
                for n in c["names"]:
                    a, b = (rng.sample(c["skills"], 2) if len(c["skills"]) > 1 else c["skills"] * 2)
                    text = template.format(n=n, s=c["source"], a=a.lower(), b=b.lower())
                    split = "eval_unseen" if held_char else "eval_template" if held_template else "train"
                    row = {"query": text, "accept": c["owners"], "lang": lang,
                           "kind": kind if related else "no_route", "character": c["names"][0], "split": split}
                    rows.append(row)
                    if split == "train" and rng.random() < TYPO_SHARE and (t := typo(text, rng)):
                        rows.append({**row, "query": t, "kind": row["kind"] + "_typo"})
    for i, u in enumerate(extra_unrelated):
        split = "eval_unseen" if unseen(u["query"].casefold()) else "train"
        rows.append({"query": u["query"], "accept": [], "lang": u["lang"], "kind": "superpower_or_chat",
                     "character": None, "split": split})
    # A text must not be both a goal and a non-goal, nor appear in two splits.
    seen = {}
    out = []
    for r in rows:
        key = " ".join(r["query"].casefold().split())
        if key in seen:
            first = seen[key]
            if set(first["accept"]) != set(r["accept"]) or first["split"] != r["split"]:
                first["accept"] = sorted(set(first["accept"]) | set(r["accept"]))
                if first["split"] != r["split"]:
                    first["split"] = "train" if "train" in (first["split"], r["split"]) else first["split"]
            continue
        seen[key] = r
        out.append(r)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, default=DATA / "pop_items.json")
    args = parser.parse_args()
    catalog_names = {q["name"] for q in json.loads(CATALOG.read_text(encoding="utf-8"))}
    area_map = {k: v for k, v in json.loads((DATA / "area_map.json").read_text(encoding="utf-8")).items()
                if not k.startswith("_")}
    entries = parse_directory((DATA / "directory.txt").read_text(encoding="utf-8"))
    chars = characters(entries, area_map, catalog_names)
    rows = generate(chars, json.loads((DATA / "unrelated.json").read_text(encoding="utf-8")))
    audit = {
        "directory_entries": len(entries), "characters": len(chars),
        "characters_with_route": sum(bool(c["owners"]) for c in chars),
        "characters_without_route": sorted(c["names"][0] for c in chars if not c["owners"]),
        "unseen_characters": sorted(c["names"][0] for c in chars if unseen(c["names"][0].casefold())),
        "rows": len(rows), "by_split": dict(Counter(r["split"] for r in rows)),
        "by_lang": dict(Counter(r["lang"] for r in rows)), "by_kind": dict(Counter(r["kind"] for r in rows)),
        "qualifications_used": len({n for r in rows for n in r["accept"]}),
        "unmapped_areas": sorted(k for k, v in area_map.items() if not v),
    }
    payload = {"profile": "pop-culture", "review_status": "draft", "audit": audit,
               "characters": [{k: c[k] for k in ("names", "source", "skills", "areas", "owners")} for c in chars],
               "items": rows}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=False, indent=2))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
