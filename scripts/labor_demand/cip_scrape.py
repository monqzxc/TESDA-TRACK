"""Collect DOLE-BLE Career Info PH (cip.philjobnet.gov.ph) in-demand, emerging and green job profiles.

Usage: python -I cip_scrape.py <download_dir> <out_csv>
Fetches each list page and each career page once (1 s apart), keeps the raw HTML in <download_dir>,
and writes one row per career.
"""
import csv
import html
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://cip.philjobnet.gov.ph/"
LISTS = {"in-demand": 3191, "emerging": 3193, "green": 3189}
UA = "TESDA-TRACK labor-market research (one-off, 1 req/s)"


def fetch(url: str, dest: Path) -> str:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest.read_text(encoding="utf-8", errors="replace")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            dest.write_text(body, encoding="utf-8")
            time.sleep(1.0)
            return body
        except Exception as exc:  # flaky network: back off and retry
            print(f"  retry {attempt + 1} {url}: {exc}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed {url}")


def text(fragment: str) -> str:
    fragment = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", fragment)
    fragment = re.sub(r"(?i)<br\s*/?>|</(p|li|div)>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    lines = [re.sub(r"[ \t\xa0]+", " ", html.unescape(line)).strip() for line in fragment.splitlines()]
    return "\n".join(line for line in lines if line)


def list_items(fragment: str) -> list[str]:
    items = re.findall(r"(?is)<li[^>]*>(.*?)</li>", fragment)
    return [text(item).replace("\n", " ") for item in items if text(item)]


def sections(page: str) -> dict[str, str]:
    """Each section is <div class="career-title">Name</div> followed by a <div class="three_fourth last"> body."""
    found = {}
    pattern = re.compile(r'(?is)<div class="career-title">(.*?)</div>\s*</div>\s*<div class="three_fourth last">(.*?)'
                         r'<div class="clear spc"></div>')
    for name, body in pattern.findall(page):
        found[text(name)] = body
    return found


def money(value: str) -> list[int]:
    return [int(n.replace(",", "")) for n in re.findall(r"P\s?([\d,]{4,})", value)]


def parse_career(slug: str, page: str) -> dict:
    title_match = re.search(r"(?is)<title>(.*?)\|", page)
    article = re.search(r'(?is)<article id="post-(\d+)" class="([^"]*)"', page)
    classes = article.group(2).split() if article else []
    intro = re.search(r'(?is)<div class="careerContent">(.*?)<div class="careerinfoBox">', page)
    sec = sections(page)
    prospects = sec.get("Employment Prospects", "")
    salary = re.search(r"(?is)Monthly Salary Range\s*</div>\s*<div>(.*?)</div>", prospects)
    salary_text = text(salary.group(1)) if salary else ""
    industries = re.search(r"(?is)Industries\s*</div>(.*)", prospects)
    numbers = money(salary_text)
    cost = text(sec.get("Cost of Education and Training", ""))
    quals = text(sec.get("Qualifications", ""))
    tesda = sorted(set(re.findall(r"(?i)(?:TESDA[^.;\n]{0,60}?N\.?\s?C\.?\s?(?:I{1,3}V?|IV|[1-4])\b|"
                                  r"N\.?C\.?\s?(?:I{1,3}V?|IV)\b)", cost + "\n" + quals)))
    return {
        "slug": slug,
        "post_id": article.group(1) if article else "",
        "title": html.unescape(title_match.group(1)).strip() if title_match else slug,
        "url": f"{BASE}?careers={slug}",
        "categories": ";".join(c.removeprefix("career_categories-") for c in classes
                               if c.startswith("career_categories-")),
        "salary_band_tag": ";".join(c.removeprefix("salary_range-") for c in classes if c.startswith("salary_range-")),
        "salary_text": salary_text,
        "salary_min_php": numbers[0] if numbers else "",
        "salary_max_php": numbers[-1] if numbers else "",
        "industries": "; ".join(list_items(industries.group(1))) if industries else "",
        "description": text(intro.group(1)).replace("\n", " ") if intro else "",
        "qualifications": quals.replace("\n", " "),
        "competencies": "; ".join(list_items(sec.get("Competencies", ""))),
        "cost_of_training": cost.replace("\n", " "),
        "tesda_mentions": "; ".join(tesda),
        "career_advancement": "; ".join(list_items(sec.get("Propects for Career Advancement", ""))),
    }


def main() -> None:
    download, out = Path(sys.argv[1]), Path(sys.argv[2])
    (download / "careers").mkdir(parents=True, exist_ok=True)
    membership: dict[str, list[str]] = {}
    order: list[str] = []
    for name, page_id in LISTS.items():
        page = fetch(f"{BASE}?page_id={page_id}", download / f"page-{page_id}.html")
        # List entries link as ?careers=<slug>&highlight=..., which the sidebar and footer links don't.
        unique = list(dict.fromkeys(re.findall(r"\?careers=([a-z0-9-]+)&amp;highlight", page)))
        print(f"{name}: {len(unique)} careers")
        for slug in unique:
            membership.setdefault(slug, []).append(name)
            if slug not in order:
                order.append(slug)
    rows = []
    for i, slug in enumerate(order, 1):
        page = fetch(f"{BASE}?careers={slug}", download / "careers" / f"{slug}.html")
        row = parse_career(slug, page)
        row["lists"] = ";".join(membership[slug])
        rows.append(row)
        if i % 20 == 0:
            print(f"  {i}/{len(order)}")
    fields = ["lists"] + [k for k in rows[0] if k != "lists"]
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} careers to {out}")


if __name__ == "__main__":
    main()
