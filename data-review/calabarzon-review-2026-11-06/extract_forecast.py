"""Extract the 'Priority Skills Requirements' tables (in-demand / hard-to-fill occupations) from a DOLE JLMF PDF.

Usage: python -I -X utf8 jlmf_tables.py <pdf> <out_csv> <edition label> <region label>

The tables are drawn as cells separated by thin vector lines, but background artwork adds shorter lines that confuse
generic table detection. Here a column border is a vertical line run covering nearly the whole table height, and a
row border is a horizontal run covering nearly the whole table width. Words are assigned to cells by their centre.
"""
import csv
import re
import sys
from collections import defaultdict

import pymupdf

CHECKED, UNCHECKED = "☑", "☐"
KEYS = [("occupation", r"^occupation"), ("deployment", r"^deployment"), ("qualification", r"^general qualification"),
        ("in_demand", r"^in-? ?demand"), ("hard_to_fill", r"^hard-? ?to-? ?fill"), ("reason", r"^reason")]


def runs(page: pymupdf.Page) -> tuple[dict, dict]:
    vertical, horizontal = defaultdict(float), defaultdict(float)
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                a, b = item[1], item[2]
                if abs(a.x - b.x) < 1 and abs(a.y - b.y) > 3:
                    vertical[round(a.x)] += abs(a.y - b.y)
                elif abs(a.y - b.y) < 1 and abs(a.x - b.x) > 3:
                    horizontal[round(a.y)] += abs(a.x - b.x)
    return vertical, horizontal


def cluster(values: list[int], gap: float = 4) -> list[float]:
    groups: list[list[int]] = []
    for value in sorted(values):
        if groups and value - groups[-1][-1] <= gap:
            groups[-1].append(value)
        else:
            groups.append([value])
    return [sum(g) / len(g) for g in groups]


def grid(page: pymupdf.Page) -> tuple[list[float], list[float]] | None:
    vertical, horizontal = runs(page)
    if not vertical or not horizontal:
        return None
    tallest = max(vertical.values())
    xs = cluster([x for x, length in vertical.items() if length >= 0.9 * tallest])
    if len(xs) < 5:
        return None
    width = xs[-1] - xs[0]
    ys = cluster([y for y, length in horizontal.items() if length >= 0.8 * width], gap=3)
    return (xs, ys) if len(ys) >= 3 else None


def flat(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace(CHECKED, " ").replace(UNCHECKED, " ")).strip()


def bullets(words: list) -> str:
    """Join a cell's words line by line, turning bullet glyphs into '; ' separators."""
    lines = defaultdict(list)
    for w in words:
        lines[(w[5], w[6])].append(w)
    text = " ".join(" ".join(w[4] for w in sorted(line, key=lambda w: w[0])) for _, line in sorted(lines.items()))
    parts = [flat(p) for p in re.split(r"[•●]", text)]
    return "; ".join(p for p in parts if p)


def main() -> None:
    pdf, out, edition, region = sys.argv[1:5]
    doc = pymupdf.open(pdf)
    rows, sector = [], None
    for index, page in enumerate(doc):
        text = page.get_text()
        title = re.search(r"Table \d+\.\s*Priority Skills Requirements? for ([^\n(]+)", text)
        if title:
            sector = flat(title.group(1))
        if not sector or "Occupation" not in text:
            continue
        found = grid(page)
        if not found:
            continue
        xs, ys = found
        words = page.get_text("words", sort=True)
        cells = defaultdict(list)
        for w in words:
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            col = next((i for i in range(len(xs) - 1) if xs[i] <= cx < xs[i + 1]), None)
            row = next((i for i in range(len(ys) - 1) if ys[i] <= cy < ys[i + 1]), None)
            if col is not None and row is not None:
                cells[(row, col)].append(w)
        header_row = next((r for r in range(len(ys) - 1)
                           if flat(" ".join(w[4] for w in cells[(r, 0)])).lower().startswith("occupation")), None)
        if header_row is None:
            continue
        keys = []
        for col in range(len(xs) - 1):
            label = flat(" ".join(w[4] for w in cells[(header_row, col)])).lower()
            label = re.sub(r"\(graduate.*", "", label).strip()
            keys.append(next((k for k, pattern in KEYS if re.search(pattern, label)), f"col{col}"))
        reasons = [i for i, k in enumerate(keys) if k == "reason"]
        if len(reasons) == 2:
            keys[reasons[0]], keys[reasons[1]] = "in_demand_reason", "hard_to_fill_reason"
        for r in range(header_row + 1, len(ys) - 1):
            cell = {keys[c]: cells[(r, c)] for c in range(len(keys))}
            raw = lambda key: " ".join(w[4] for w in cell.get(key, []))
            occupation = flat(" ".join(" ".join(w[4] for w in sorted(line, key=lambda w: w[0]))
                                       for _, line in sorted(_lines(cell.get("occupation", [])).items())))
            if not occupation:
                continue
            rows.append({
                "edition": edition, "region": region, "page": index + 1, "sector": sector,
                "occupation": occupation,
                "in_demand": CHECKED in raw("in_demand"),
                "hard_to_fill": CHECKED in raw("hard_to_fill"),
                "deployment": bullets(cell.get("deployment", [])),
                "general_qualification": bullets(cell.get("qualification", [])),
                "in_demand_reason": flat(raw("in_demand_reason")),
                "hard_to_fill_reason": flat(raw("hard_to_fill_reason")),
            })
    for row in rows:
        row["mentions_tesda_or_nc"] = bool(re.search(r"\bNC\b|\bNC\s?I|TESDA", row["general_qualification"]))
    with open(out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    by_sector = {}
    for row in rows:
        counts = by_sector.setdefault(row["sector"], [0, 0, 0])
        counts[0] += 1
        counts[1] += row["in_demand"]
        counts[2] += row["hard_to_fill"]
    print(f"{len(rows)} occupations")
    for name, (n, d, h) in by_sector.items():
        print(f"  {name}: {n} rows, {d} in-demand, {h} hard-to-fill")


def _lines(words: list) -> dict:
    lines = defaultdict(list)
    for w in words:
        lines[(w[5], w[6])].append(w)
    return lines


if __name__ == "__main__":
    main()
