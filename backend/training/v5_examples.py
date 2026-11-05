"""Build bounded multilingual learner queries from the public qualification catalog.

Frames use the project's localized learner prompts. Official qualifications, jobs and
Core tasks stay in their catalog language, as they do in code-switched searches.
Regional wording and generated labels are drafts pending speaker and subject review.
"""
import hashlib
from collections import defaultdict

from tesda_track.utils.helpers import normalize
from training import v4
from training.demand import ALIASES, title_key

# (aspiration, learning goal, reported skill, qualification request, broad hotel goal)
FRAMES = {
    "en": ("I'd like to become a {}", "I'd like to learn how to {}", "I can already {}",
           "I'm interested in enrolling in {}", "I'm looking for work at a hotel"),
    "tl": ("Gusto kong maging {}", "Gusto kong matutunan ito: {}", "Marunong ako nito: {}",
           "Gusto kong kumuha ng {}", "Naghahanap ako ng trabaho sa isang hotel"),
    "taglish": ("Target job ko ang {}", "Training goal ko: {}", "May experience ako sa skill na {}",
                "Ang gusto kong i-take ay {}", "Hotel work ang career goal ko"),
    "ceb": ("Gusto kong mahimong {}", "Gusto kong makat-on niini: {}", "Kahibalo ko niini: {}",
            "Ganahan ko mokuha og {}", "Ganahan ko motrabaho sa usa ka hotel"),
    "hil": ("Gusto ko mangin {}", "Gusto ko magtuon sini: {}", "Kabalo ako sini: {}",
            "Gusto ko magkuha sang {}", "Gusto ko magtrabaho sa isa ka hotel"),
    "ilo": ("Kayatko nga agbalin a {}", "Kayatko nga adalen daytoy: {}", "Ammok daytoy: {}",
            "Kayatko nga alaen ti {}", "Kayatko nga agtrabaho iti hotel"),
    "pam": ("Buri kung maging {}", "Buri kung pag-aralan ini: {}", "Balu ku ini: {}",
            "Buri kung kuanan ing {}", "Buri kung magobra king hotel"),
    "war": ("Karuyag ko magin {}", "Karuyag ko mahibaro hini: {}", "Maaram ako hini: {}",
            "Karuyag ko kumuha hin {}", "Karuyag ko magtrabaho ha hotel"),
    "bcl": ("Gusto kong magin {}", "Gusto kong mag-adal nin {}", "Aram ko ini: {}",
            "Gusto kong magkua nin {}", "Gusto kong magtrabaho sa hotel"),
    "pag": ("Labay kon magmaliw ya {}", "Labay kon naaralan so {}", "Amta ko ya gawaen so {}",
            "Labay kon alaen so {}", "Labay kon mankimey ed hotel"),
}
HOTEL_CODES = {"HOUSEKEEPING-NC-II", "FRONT-OFFICE-SERVICES-NC-II", "FBS-NC-II"}
PER_BUCKET = 55


def _order(text):
    return hashlib.sha256(("v5-learner:" + text).encode()).digest()


def learner_rows(qualifications, exclusions, held_jobs=()):
    """Collect all owners before sampling so shared tasks/occupations keep every label."""
    held = {title_key(job) for job in held_jobs}
    names_by_job = defaultdict(set)
    names_by_skill = defaultdict(set)
    for q in qualifications:
        for job in q.possible_jobs:
            if job.strip():
                names_by_job[normalize(job)].add(q.name)
        for c in q.competencies:
            if c.is_active and c.category == "Core":
                names_by_skill[normalize(c.name)].add(q.name)

    pool = {}
    def add(text, owners, lang, kind, group, status="draft"):
        key = normalize(text)
        stem = key.rstrip(".!? ")
        if any(form in exclusions for form in (key, stem, stem + ".", stem + "?")):
            return
        if key not in pool:
            pool[key] = dict(title=text, labels=set(), lang=lang, kind=kind, group=group,
                             split="train", sources={}, review_status=status)
        pool[key]["labels"].update(owners)

    for lang, (job_frame, goal_frame, skill_frame, qualification_frame, hotel_goal) in FRAMES.items():
        for q in qualifications:
            add(qualification_frame.format(q.name), [q.name], lang, "qualification", "qualification:" + q.code)
        for job, owners in names_by_job.items():
            key = title_key(job)
            if key not in held and ALIASES.get(key, key) not in held and len(owners) <= 4:
                add(job_frame.format(job), owners, lang, "job", "job:" + key)
        for skill, owners in names_by_skill.items():
            # A Core unit shared by dozens of unrelated courses has little retrieval value.
            if len(owners) <= 3:
                add(goal_frame.format(skill), owners, lang, "goal", "task:" + skill)
                add(skill_frame.format(skill), owners, lang, "skill", "task:" + skill)
        hotel = [q.name for q in qualifications if q.code in HOTEL_CODES]
        if hotel:
            add(hotel_goal, hotel, lang, "goal", "workplace:hotel")

    # Prefer workplace scenarios over repeated templates where v4 has regional examples.
    for row in v4.records(qualifications):
        if row["kind"] == "native_task":
            add(row["query"], [row["qualification"]], row["lang"], "goal",
                "scenario:" + row.get("scenario_id", row["english"]), row["review_status"])

    # Preserve one explicit request for every qualification. Rotate languages so that
    # one language does not consume the entire budget for named qualifications.
    required_titles = set()
    languages = list(FRAMES)
    for index, q in enumerate(sorted(qualifications, key=lambda item: _order(item.code))):
        for offset in range(len(languages)):
            lang = languages[(index + offset) % len(languages)]
            title = FRAMES[lang][3].format(q.name)
            if normalize(title) in pool:
                required_titles.add(title)
                break

    buckets = defaultdict(list)
    for row in pool.values():
        row["labels"] = sorted(row["labels"])
        buckets[row["lang"], row["kind"]].append(row)
    chosen = []
    for bucket in buckets.values():
        # Reserve hotel and some authored scenarios, then sample deterministically.
        ordered = sorted(bucket, key=lambda r: _order(r["title"]))
        priority = [r for r in ordered if r["group"] == "workplace:hotel" or r["title"] in required_titles]
        scenarios = [r for r in ordered if r["group"].startswith("scenario:")]
        priority.extend(scenarios[:PER_BUCKET // 2])
        reserved = {r["title"] for r in priority}
        chosen.extend((priority + [r for r in ordered if r["title"] not in reserved])[:PER_BUCKET])
    return sorted(chosen, key=lambda r: r["title"])
