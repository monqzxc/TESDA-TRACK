"""The summary's pass/fail criteria (docs/outlook-summary-evaluation.md), and the rule-written summary against them."""
from evaluation.outlook_summary import cases, criteria
from evaluation.outlook_summary.slots import facts, fill


def test_the_rule_written_summary_passes_every_check_on_the_fixed_set():
    rows = cases.load()
    assert len(rows) == 886
    failed = {row["id"]: why for row in rows
              if (why := criteria.judge(row["outlook"]["insight"]["summary"], facts(row["outlook"]), prose=True))}
    assert failed == {}


def test_a_template_is_failed_for_what_the_checks_exist_to_catch():
    row = next(row for row in cases.load() if row["id"] == "HOUSEKEEPING-NC-II|NCR|stay")
    known = facts(row["outlook"])
    assert known["balance"] == "more_supply" and known["limited"]
    good = ("You are in {area} and prefer not to relocate. For {qualification}, {demand} are here, and {supply}. "
            "That makes {area} look saturated. The counts are small, so treat this as a rough signal. If your plans "
            "change, {alternatives} shows more demand against its supply. Center counts include example sites.")
    assert criteria.judge(good, known) == {}
    assert "2 of the 10 posting records nationwide (20%)" in fill(good, known["slots"])[0]

    def fails(template):
        return set(criteria.judge(template, known))

    assert "figures" in fails(good.replace("{demand}", "2 of the 10 posting records"))  # typed its own figures
    assert "slots" in fails(good.replace("{supply}", "many centers"))  # left the supply out
    assert "verdict" in fails(good.replace("look saturated", "look balanced"))
    assert "stance" in fails(good.replace("prefer not to relocate", "are open to relocating"))
    assert "caution" in fails(good.replace("The counts are small, so treat this as a rough signal. ", ""))
    assert "caution" in fails(good + " There are many job openings for you.")
    assert "length" in fails(good + " word" * 60)
