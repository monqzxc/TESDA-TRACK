"""Collect the public PhilJobNet job-vacancy list (philjobnet.gov.ph/job-vacancies/), list pages only.

Usage:
  python -I philjobnet_vacancies.py probe <download_dir> <page>
  python -I philjobnet_vacancies.py crawl <download_dir> <out_jsonl> [delay_seconds]

Keeps only what the public list shows for each opening: job id, title, salary, employer, work location, education
level, employment type and posting date. It never opens job detail pages, so no contact details are collected.
Pages are walked in order (ASP.NET GridView postbacks) and appended to <out_jsonl>, so a rerun resumes.
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

URL = "https://philjobnet.gov.ph/job-vacancies/"
GRID = "ctl00$BodyContentPlaceHolder$GridView1"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TESDA-TRACK labor-market research (one-off)"


class Session:
    def __init__(self) -> None:
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def request(self, data: dict | None = None) -> str:
        body = urllib.parse.urlencode(data).encode() if data else None
        req = urllib.request.Request(URL, data=body, headers={"User-Agent": UA, "Referer": URL})
        with self.opener.open(req, timeout=90) as resp:
            return resp.read().decode("utf-8", errors="replace")


def hidden_fields(page: str) -> dict:
    fields = {}
    for tag in re.findall(r'<input[^>]+type="hidden"[^>]*>', page):
        name = re.search(r'name="([^"]+)"', tag)
        value = re.search(r'value="([^"]*)"', tag)
        if name:
            fields[name.group(1)] = html.unescape(value.group(1)) if value else ""
    return fields


def postback(session: Session, page: str, argument: str) -> str:
    data = hidden_fields(page)
    data.update({"__EVENTTARGET": GRID, "__EVENTARGUMENT": argument})
    return session.request(data)


def clean(fragment: str) -> str:
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment).replace("\xa0", " ")).strip()


def parse(page: str) -> tuple[list[dict], int | None, str | None]:
    grid = page.split('id="ctl00_BodyContentPlaceHolder_GridView1"', 1)[-1].split("GridView2", 1)[0]
    jobs = []
    for card in re.findall(r'(?s)<a href="/job-vacancies/job/([^"]+)" class="nolink">(.*?)</a>\s*</td>', grid):
        slug, body = card
        info = re.findall(r'(?s)<i class="bi bi-(geo-alt|mortarboard|file-text) blue-icon"></i>(.*?)</div>', body)
        info_map = {key: clean(value) for key, value in info}
        posted = re.search(r"Posted on\s*([0-9/]+)", body)
        job_id = re.search(r"-(\d+)$", slug)
        jobs.append({
            "job_id": job_id.group(1) if job_id else slug,
            "title": clean(re.search(r'(?s)<h1 class="jobtitle">(.*?)</h1>', body).group(1)),
            "salary": clean(m.group(1)) if (m := re.search(r'(?s)<h3 class="salary">(.*?)</h3>', body)) else "",
            "employer": clean(m.group(1)) if (m := re.search(r'(?s)<span class="companytitle">(.*?)</span>', body)) else "",
            "location": info_map.get("geo-alt", ""),
            "education": info_map.get("mortarboard", ""),
            "employment_type": info_map.get("file-text", ""),
            "posted_on": posted.group(1) if posted else "",
        })
    current = re.search(r"<td><span>(\d+)</span></td>", grid)
    total = re.search(r"([\d,]+)\s+job openings", page)
    return jobs, int(current.group(1)) if current else None, total.group(1) if total else None


def probe(download: Path, target: int) -> None:
    session = Session()
    first = session.request()
    (download / "page-0001.html").write_text(first, encoding="utf-8")
    jobs, current, total = parse(first)
    print(f"page {current}: {len(jobs)} jobs, total openings {total}; first {jobs[0] if jobs else None}")
    time.sleep(1.5)
    jumped = postback(session, first, f"Page${target}")
    (download / f"probe-{target:04d}.html").write_text(jumped, encoding="utf-8")
    jobs, current, _ = parse(jumped)
    print(f"jump to {target}: now on page {current}, {len(jobs)} jobs; first {jobs[0] if jobs else None}")


def crawl(download: Path, out: Path, delay: float) -> None:
    done = set()
    if out.exists():
        for line in out.read_text(encoding="utf-8").splitlines():
            done.add(json.loads(line)["page"])
    session = Session()
    page = session.request()
    jobs, current, total = parse(page)
    print(f"total openings shown: {total}; resuming after {len(done)} pages", flush=True)
    number, failures = 1, 0
    with out.open("a", encoding="utf-8") as handle:
        while True:
            if number not in done:
                handle.write(json.dumps({"page": number, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                         "jobs": jobs}) + "\n")
                handle.flush()
                done.add(number)
            if number % 25 == 0:
                print(f"  page {number}", flush=True)
            if not jobs or f"Page${number + 1}" not in page:
                print(f"last page reached: {number}", flush=True)
                break
            time.sleep(delay)
            try:
                page = postback(session, page, f"Page${number + 1}")
            except Exception as exc:
                failures += 1
                print(f"  page {number + 1} failed ({exc}); retry {failures}", flush=True)
                if failures > 5:
                    raise
                time.sleep(10 * failures)
                continue
            jobs, current, _ = parse(page)
            if current != number + 1:
                print(f"  expected page {number + 1}, got {current}; stopping", flush=True)
                break
            number, failures = current, 0


if __name__ == "__main__":
    mode, folder = sys.argv[1], Path(sys.argv[2])
    folder.mkdir(parents=True, exist_ok=True)
    if mode == "probe":
        probe(folder, int(sys.argv[3]))
    else:
        crawl(folder, Path(sys.argv[3]), float(sys.argv[4]) if len(sys.argv) > 4 else 1.5)
