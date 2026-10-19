"""Pure helpers behind the guided finder and the qualification library (no Streamlit, no network)."""
from portal.journey import (filter_qualifications, group_competencies, page_count, page_items,
                            qualification_level)


def competency(id, category, position):
    return {"id": id, "name": f"Skill {id}", "category": category, "position": position}


def test_competencies_are_grouped_basic_common_core_in_position_order():
    competencies = [competency(5, "Core", 5), competency(1, "Basic", 1), competency(4, "Core", 4),
                    competency(3, "Common", 3), competency(2, "Basic", 2)]
    groups = group_competencies(competencies)
    assert [category for category, _ in groups] == ["Basic", "Common", "Core"]
    assert [[item["id"] for item in items] for _, items in groups] == [[1, 2], [3], [4, 5]]


def test_unknown_categories_follow_the_known_ones_and_empty_groups_are_skipped():
    groups = group_competencies([competency(9, "Elective", 9), competency(7, "Core", 7)])
    assert [category for category, _ in groups] == ["Core", "Elective"]


def test_qualification_level_reads_the_nc_level_from_the_name():
    assert qualification_level("Shielded Metal Arc Welding (SMAW) NC II") == "NC II"
    assert qualification_level("Bookkeeping NC III") == "NC III"
    assert qualification_level("Trainers Methodology Level I") is None


QUALIFICATIONS = [
    {"code": "SMAW-NC-II", "name": "Shielded Metal Arc Welding (SMAW) NC II", "sector": "Metals and Engineering",
     "possible_jobs": ["Welder", "Fabricator"]},
    {"code": "SMAW-NC-I", "name": "Shielded Metal Arc Welding (SMAW) NC I", "sector": "Metals and Engineering",
     "possible_jobs": ["Welder"]},
    {"code": "COOKERY-NC-II", "name": "Cookery NC II", "sector": "Tourism", "possible_jobs": ["Cook"]},
]


def test_library_search_matches_names_and_jobs_without_case():
    assert [q["code"] for q in filter_qualifications(QUALIFICATIONS, "  COOK ", None, None)] == ["COOKERY-NC-II"]
    assert [q["code"] for q in filter_qualifications(QUALIFICATIONS, "fabricator", None, None)] == ["SMAW-NC-II"]


def test_library_filters_combine_sector_and_level():
    found = filter_qualifications(QUALIFICATIONS, "", "Metals and Engineering", "NC I")
    assert [q["code"] for q in found] == ["SMAW-NC-I"]
    assert filter_qualifications(QUALIFICATIONS, "welder", "Tourism", None) == []


def test_pages_slice_the_list_and_count_partial_pages():
    items = list(range(25))
    assert page_count(25, 12) == 3
    assert page_count(0, 12) == 1
    assert page_items(items, 1, 12) == list(range(12))
    assert page_items(items, 3, 12) == [24]
    assert page_items(items, 9, 12) == [24], "an out-of-range page falls back to the last page"


from portal.journey import plain


def test_plain_shows_learner_text_without_markdown_formatting():
    assert plain("# Welder *now* :material/home: $5") == r"\# Welder \*now\* \:material/home\: \$5"
    assert plain("I want to be a welder.") == r"I want to be a welder\."
