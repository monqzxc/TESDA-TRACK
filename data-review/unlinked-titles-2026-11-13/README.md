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

They were produced on a machine **without the embedding model**, so only the keyword matcher ran. It shows:

- Titles holding 719 postings got a strong first suggestion. Several are right (electrician, forklift operator,
  kitchen crew, airconditioning technician).
- Some are wrong: "MOTORCYCLE DRIVER/RIDER" is matched to Motorcycle/Small Engine Servicing, which is repair, not
  driving. A suggestion is a starting point, never a decision.
- Many obvious ones got nothing: delivery driver, company driver, truck driver, automotive mechanic, customer
  service assistant, call center agent.

Run it again where the production model is loaded for better suggestions:

```
python scripts/suggest_unlinked_titles.py --out data-review/unlinked-titles-YYYY-MM-DD --top 200
```

It needs the configured database and a running API (`API_BASE_URL`, default `http://127.0.0.1:8000`).

The titles the keyword matcher misses are also what a learner typing them into the Career Map would get without
the model: nothing. They are good candidates for the matcher's keyword lists and for the model's next training round.
