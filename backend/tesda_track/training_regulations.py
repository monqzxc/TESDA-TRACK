"""Build the qualification catalog from TESDA's published Training Regulations (TRs).

    python -m tesda_track.training_regulations list                 # public TR list -> seed/sources/training_regulations.json
    python -m tesda_track.training_regulations download --email ... # TR PDFs -> seed/sources/tr-pdfs/ (not committed)
    python -m tesda_track.training_regulations build                # parse PDFs -> seed/qualifications.json

TESDA's download form asks for a purpose, a country and an email address for every TR; `download` fills
it in honestly with the values you give, one request at a time. Section 1 of every TR lists the units of
competency (basic, common, core) and the jobs the qualification leads to; `build` extracts those.
Developer tool only: the API never scrapes at runtime. Reading PDFs needs PyMuPDF (requirements-dev.txt).
"""
import argparse
import json
import re
import sys
import time
from html import unescape
from pathlib import Path

import httpx

from tesda_track.seed import SEED_DIR

BASE_URL = "https://tesda.gov.ph"
LIST_PAGES = 39
USER_AGENT = "TESDA-TRACK pilot catalog builder"
SOURCES_DIR = SEED_DIR / "sources"
LIST_FILE = SOURCES_DIR / "training_regulations.json"
PDF_DIR = SOURCES_DIR / "tr-pdfs"
PHILIPPINES = "139"  # CountryId on TESDA's download form

_ROW = re.compile(r'<td class="uppercase"[^>]*>\s*(.*?)\s*</td>\s*<td>\s*<a [^>]*data-id ="(\d+)"', re.S)
_TOKEN = re.compile(r'name="__RequestVerificationToken" type="hidden" value="([^"]+)"')
_LEVEL = re.compile(r"\bNC\s*(IV|III|II|I)\b", re.I)


def parse_list_page(html: str) -> list[dict]:
    rows = []
    for raw_title, download_id in _ROW.findall(html):
        title = re.sub(r"\s+", " ", unescape(raw_title)).strip()
        superseded = "(superseded)" in title.lower()
        level = _LEVEL.search(title)
        rows.append({"title": re.sub(r"\s*\(superseded\)", "", title, flags=re.I).strip(),
                     "download_id": int(download_id), "superseded": superseded,
                     "level": f"NC {level[1].upper()}" if level else None})
    return rows


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, headers={"User-Agent": USER_AGENT}, timeout=180, follow_redirects=True)


def collect_list(delay: float = 2.0) -> list[dict]:
    rows = []
    with _client() as http:
        for page in range(1, LIST_PAGES + 1):
            rows += parse_list_page(http.get(f"/Download/Training_Regulations?page={page}").text)
            time.sleep(delay)
    return rows


def pdf_path(row: dict) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "-", row["title"].lower()).strip("-")
    return PDF_DIR / f"{row['download_id']}-{slug}.pdf"


def download(rows: list[dict], email: str, purpose: str, delay: float = 3.0) -> tuple[int, list[str]]:
    """Fetch each TR PDF through TESDA's form, skipping files already on disk. Returns (downloaded, failures)."""
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    downloaded, failures = 0, []
    with _client() as http:
        token = None
        for row in rows:
            target = pdf_path(row)
            if target.exists():
                continue
            for attempt in (1, 2):
                if token is None or attempt == 2:
                    token = _TOKEN.search(http.get("/Download/Training_Regulations").text)[1]
                try:
                    response = http.post("/Download/DownloadTR", data={
                        "__RequestVerificationToken": token, "Purpose": purpose, "CountryId": PHILIPPINES,
                        "Email": email, "D_id": str(row["download_id"])})
                except httpx.HTTPError as error:
                    response = None
                    reason = type(error).__name__
                if response is not None and response.content[:4] == b"%PDF":
                    target.write_bytes(response.content)
                    downloaded += 1
                    print(f"saved {target.name}", flush=True)
                    break
                reason = reason if response is None else f"HTTP {response.status_code}, not a PDF"
            else:
                failures.append(f"{row['title']} ({row['download_id']}): {reason}")
                print(f"FAILED {row['title']}: {reason}", flush=True)
            time.sleep(delay)
    return downloaded, failures


def current_rows() -> list[dict]:
    return [row for row in json.loads(LIST_FILE.read_text(encoding="utf-8")) if not row["superseded"]]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the qualification catalog from TESDA Training Regulations.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="collect the public list of Training Regulations")
    get = commands.add_parser("download", help="download current TR PDFs through TESDA's form")
    get.add_argument("--email", required=True, help="your email address, as TESDA's form requires")
    get.add_argument("--purpose", default="Building the TESDA-TRACK pilot qualification catalog")
    get.add_argument("--delay", type=float, default=3.0, help="seconds between downloads")
    commands.add_parser("build", help="parse downloaded PDFs into seed/qualifications.json")
    args = parser.parse_args()

    if args.command == "list":
        rows = collect_list()
        SOURCES_DIR.mkdir(parents=True, exist_ok=True)
        LIST_FILE.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{len(rows)} Training Regulations ({sum(not r['superseded'] for r in rows)} current) -> {LIST_FILE}")
    elif args.command == "download":
        downloaded, failures = download(current_rows(), args.email, args.purpose, args.delay)
        print(f"Downloaded {downloaded}; {len(failures)} failed.")
        for failure in failures:
            print(f"  {failure}")
        sys.exit(1 if failures else 0)
    else:
        build()


# Parsing Section 1 of a TR

_CATEGORY = re.compile(r"\b(BASIC|COMMON|CORE|ELECTIVE)\s+(?:UNITS?\s+OF\s+)?COMPETENC", re.I)
_COLUMN_HEADING = re.compile(r"^(UNIT\s+)?CODE(\s+NO\.?)?$|^UNITS?\s+OF\s+COMPETENCY$", re.I)
_JOBS_INTRO = re.compile(r"(competent|qualified) to be", re.I)
_ENUMERATION = re.compile(r"^(?:[a-z]|\d{1,2})[.)]\s+")
# Unit codes look like 500311105, HCS323201, TRS512328 or MTM83417; text extraction sometimes splits them
# ("HC S323307", "AFF 610301").
_UNIT = re.compile(r"^((?:[A-Z]\s?){0,5}\d(?:\s?\d){4,8})(?:\s+(.*))?$")
# Page headers and footers, page numbers, ruled lines and web addresses.
_PAGE_FURNITURE = re.compile(r"(^(TR|TRAINING REGULATIONS?)\b.*\bNC\b)|Promulgated|^(Revised|Amended)\b"
                             r"|^-?\s*\d{1,3}\s*-?$|^Page \d+|^[-_=.\u2013\u2014\s]{3,}$|\bhttps?://", re.I)
# Bullets as the PDFs extract them: dashes, arrows, geometric shapes, dingbats such as "❑", and the
# private-use glyphs of symbol fonts.
_BULLET = re.compile(r"^[\s*\-\u00b7\u2013\u2014\u2022\u2023\u2043\u2190-\u21ff\u25a0-\u25ff\u2600-\u27bf\ue000-\uf8ff]+")
_SMALL_WORDS = {"and", "of", "the", "for", "in", "on", "to", "or", "a", "an"}
_GENERIC_JOBS = {"worker", "assistant", "helper", "operator", "technician", "staff", "attendant", "servicer",
                 "trainer", "supervisor", "specialist", "aide"}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _is_furniture(line: str) -> bool:
    return bool(_PAGE_FURNITURE.search(line))


def _section_one(lines: list[str]) -> list[str]:
    """Lines from the first competency heading that is followed by a unit code, up to Section 2."""
    cleaned = [_clean(line) for line in lines]
    cleaned = [line for line in cleaned if line and not _is_furniture(line)]
    for index, line in enumerate(cleaned):
        if _CATEGORY.search(line) and len(line) < 60 and any(_UNIT.match(next_line)
                                                             for next_line in cleaned[index:index + 4]):
            section = []
            for following in cleaned[index:]:
                if re.match(r"^SECTION\s*2\b", following, re.I):
                    break
                section.append(following)
            return section
    return []


def parse_units(lines: list[str]) -> list[tuple[str, str]]:
    """(category, title) for every basic, common and core unit of competency in Section 1.

    Tables come out either row by row (code, title, code, title) or column by column (all codes, then all
    titles), so codes wait in a queue and take the next titles in order. A heading that arrives after its
    codes (column order) relabels the codes still waiting. Titles wrap onto lines that start in lowercase.
    """
    units: list[list[str]] = []
    waiting: list[int] = []
    last, category, in_jobs = None, None, False
    for line in _section_one(lines):
        heading = _CATEGORY.search(line) if len(line) < 60 else None
        if heading:
            category, in_jobs = heading[1].title(), False
            for index in waiting:
                units[index][0] = category
            continue
        if _JOBS_INTRO.search(line):
            in_jobs, waiting, last = True, [], None
            continue
        if _COLUMN_HEADING.match(line):
            continue
        unit = _UNIT.match(line)
        if unit:
            in_jobs = False
            units.append([category, _clean(unit[2] or "")])
            if unit[2]:
                last = len(units) - 1
            else:
                waiting.append(len(units) - 1)
            continue
        if in_jobs:
            continue
        if line[:1].islower() and last is not None:
            units[last][1] = f"{units[last][1]} {line}"
        elif waiting:
            last = waiting.pop(0)
            units[last][1] = line
        else:
            last = None  # e.g. a title the extractor repeated after the table
    return [(category, _clean(title).rstrip(".")[:255]) for category, title in units
            if title and category in ("Basic", "Common", "Core")]


def _wraps(previous: str, line: str) -> bool:
    """Whether a line without a bullet continues the job title before it, e.g. after an unclosed bracket."""
    return previous.count("(") > previous.count(")") or previous.endswith(("/", "-", ",")) or line[:1].islower()


def parse_jobs(lines: list[str]) -> list[str]:
    """Job titles listed after "A person who has achieved this Qualification is competent to be ...:"."""
    cleaned = [_clean(line) for line in lines]
    cleaned = [line for line in cleaned if line and not _is_furniture(line)]
    for index, line in enumerate(cleaned):
        if not _JOBS_INTRO.search(line):
            continue
        start = index + 1
        if not line.endswith(":"):  # the sentence wraps onto a few more lines before the list
            for offset, following in enumerate(cleaned[index + 1:index + 4], start=index + 1):
                if following.endswith(":"):
                    start = offset + 1
                    break
        jobs, bulleted_list, pending_bullet = [], None, False
        for following in cleaned[start:]:
            bulleted = pending_bullet or bool(_BULLET.match(following) or _ENUMERATION.match(following))
            title = _clean(_ENUMERATION.sub("", _BULLET.sub("", following)))
            title = re.sub(r"[,;]?\s*\b(or|and)$|[,;.]$", "", title).strip()  # "Electrical Leadman, or"
            title = title.rstrip("*").strip()  # a footnote mark
            if not title:  # a bullet on its own line; its job title is on the next line
                pending_bullet = True
                continue
            pending_bullet = False
            if _CATEGORY.search(following) or _UNIT.match(following) or re.match(r"^(SECTION|CODE|UNIT)\b", title):
                break
            if bulleted_list is None:
                bulleted_list = bulleted
            if bulleted_list and not bulleted and jobs and _wraps(jobs[-1], title):
                jobs[-1] = f"{jobs[-1]} {title}"
                if jobs[-1].endswith(":"):  # "Service Agent, including entry-level positions for:" + a sub-list
                    jobs[-1] = jobs[-1].split(",")[0]
                    break
                continue
            if bulleted_list and not bulleted and title.endswith(":"):  # "May also be known by specific products:"
                continue
            # A bulleted list ends at the first line without a bullet; a plain list at the first sentence.
            if (bulleted_list and not bulleted) or (not bulleted and (len(title) > 60 or title.endswith("."))):
                break
            jobs.append(title)
        return [job + ")" * (job.count("(") - job.count(")")) for job in jobs[:8]]  # some TRs never close one
    return []


def _title_case(text: str) -> str:
    words = text.lower().split()
    titled = " ".join(word if index and word.strip(",") in _SMALL_WORDS else word[:1].upper() + word[1:]
                      for index, word in enumerate(words))
    return re.sub(r"/(\w)", lambda match: "/" + match[1].upper(), titled)


def parse_sector(lines: list[str]) -> str | None:
    """The sector named on the cover, e.g. "TOURISM SECTOR"; wrapped over two lines on some covers."""
    cleaned = [_clean(line) for line in lines if _clean(line)]
    for index, line in enumerate(cleaned):
        if not re.search(r"\bSECTOR\s*$", line):
            continue
        parts = [re.sub(r"\s*\bSECTOR\b.*$", "", line)]
        previous = cleaned[index - 1] if index else ""
        if (index >= 2 and previous.isupper() and not _LEVEL.search(previous)
                and previous not in ("TRAINING", "REGULATIONS", "TRAINING REGULATIONS", "TABLE OF CONTENTS")):
            parts.insert(0, previous)
        sector = _title_case(" ".join(parts)).replace("Ict", "ICT")
        return canonical_sector(sector) if sector else None
    return None


def sector_from_text(lines: list[str]) -> str | None:
    """Fallback for covers without a sector: "packaged from the competency map of the X Sector"."""
    text = _clean(" ".join(lines))
    match = re.search(r"competency map of the (.{3,80}?) sector", text, re.I)
    return canonical_sector(_title_case(match[1])) if match else None


def _base_name(title: str) -> str:
    return _clean(_LEVEL.sub("", title))


def _level_suffix(title: str) -> str:
    level = _LEVEL.search(title)
    return f"-NC-{level[1].upper()}" if level else ""


def make_code(title: str, taken: set[str]) -> str:
    """A readable, unique catalog code of at most 40 characters, e.g. CAREGIVING-NC-II or SMAW-NC-II."""
    base, suffix = _base_name(title), _level_suffix(title)
    acronym = re.search(r"\(([A-Z0-9]{2,8})\)", base)
    words = [w for w in re.findall(r"[A-Za-z0-9]+", re.sub(r"\([^)]*\)", "", base))
             if w.lower() not in _SMALL_WORDS]
    if acronym:
        stem = acronym[1]
    elif len("-".join(words)) + len(suffix) <= 40:
        stem = "-".join(words).upper()
    else:
        stem = "".join(word[0] for word in words).upper()
    code, counter = f"{stem}{suffix}", 2
    while code in taken:
        code, counter = f"{stem}{suffix}-{counter}", counter + 1
    taken.add(code)
    return code


def skill_label(title: str) -> str:
    return _clean(re.sub(r"\([^)]*\)", "", _base_name(title)))[:120] or title[:120]


def search_keywords(title: str, jobs: list[str]) -> list[str]:
    """Phrases a learner might type: the qualification's name, its acronym, and each job's head noun phrase."""
    keywords = [skill_label(title).lower()]
    acronym = re.search(r"\(([A-Z0-9]{2,8})\)", title)
    if acronym:
        keywords.append(acronym[1].lower())
    for job in jobs:
        phrase = re.split(r"\s+(?:of|in|for|or)\s+|[(/,]", job.lower())[0].strip()
        if len(phrase) >= 4 and phrase not in _GENERIC_JOBS:
            keywords.append(phrase)
    return list(dict.fromkeys(keywords))


def build_entry(row: dict, lines: list[str], cover: list[str], taken_codes: set[str]) -> dict | None:
    """A seed entry for one TR, or None when its Section 1 has no core units we could read."""
    units = parse_units(lines)
    if not any(category == "Core" for category, _ in units):
        return None
    jobs = parse_jobs(lines) or [skill_label(row["title"])]
    return {
        "code": make_code(row["title"], taken_codes),
        "name": row["title"],
        "sector": parse_sector(cover) or sector_from_text(lines) or "Other",
        "skill_label": skill_label(row["title"]),
        "career_keywords": search_keywords(row["title"], jobs),
        "possible_jobs": jobs,
        "competencies": [{"id": position, "name": name, "category": category}
                         for position, (category, name) in enumerate(units, start=1)],
        "source": {"publisher": "TESDA Training Regulations", "download_id": row["download_id"],
                   "list": f"{BASE_URL}/Download/Training_Regulations"},
    }


CURATED_FILE = SOURCES_DIR / "curated.json"
KEYWORDS_FILE = SOURCES_DIR / "keywords_tl.json"
OUTPUT_FILE = SEED_DIR / "qualifications.json"
# TRs written in different years spell the same sector differently.
SECTOR_ALIASES = {
    "information and communications technology": "Information and Communication Technology",
    "information and communication technology": "Information and Communication Technology",
    "ict": "Information and Communication Technology",
    "agriculture and fisheries": "Agriculture, Forestry and Fishery",
    "agriculture and fishery": "Agriculture, Forestry and Fishery",
    "agricultural, forestry and fishery": "Agriculture, Forestry and Fishery",
    "agriculture, forestry and fisheries": "Agriculture, Forestry and Fishery",
    "agriculture, forestry and fishery": "Agriculture, Forestry and Fishery",
    "agriculture and fishery, processed food and beverages": "Agriculture, Forestry and Fishery",
    "automotive": "Automotive and Land Transportation",
    "automotive and land transport": "Automotive and Land Transportation",
    "automotive/land transport": "Automotive and Land Transportation",
    "automotive manufacturing sub-": "Automotive Manufacturing",
    "conditioning and refrigeration technology": "Heating, Ventilation, Air Conditioning and Refrigeration Technology",
    "heating, ventilation, air-conditioning and refrigeration technology":
        "Heating, Ventilation, Air Conditioning and Refrigeration Technology",
    "hvac/r": "Heating, Ventilation, Air Conditioning and Refrigeration Technology",
    "electronics": "Electrical and Electronics",
    "health, social, and other community development services": "Health, Social and Other Community Development Services",
    "social and other community development services": "Health, Social and Other Community Development Services",
    "social, community development and other services": "Health, Social and Other Community Development Services",
    "human health/ealth care": "Human Health/Health Care",
    "processed foods and beverages": "Processed Food and Beverages",
    "logistics and transport": "Transport and Logistics",
    "tour guiding services iii tourism": "Tourism",
    "tvet": "TVET",
}


def canonical_sector(sector: str) -> str:
    name = _clean(re.sub(r"\([^)]*\)", "", sector).replace("&", " and "))
    name = re.sub(r"\s*/\s*", "/", name)
    name = re.sub(r"/(\w)", lambda match: "/" + match[1].upper(), name)
    return SECTOR_ALIASES.get(name.lower(), name)


def merge_curated(scraped: list[dict], curated: list[dict]) -> list[dict]:
    """Hand-curated qualifications keep their code, sector, jobs and tuned keywords, and take the TR's real
    units of competency when its PDF could be read. They stay first; everything else follows by name."""
    by_name = {entry["name"].lower(): entry for entry in scraped}
    merged = []
    for entry in curated:
        parsed = by_name.pop(entry["name"].lower(), None)
        if parsed is None:
            merged.append(entry)
            continue
        merged.append({**parsed, "code": entry["code"], "sector": entry["sector"], "skill_label": entry["skill_label"],
                       "possible_jobs": entry["possible_jobs"],
                       "career_keywords": list(dict.fromkeys(entry["career_keywords"] + parsed["career_keywords"]))})
    return merged + sorted(by_name.values(), key=lambda entry: entry["name"].lower())


def add_keywords(catalog: list[dict], extra: dict[str, list[str]]) -> list[str]:
    """Merge extra keywords by qualification name (case-insensitive); returns names not in the catalog."""
    by_name = {entry["name"].lower(): entry for entry in catalog}
    unknown = []
    for name, keywords in extra.items():
        if name.startswith("_"):
            continue
        entry = by_name.get(name.lower())
        if entry is None:
            unknown.append(name)
            continue
        entry["career_keywords"] = list(dict.fromkeys(entry["career_keywords"] + keywords))
    return unknown


def build(max_pages: int = 20) -> None:
    import pymupdf

    from tesda_track.seed import parse_catalog

    curated = json.loads(CURATED_FILE.read_text(encoding="utf-8"))
    taken = {entry["code"] for entry in curated}
    entries, problems = [], []
    for row in current_rows():
        path = pdf_path(row)
        if not path.exists():
            problems.append(f"{row['title']}: not downloaded")
            continue
        with pymupdf.open(path) as document:
            pages = [document[i].get_text() for i in range(min(max_pages, document.page_count))]
        entry = build_entry(row, "\n".join(pages).splitlines(), "\n".join(pages[:4]).splitlines(), taken)
        if entry is None:
            problems.append(f"{row['title']}: no core units found in Section 1")
            continue
        entries.append(entry)
    catalog = merge_curated(entries, curated)
    unknown = add_keywords(catalog, json.loads(KEYWORDS_FILE.read_text(encoding="utf-8")))
    problems += [f"{name}: listed in {KEYWORDS_FILE.name} but not in the catalog" for name in unknown]
    parse_catalog(catalog)  # refuse to write anything the seed would reject
    OUTPUT_FILE.write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(catalog)} qualifications -> {OUTPUT_FILE} ({len(entries)} parsed from TRs)")
    for problem in problems:
        print(f"  skipped {problem}")


if __name__ == "__main__":
    main()
