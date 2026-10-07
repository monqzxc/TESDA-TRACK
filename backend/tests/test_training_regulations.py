"""Parsing TESDA Training Regulations into catalog entries. Text samples are trimmed from real TR PDFs."""
from tesda_track.training_regulations import (build_entry, make_code, parse_jobs, parse_list_page, parse_sector,
                                              parse_units, search_keywords)

# Caregiving NC II: code and title on one line, "UNIT CODE ..." headers, bullet jobs after a colon.
CAREGIVING = """
TABLE OF CONTENTS
SECTION 1
CAREGIVING NC II QUALIFICATION
1
Basic Competencies
2-13
TR Caregiving NC II   - 1 -
TRAINING REGULATIONS FOR
CAREGIVING NC II
SECTION 1  CAREGIVING NC II QUALIFICATION
The CAREGIVING NC II Qualification consists of competencies that a person must achieve
to provide care and support to infants/toddlers.
The Units of Competency comprising this Qualification include the following:
UNIT CODE  BASIC COMPETENCIES
500311105  Participate in workplace communication
500311106  Work in a team  environment
UNIT CODE  COMMON COMPETENCIES
HCS323203  Apply basic first aid
UNIT CODE  CORE COMPETENCIES
HCS323301  Provide care and support to infants/toddlers
HC S323307  Maintain healthy and safe environment
HCS323309  Clean living room, dining room, bedrooms, toilet
and bathroom
A person who has achieved this Qualification is competent to be a:
  Caregiver of an infant / toddler
  Caregiver of an elderly
SECTION 2  COMPETENCY STANDARDS
UNIT OF COMPETENCY : PARTICIPATE IN WORKPLACE COMMUNICATION
"""

# Cookery NC II: code and title on separate lines, a page header in between, jobs before the core units.
COOKERY = """
SECTION 1    COOKERY NC II QUALIFICATION
The Units of Competency comprising this Qualification include the following:
     CODE NO.
BASIC COMPETENCIES
500311105
Participate in workplace communication
     CODE NO.
COMMON COMPETENCIES
TRS311202
Observe workplace hygiene procedures
A person who has achieved this Qualification is competent to be
employed in any of the following positions in the Garde Manger, Pastry or in
the Hot Kitchen Section as:
 Cook or Commis
 Assistant Cook
TR – COOKERY NC II (Amended)                                           Promulgated October 2014                2
CODE NO.
CORE COMPETENCIES
TRS512328
Clean and maintain kitchen premises
TRS512331
Prepare stocks, sauces and soups
SECTION 2    COMPETENCY STANDARDS
"""


def lines(text):
    return text.strip("\n").splitlines()


def test_list_page_rows_are_parsed_with_level_and_superseded_flag():
    html = '''<tr><td class="uppercase" style="width: 90%">
        2D Animation NC III (Superseded)</td><td>
        <a href="#" data-target="#dlModal" data-toggle="modal" id="dl" data-id ="1838" class="dlID"></a></td></tr>
        <tr><td class="uppercase" style="width: 90%">Caregiving NC II</td><td>
        <a href="#" data-target="#dlModal" data-toggle="modal" id="dl" data-id ="252" class="dlID"></a></td></tr>'''
    assert parse_list_page(html) == [
        {"title": "2D Animation NC III", "download_id": 1838, "superseded": True, "level": "NC III"},
        {"title": "Caregiving NC II", "download_id": 252, "superseded": False, "level": "NC II"},
    ]


def test_units_on_the_same_line_as_their_codes():
    assert parse_units(lines(CAREGIVING)) == [
        ("Basic", "Participate in workplace communication"),
        ("Basic", "Work in a team environment"),
        ("Common", "Apply basic first aid"),
        ("Core", "Provide care and support to infants/toddlers"),
        ("Core", "Maintain healthy and safe environment"),
        ("Core", "Clean living room, dining room, bedrooms, toilet and bathroom"),
    ]


def test_units_on_lines_after_their_codes_with_page_headers_in_between():
    assert parse_units(lines(COOKERY)) == [
        ("Basic", "Participate in workplace communication"),
        ("Common", "Observe workplace hygiene procedures"),
        ("Core", "Clean and maintain kitchen premises"),
        ("Core", "Prepare stocks, sauces and soups"),
    ]


def test_jobs_follow_the_competent_to_be_sentence():
    assert parse_jobs(lines(CAREGIVING)) == ["Caregiver of an infant / toddler", "Caregiver of an elderly"]
    assert parse_jobs(lines(COOKERY)) == ["Cook or Commis", "Assistant Cook"]


def test_sector_comes_from_the_cover_including_wrapped_lines():
    cover = ["CAREGIVING NC II", "HEALTH, SOCIAL, AND OTHER COMMUNITY", "DEVELOPMENT SERVICES SECTOR",
             "Technical Education and Skills Development Authority"]
    assert parse_sector(cover) == "Health, Social, and Other Community Development Services"
    assert parse_sector(["COOKERY NC II", "TRAINING", "REGULATIONS", "TOURISM SECTOR", "(HOTEL AND RESTAURANT)"]) \
        == "Tourism"
    assert parse_sector(["SOME TITLE NC II", "INFORMATION AND COMMUNICATION TECHNOLOGY SECTOR"]) \
        == "Information and Communication Technology"
    assert parse_sector(["NO SECTOR HERE"]) is None


def test_codes_are_readable_unique_and_at_most_40_characters():
    taken = set()
    assert make_code("Caregiving NC II", taken) == "CAREGIVING-NC-II"
    assert make_code("Shielded Metal Arc Welding (SMAW) NC II", taken) == "SMAW-NC-II"
    assert make_code("Bread and Pastry Production NC II", taken) == "BREAD-PASTRY-PRODUCTION-NC-II"
    assert make_code("Electronic Products Assembly and Servicing NC II", taken) == "EPAS-NC-II"
    assert make_code("Caregiving NC II", taken) == "CAREGIVING-NC-II-2"
    assert all(len(code) <= 40 for code in taken)


def test_search_keywords_come_from_the_name_acronym_and_job_titles():
    assert search_keywords("Caregiving NC II", ["Caregiver of an infant / toddler", "Caregiver of a child"]) \
        == ["caregiving", "caregiver"]
    assert search_keywords("Shielded Metal Arc Welding (SMAW) NC II", ["Welder", "Technician"]) \
        == ["shielded metal arc welding", "smaw", "welder"]
    assert search_keywords("Cookery NC II", ["Cook or Commis", "Assistant Cook"]) == ["cookery", "cook", "assistant cook"]


def test_entry_combines_parsed_units_jobs_and_sector():
    entry = build_entry({"title": "Caregiving NC II", "download_id": 252}, lines(CAREGIVING),
                        ["CAREGIVING NC II", "HEALTH, SOCIAL, AND OTHER COMMUNITY", "DEVELOPMENT SERVICES SECTOR"],
                        set())
    assert entry["code"] == "CAREGIVING-NC-II" and entry["name"] == "Caregiving NC II"
    assert entry["sector"] == "Health, Social, and Other Community Development Services"
    assert entry["skill_label"] == "Caregiving"
    assert entry["possible_jobs"] == ["Caregiver of an infant / toddler", "Caregiver of an elderly"]
    assert entry["competencies"][0] == {"id": 1, "name": "Participate in workplace communication", "category": "Basic"}
    assert [c["id"] for c in entry["competencies"]] == [1, 2, 3, 4, 5, 6]
    assert entry["source"]["download_id"] == 252


def test_entry_is_refused_when_no_core_units_are_found():
    assert build_entry({"title": "Mystery NC II", "download_id": 1}, ["Nothing useful here"], [], set()) is None


# Able Seafarer Deck NC II: 5-digit unit codes, a wrapped unit title, bullets alone on their own lines,
# and a revision footer right after the job list.
SEAFARER = """
CORE COMPETENCIES
MTM83417
Perform Navigation at the Support Level
MTM83419
Control the Operation of the Ship and Care for Persons on Board
at the Support Level
A person who has achieved this Qualification is competent to be:
\uf0b7
AB Deck
\uf0b7
Deck Rating
TR-Able Seafarer Deck NC II (STCW Regulation II/5)
Revised   June 26, 2013
SECTION 2 COMPETENCY STANDARDS
"""


def test_short_unit_codes_and_wrapped_titles():
    assert parse_units(lines(SEAFARER)) == [
        ("Core", "Perform Navigation at the Support Level"),
        ("Core", "Control the Operation of the Ship and Care for Persons on Board at the Support Level"),
    ]


def test_bullets_on_their_own_lines_and_footers_after_the_list():
    assert parse_jobs(lines(SEAFARER)) == ["AB Deck", "Deck Rating"]


def test_sector_spellings_are_unified():
    from tesda_track.training_regulations import canonical_sector

    assert canonical_sector("Information and Communications Technology (ict)") == \
        "Information and Communication Technology"
    assert canonical_sector("Agriculture and Fisheries") == "Agriculture, Forestry and Fishery"
    assert canonical_sector("Tourism") == "Tourism"


def test_curated_entries_keep_their_code_and_keywords_but_gain_real_units():
    from tesda_track.training_regulations import merge_curated

    scraped = [{"code": "COOKERY-NC-II", "name": "Cookery NC II", "sector": "Tourism", "skill_label": "Cookery",
                "career_keywords": ["cookery", "cook"], "possible_jobs": ["Cook or Commis"],
                "competencies": [{"id": 1, "name": "Clean and maintain kitchen premises", "category": "Core"}]},
               {"code": "CAREGIVING-NC-II", "name": "Caregiving NC II", "sector": "Health", "skill_label": "Caregiving",
                "career_keywords": ["caregiving"], "possible_jobs": ["Caregiver"],
                "competencies": [{"id": 1, "name": "Respond to emergency", "category": "Core"}]}]
    curated = [{"code": "COOKERY-NC-II", "name": "Cookery NC II", "sector": "Tourism", "skill_label": "Cooking",
                "career_keywords": ["chef", "cook", "kitchen"], "possible_jobs": ["Chef", "Cook"],
                "competencies": [{"id": 1, "name": "Sample", "category": "Core"}]},
               {"code": "SMAW-NC-II", "name": "Shielded Metal Arc Welding (SMAW) NC II", "sector": "Metals",
                "skill_label": "Welding", "career_keywords": ["welder"], "possible_jobs": ["Welder"],
                "competencies": [{"id": 1, "name": "Sample weld", "category": "Core"}]}]
    merged = {entry["code"]: entry for entry in merge_curated(scraped, curated)}
    cookery = merged["COOKERY-NC-II"]
    assert cookery["career_keywords"] == ["chef", "cook", "kitchen", "cookery"]
    assert cookery["possible_jobs"] == ["Chef", "Cook"] and cookery["skill_label"] == "Cooking"
    assert cookery["competencies"][0]["name"] == "Clean and maintain kitchen premises"
    assert merged["SMAW-NC-II"]["competencies"][0]["name"] == "Sample weld", "kept when its TR couldn't be read"
    assert list(merged)[:2] == ["COOKERY-NC-II", "SMAW-NC-II"], "curated qualifications stay first"
    assert "CAREGIVING-NC-II" in merged


def test_table_of_contents_heading_is_not_part_of_the_sector():
    assert parse_sector(["2D ANIMATION NC III", "TABLE OF CONTENTS", "ICT SECTOR"]) \
        == "Information and Communication Technology"
    assert parse_sector(["X NC II", "HUMAN HEALTH/HEALTH CARE SECTOR"]) == "Human Health/Health Care"
