"""Assessor labeling: a blind sheet, agreement between raters, and a case file the evaluation accepts."""
import csv
import json

import pytest

from evaluation import labeling as L
from evaluation import suggestions as S


class Item:
    def __init__(self, code, name):
        self.code = code
        self.summary = type("Summary", (), {"name": name})()


ITEMS = [Item("WELD", "Welding NC II"), Item("COOK", "Cookery NC II"), Item("CARP", "Carpentry NC II")]


def cases():
    return [S.Case(f"c{i}", "real", "real", "unknown", skills, region=region)
            for i, (skills, region) in enumerate([(["welding"], "NCR"), (["cooking"], "VII"), ([], "NCR"),
                                                  (["communication"], "NCR")])]


def runs():
    return {"suggest": [[["WELD", "CARP"], ["COOK"], [], []]],
            "keyword_only": [[["WELD"], ["COOK", "WELD"], [], []]],
            "hybrid_kw0.5": [[["CARP"], ["CARP"], [], []]],
            "random": [[["CARP", "COOK", "WELD"]] * 4]}


def test_sheet_is_blind_stratified_and_skips_empty_profiles():
    rows, key = L.build_sheet(cases(), runs(), ITEMS, per_stratum=5, seed=1)
    assert set(rows[0]) == set(L.SHEET_COLUMNS)
    assert len(key["profiles"]) == 3  # the profile with no skills has nothing to judge
    assert {p["stratum"].split("|")[0] for p in key["profiles"].values()} == {"shown", "abstained"}
    welding = [r for r in rows if r["skills"] == "welding"]
    assert {r["candidate_code"] for r in welding} == {"WELD", "CARP", L.NONE_ROW, L.OTHER_ROW}
    # Which system showed a candidate lives only in the key; sweeps and random picks are not candidates.
    assert all("suggest" not in json.dumps(r) and "keyword" not in json.dumps(r) for r in rows)
    weld_row = next(r for r in welding if r["candidate_code"] == "WELD")["row_id"]
    assert key["rows"][weld_row]["shown_by"] == {"suggest": 1, "keyword_only": 1}


def fill(tmp_path, rows, name, grade_of):
    path = tmp_path / f"{name}.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=L.SHEET_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "grade": grade_of(row)})
    return path


def grades(row):
    if row["candidate_code"] == L.OTHER_ROW:
        return ""
    if row["skills"] == "communication":
        return {L.NONE_ROW: 3}.get(row["candidate_code"], 0)
    return {"WELD": 3, "COOK": 3, "CARP": 1, L.NONE_ROW: 0}[row["candidate_code"]]


def test_agreement_and_case_file_from_two_raters(tmp_path):
    rows, key = L.build_sheet(cases(), runs(), ITEMS, per_stratum=5, seed=1)
    sheets = [fill(tmp_path, rows, "ana", grades),
              fill(tmp_path, rows, "ben", lambda r: grades(r) if r["candidate_code"] != "CARP" else 0)]
    ratings = L.read_ratings(sheets, key)
    report = L.agreement_report(ratings, key)
    assert report["raters"] == ["ana", "ben"] and report["candidate_rows_rated_twice_or_more"] == 4
    assert 0 < report["krippendorff_alpha_ordinal"] < 1
    assert report["krippendorff_alpha_nothing_fits"] == 1

    data = L.case_file(ratings, key, ["Ana, assessor", "Ben, assessor"], {"welding nc ii": "WELD"})
    by_skill = {tuple(c["skills"]): c for c in data["cases"]}
    assert by_skill[("welding",)]["judgments"] == {"WELD": 3, "CARP": 0}
    assert by_skill[("communication",)]["expect_empty"] is True
    # The evaluation reads it like any other case file.
    path = tmp_path / "suggestion_assessor_v1.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    _, loaded = S.file_cases(path, "file:suggestion_assessor_v1", {"WELD", "COOK", "CARP"})
    assert len(loaded) == 3


def test_ratings_reject_unknown_rows_bad_grades_and_a_single_rater(tmp_path):
    rows, key = L.build_sheet(cases(), runs(), ITEMS, per_stratum=5, seed=1)
    with pytest.raises(ValueError, match="use 0, 1, 2 or 3"):
        L.read_ratings([fill(tmp_path, rows, "a", lambda r: "5"), fill(tmp_path, rows, "b", grades)], key)
    with pytest.raises(ValueError, match="at least two"):
        L.read_ratings([fill(tmp_path, rows, "a", grades)], key)
    other = dict(key, rows={})
    with pytest.raises(ValueError, match="not in this key"):
        L.read_ratings([fill(tmp_path, rows, "a", grades), fill(tmp_path, rows, "b", grades)], other)


def test_alpha_is_one_for_perfect_agreement_and_low_for_opposites():
    assert L.krippendorff_alpha_ordinal({"a": [3, 3], "b": [0, 0], "c": [2, 2]}) == 1
    assert L.krippendorff_alpha_ordinal({"a": [3, 0], "b": [0, 3], "c": [2, 1]}) < 0


def test_quadratic_kappa_penalises_far_disagreements_more():
    near = L.cohen_kappa_quadratic([3, 2, 1, 0, 3, 2], [2, 2, 1, 0, 3, 1])
    far = L.cohen_kappa_quadratic([3, 2, 1, 0, 3, 2], [0, 2, 1, 0, 3, 1])
    assert near > far
