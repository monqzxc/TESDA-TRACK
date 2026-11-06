"""What real TESDA Skill Passport profiles look like, as aggregates only: run where the TESDA-TRACK database is.

Reads the profiles TESDA-TRACK keeps for TSP-linked learners (learner_identity.profile, refreshed at every sign-in)
inside a read-only transaction and prints one JSON report: how many learners, the shape of each section's entries
(keys, value types, lengths), how often sections are empty, and what the skill labels look like (length, language,
free text vs catalog terms, how often learners share a label). It never prints an sso_id, ULI, name, address or any
single learner's entry. A label's text appears only when at least --k different learners have exactly that label,
and a region's count only when it is at least --k; anything rarer is counted, not shown.

Inside the API container on the server (nothing to rebuild; the script comes in on stdin):

    docker compose exec -T api python - --k 5 < scripts/tsp_profile_census.py > tsp-census.json

Or from backend/ with DATABASE_URL set:  python ../scripts/tsp_profile_census.py --k 5 --out tsp-census.json

The language split is a word-list heuristic (catalog English vs Filipino keywords and affixes): spot-check it.
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time
from pathlib import Path

from sqlmodel import Session, select

from tesda_track.db import get_engine
from tesda_track.models.identity import LearnerIdentity, TspPendingSignIn, TspSignInAudit
from tesda_track.services import catalog
from tesda_track.services.tsp_sign_in import CREDENTIAL_KINDS, LABEL_KEYS, SECTIONS, _label

CENSUS_VERSION = 1
SEED_SOURCES = ("seed/sources", "backend/seed/sources", "../backend/seed/sources")
COUNT_BUCKETS = ((0, 0, "0"), (1, 1, "1"), (2, 2, "2"), (3, 5, "3-5"), (6, 10, "6-10"), (11, 20, "11-20"),
                 (21, 10**9, "21+"))
WORD_BUCKETS = ((1, 1, "1 word"), (2, 3, "2-3 words"), (4, 6, "4-6 words"), (7, 10**9, "7+ words"))
ID_LIKE_KEYS = {"id", "skill_id", "code", "uuid", "taxonomy_id", "esco_id", "psoc", "psoc_code", "onet", "onet_code",
                "qualification_code", "competency_code", "unit_code"}

# Filipino function words and markers. Words that are also everyday English ("at", "may", "man") are left out.
TL_WORDS = {"ng", "mga", "sa", "ang", "ako", "ko", "mo", "siya", "kami", "tayo", "namin", "natin", "ni", "nang",
            "marunong", "kaya", "kayang", "pwede", "puwede", "gusto", "alam", "sanay", "trabaho", "gawa", "gawain",
            "pagluluto", "luto", "hinang", "ayos", "pag-aayos", "magaling", "konti", "medyo", "dati", "ngayon",
            "lang", "din", "rin", "po", "opo", "hindi", "wala", "meron", "mayroon", "ito", "iyan", "yung", "yun",
            "naman", "kasi", "tsaka", "saka", "pati", "bahay", "tindahan", "sasakyan", "makina", "damit", "tahi",
            "pananahi", "pagtatanim", "tanim", "alaga", "pag-aalaga", "masahe", "gupit", "kuryente", "tubero"}
TL_AFFIX = re.compile(r"^(mag|nag|pag|pang|mang|nang|maka|naka|nakaka|makapag|nakapag|ipag|pinag|taga)-?[a-zñ]{3,}$")
EN_EXTRA = {"and", "the", "of", "in", "for", "with", "to", "on", "basic", "skills", "skill", "management", "service",
            "services", "customer", "computer", "office", "microsoft", "excel", "word", "communication", "driving",
            "cooking", "welding", "cleaning", "sales", "data", "entry", "teamwork", "leadership", "repair", "using",
            "operation", "operating", "maintenance", "installation", "programming", "design", "writing"}
TOKEN = re.compile(r"[a-zñ][a-zñ'\-]*")


def tokens(text: str) -> list[str]:
    return [t.strip("-'") for t in TOKEN.findall(text.casefold()) if len(t.strip("-'")) >= 2]


def norm(text: str) -> str:
    return " ".join(text.casefold().replace("(superseded)", "").split())


def percentiles(values: list[float]) -> dict:
    if not values:
        return {"n": 0}
    ordered = sorted(values)

    def at(q: float):
        return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]
    return {"n": len(ordered), "min": ordered[0], "p10": at(0.1), "p50": at(0.5), "p90": at(0.9), "max": ordered[-1]}


def bucket(value: int, buckets) -> str:
    return next(label for low, high, label in buckets if low <= value <= high)


def shown(count: int, k: int):
    """A learner count, or a marker when it is too small to show without pointing at someone."""
    return count if count >= k else f"<{k}"


def seed_file(name: str) -> Path | None:
    for folder in SEED_SOURCES:
        path = Path(folder) / name
        if path.exists():
            return path
    return None


def lexicons(rule_views: list[dict]) -> tuple[set[str], set[str]]:
    english = set(EN_EXTRA)
    for view in rule_views:
        texts = [view["name"], view.get("skill_label") or "", *view["possible_jobs"],
                 *(c["name"] for c in view["competencies"])]
        for text in texts:
            english.update(tokens(text))
    tagalog = set(TL_WORDS)
    path = seed_file("keywords_tl.json")
    if path:
        for key, words in json.loads(path.read_text(encoding="utf-8")).items():
            if key.startswith("_") or not isinstance(words, list):
                continue
            for word in words:
                tagalog.update(t for t in tokens(word) if t not in english)
    english -= tagalog
    return english, tagalog


def language(label: str, english: set[str], tagalog: set[str]) -> tuple[str, int, int]:
    words = tokens(label)
    has_tl = any(w in tagalog or TL_AFFIX.match(w) for w in words)
    has_en = any(w in english for w in words)
    unknown = sum(1 for w in words if w not in english and w not in tagalog and not TL_AFFIX.match(w))
    kind = "taglish" if has_tl and has_en else "tl" if has_tl else "en" if has_en else "unknown"
    return kind, unknown, len(words)


def catalog_terms(rule_views: list[dict]) -> dict[str, set[str]]:
    terms = {"qualification_name": set(), "skill_label": set(), "possible_job": set(), "competency_unit": set(),
             "career_keyword": set()}
    for view in rule_views:
        terms["qualification_name"].add(norm(view["name"]))
        if view.get("skill_label"):
            terms["skill_label"].add(norm(view["skill_label"]))
        terms["possible_job"].update(norm(job) for job in view["possible_jobs"])
        terms["competency_unit"].update(norm(c["name"]) for c in view["competencies"])
        terms["career_keyword"].update(norm(word) for word in view["career_keywords"])
    return terms


def official_codes() -> tuple[set[str], set[str]]:
    """Official TESDA codes and titles (title + level) from the crosswalk, for spotting credentials we can map."""
    codes, titles = set(), set()
    path = seed_file("qualification_code_crosswalk.csv")
    if path:
        with path.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                codes.add(row["official_code"].strip().casefold())
                titles.add(norm(f"{row['official_title']} NC {row['level']}"))
    return codes, titles


def describe_section(entries_by_learner: list[list]) -> dict:
    """Shape of one section across learners: counts, item types, key sets, value types and lengths. No values."""
    per_learner = [len(entries) for entries in entries_by_learner]
    item_types, key_sets, label_keys = Counter(), Counter(), Counter()
    field_types: dict[str, Counter] = defaultdict(Counter)
    field_lengths: dict[str, list[int]] = defaultdict(list)
    labelled = total = id_like = 0
    for entries in entries_by_learner:
        for entry in entries:
            total += 1
            if isinstance(entry, dict):
                item_types["object"] += 1
                key_sets[tuple(sorted(entry))] += 1
                if ID_LIKE_KEYS & set(entry):
                    id_like += 1
                for key, value in entry.items():
                    field_types[key][type(value).__name__] += 1
                    if isinstance(value, str):
                        field_lengths[key].append(len(value))
                source = next((key for key in LABEL_KEYS if isinstance(entry.get(key), str) and entry[key].strip()),
                              None)
                label_keys[source or "(none: label not found)"] += 1
            else:
                item_types[type(entry).__name__ if not isinstance(entry, str) else "string"] += 1
            labelled += _label(entry) is not None
    return {
        "learners": len(per_learner),
        "learners_with_any": sum(1 for n in per_learner if n),
        "entries": total,
        "entries_per_learner": dict(Counter(bucket(n, COUNT_BUCKETS) for n in per_learner)),
        "entries_per_learner_stats": percentiles(per_learner),
        "item_types": dict(item_types),
        "object_key_sets": [{"keys": list(keys), "entries": n} for keys, n in key_sets.most_common(15)],
        "object_fields": {key: {"types": dict(types), "string_length": percentiles(field_lengths[key])}
                          for key, types in sorted(field_types.items())},
        "entries_with_id_like_key": id_like,
        "label_taken_from": dict(label_keys),
        "share_with_readable_label": round(labelled / total, 3) if total else None,
    }


def sections_of(profile: dict) -> dict[str, list]:
    credentials = profile.get("credentials") or {}
    found = {section: profile.get(section) or [] for section in SECTIONS}
    found |= {f"credentials.{kind}": credentials.get(kind) or [] for kind in CREDENTIAL_KINDS}
    return {name: entries if isinstance(entries, list) else [] for name, entries in found.items()}


def census(session: Session, k: int, since: datetime | None = None, exclude: frozenset[str] = frozenset()) -> dict:
    """Only learners linked on or after `since`, and none of the `exclude` sso_ids (such as TSP test accounts)."""
    query = select(LearnerIdentity.profile, LearnerIdentity.scopes).where(LearnerIdentity.subject.not_in(exclude))
    if since:
        query = query.where(LearnerIdentity.linked_at >= since)
    rows = session.exec(query).all()
    profiles = [profile or {} for profile, _ in rows]
    current = catalog.snapshot(session)
    english, tagalog = lexicons(current.rule_views)
    terms = catalog_terms(current.rule_views)
    codes, titles = official_codes()
    qualification_names = terms["qualification_name"] | titles

    by_section: dict[str, list[list]] = defaultdict(list)
    for profile in profiles:
        for name, entries in sections_of(profile).items():
            by_section[name].append(entries)

    # Skill labels: each learner's distinct labels, as sign-in keeps them for matching.
    learner_labels = [list(dict.fromkeys(filter(None, map(_label, sections_of(p)["skills"])))) for p in profiles]
    occurrences = [label for labels in learner_labels for label in labels]
    learners_per_label = Counter(norm(label) for labels in learner_labels for label in {norm(x) for x in labels})
    display = {}
    for label in occurrences:
        display.setdefault(norm(label), label)
    langs, words_hist, form = Counter(), Counter(), Counter()
    oov = all_words = 0
    matched = Counter()
    chars, word_counts = [], []
    for label in occurrences:
        kind, unknown, n_words = language(label, english, tagalog)
        langs[kind] += 1
        oov += unknown
        all_words += n_words
        chars.append(len(label))
        word_counts.append(len(label.split()))
        words_hist[bucket(max(1, len(label.split())), WORD_BUCKETS)] += 1
        form["has_digits"] += any(ch.isdigit() for ch in label)
        form["all_caps"] += label.isupper()
        form["title_case"] += label.istitle()
        form["has_sentence_punctuation"] += bool(re.search(r"[.;:!?]", label))
        form["has_comma_or_slash"] += bool(re.search(r"[,/]", label))
        key = norm(label)
        hits = [name for name, values in terms.items() if key in values]
        for name in hits:
            matched[name] += 1
        matched["any_catalog_term"] += bool(hits)
    total = len(occurrences)
    shared = sum(1 for label in occurrences if learners_per_label[norm(label)] >= 2)

    # Could a learner's own qualifications or credentials serve as a weak label for their skills?
    proxy = Counter()
    for profile, labels in zip(profiles, learner_labels):
        held = [entry for name, entries in sections_of(profile).items()
                if name == "qualifications" or name.startswith("credentials.") for entry in entries]
        if not labels:
            continue
        proxy["with_skills"] += 1
        if held:
            proxy["with_skills_and_any_qualification_or_credential"] += 1
        mappable = False
        for entry in held:
            label = _label(entry)
            values = [v for v in (entry.values() if isinstance(entry, dict) else [entry]) if isinstance(v, str)]
            if (label and norm(label) in qualification_names) or any(v.strip().casefold() in codes for v in values):
                mappable = True
        proxy["with_skills_and_catalog_mappable_qualification_or_credential"] += mappable

    regions = Counter((p.get("personal_information") or {}).get("region") or "(none)" for p in profiles)
    audit_query = select(TspSignInAudit.event, TspSignInAudit.subject, TspSignInAudit.occurred_at).where(
        TspSignInAudit.subject.not_in(exclude))
    if since:
        audit_query = audit_query.where(TspSignInAudit.occurred_at >= since)
    audit = session.exec(audit_query).all()
    months = sorted(row.occurred_at.strftime("%Y-%m") for row in audit if row.occurred_at)
    pending = len(session.exec(select(TspPendingSignIn.id)).all())

    return {
        "census_version": CENSUS_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "filters": {"since": since.date().isoformat() if since else None, "excluded_subjects": len(exclude)},
        "privacy": {"k": k, "rule": "Label text and region counts are shown only when at least k learners share "
                                    "them; no identifiers, names or single-learner values are printed."},
        "catalog_qualifications": len(current.items),
        "learners": {"linked": len(profiles), "pending_consent_now": pending,
                     "with_any_skill": sum(1 for labels in learner_labels if labels),
                     "with_no_skill": sum(1 for labels in learner_labels if not labels)},
        "scopes_granted": dict(Counter(" ".join(sorted(scopes or [])) for _, scopes in rows)),
        "sign_in_events": {**dict(Counter(row.event for row in audit)),
                           "distinct_subjects": len({row.subject for row in audit}),
                           "first_month": months[0] if months else None, "last_month": months[-1] if months else None},
        "sections": {name: describe_section(entries) for name, entries in sorted(by_section.items())},
        "skill_labels": {
            "occurrences": total,
            "distinct": len(learners_per_label),
            "chars": percentiles(chars),
            "words": percentiles(word_counts),
            "length_buckets": dict(words_hist),
            "language_heuristic": dict(langs),
            "words_in_neither_lexicon_share": round(oov / all_words, 3) if all_words else None,
            "form": dict(form),
            "exact_catalog_match": dict(matched),
            "share_of_occurrences_shared_by_2plus_learners": round(shared / total, 3) if total else None,
            "common_labels": [{"label": display[key], "learners": n}
                              for key, n in learners_per_label.most_common() if n >= k][:50],
            "distinct_labels_not_shown": sum(1 for n in learners_per_label.values() if n < k),
        },
        "regions": {region: shown(n, k) for region, n in sorted(regions.items())},
        "proxy_label_feasibility": dict(proxy),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--k", type=int, default=5, help="minimum learners before a label or region count is shown")
    parser.add_argument("--out", type=Path, help="write the JSON here instead of standard output")
    parser.add_argument("--since", type=date.fromisoformat, default=None,
                        help="only learners linked on or after this date (YYYY-MM-DD), e.g. after a staging reset")
    parser.add_argument("--exclude-subjects", type=Path, default=None,
                        help="a file of sso_ids to leave out, one per line (TSP test accounts)")
    args = parser.parse_args(argv)
    if args.k < 2:
        parser.error("--k must be at least 2")
    engine = get_engine()
    with Session(engine) as session:
        if engine.dialect.name == "postgresql":
            session.connection().exec_driver_sql("SET TRANSACTION READ ONLY")
        try:
            since = datetime.combine(args.since, time.min, UTC) if args.since else None
            exclude = frozenset(args.exclude_subjects.read_text().split()) if args.exclude_subjects else frozenset()
            report = census(session, args.k, since, exclude)
        finally:
            session.rollback()
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    learners = report["learners"]
    print(f"census: {learners['linked']} linked learners, {learners['with_any_skill']} with skills, "
          f"{report['skill_labels']['occurrences']} skill labels", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
