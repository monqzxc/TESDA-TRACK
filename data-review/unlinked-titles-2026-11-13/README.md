# Unlinked job titles: suggestions for review

316 of the 3,884 postings in the 4 November 2026 PhilJobNet snapshot are linked to a qualification. The other
3,568 (699 job titles) were never proposed for review, so the Career Map's demand counts leave them out
(docs/outlook-summary-evaluation.md).

`title-suggestions.csv` lists the 200 commonest unlinked titles, which hold 2,739 of those postings, each with up
to three qualifications the app's own matcher suggests. It is a sheet for a reviewer. Nothing was imported and no
mapping was approved.

## How to use it

For each title, fill in `decision`: **link** (and the code in `qualification_code_to_link`, which may be one of
the suggestions or another), **no TESDA qualification** (sales, clerical and professional titles mostly), or
**unsure**. Decide by title: one decision on "DELIVERY DRIVER" settles all 89 of its postings. Turning the
decisions into mappings is a new versioned labor-market bundle and the usual audited review
(docs/us20-setup.md); this sheet does not do that.

## Read the suggestions with care

They come from the app's matcher with the production embedding model, `tesda-e5-small-v6-colab`, calibrated on the
dev goals (z_floor 2.0, z_ceiling 5.0, keyword weight 0.3, minimum score 20).

- Titles holding 1,049 postings have a strong first suggestion (score 60 or more), and most of the commonest are
  right: call center agent to Contact Center Services NC II, electrician to Electrical Installation and
  Maintenance NC II, truck driver to Driving (Articulated Vehicle) NC III, forklift operator, barista, kitchen crew.
- A high score is not a decision. "MOTORCYCLE DRIVER/RIDER" scores 76 for Motorcycle/Small Engine Servicing, which
  is repair, not driving. "STORE SUPERVISOR" is offered Warehousing Services NC IV.
- Low scores are mostly titles with no TESDA qualification, offered the nearest thing anyway: business development
  officer, sales executive, production worker. Expect to mark many of these **no TESDA qualification**.
- 10 titles (107 postings) got no suggestion at all, correctly for most: civil engineer, data analyst, language
  teacher.

An earlier run without the model, on the keyword matcher alone, found a strong suggestion for 719 postings and
nothing for delivery driver, company driver, truck driver, automotive mechanic or call center agent. That is what a
learner typing those titles gets wherever the model is off.

To regenerate:

```
python scripts/suggest_unlinked_titles.py --out data-review/unlinked-titles-YYYY-MM-DD --top 200
```

It needs the configured database and a running API (`API_BASE_URL`, default `http://127.0.0.1:8000`) serving the
model.
