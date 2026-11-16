# Should a self-hosted model write the Career Map's summary?

**Decision (13 November 2026): no. Keep the rule-written summary.** Neither model tested comes close to it, and the
test showed that what a model would add here is small: the summary has about 86 distinct shapes, which is few
enough to write and review by hand.

The question, the test set, the criteria and every model answer are in `backend/evaluation/outlook_summary/` and
`backend/evaluation/data/outlook_summary/`. This page says what was done, what was found, and what was not measured.

## What was compared

| Writer | What it is | Licence |
| --- | --- | --- |
| Rules | The summary `/labor-market/outlook` already returns (`write_summary`) | ours |
| Qwen2.5-1.5B-Instruct, Q4_K_M | 1.5 billion parameters, 1.1 GB file | Apache-2.0 |
| Phi-3.5-mini-instruct, Q4_K_M | 3.8 billion parameters, 2.4 GB file | MIT |

Both models ran on llama.cpp (llama-cpp-python 0.3.36), CPU only, two threads as a t3.large has, temperature 0,
seed 20261113.

**Test set.** 886 cases, fixed in `cases.jsonl.gz`: the outlook endpoint's own answer for every qualification with
any record, for the national view and each region with a record of it, staying and open to relocating. 290 come
from the development database as it is (20 qualifications with postings; its only centers are seed examples,
counted with the demo flag). Because that database has almost no region where demand and supply can be compared,
596 more repeat the qualifications that have postings with stand-in centers in a fixed, uneven spread (ids starting
`~`), so that demand ahead, balanced and saturated are all covered. The stand-ins were never saved.

**Criteria**, written before either model was run (`criteria.py`). A summary passes only if it passes all seven:
no figure outside the counts; the demand and the supply both stated; the verdict the computed balance gives, and
no other; the relocation choice stated the right way round; small counts called a rough signal and nothing
promised; 90 words or fewer; Flesch-Kincaid grade 12 or lower.

**Placeholders.** A model is never asked to write a figure. It is told the situation in words and answers with a
template over named slots (`{area}`, `{demand}`, `{supply}`, ...); the code fills them. Cases that differ only in
names and figures are the same situation and get the same template, so each model wrote 86 templates, and all 886
cases were judged with the template for their situation filled in.

## Results

| | Rules | Qwen 1.5B | Phi-3.5-mini 3.8B |
| --- | --- | --- | --- |
| Cases passing all checks (of 886) | **886 (100%)** | 106 (12.0%) | 303 (34.2%) |
| Situations passing (of 86) | 86 | 18 | 20 |
| First prompt, before revision | n/a | 48 (5.4%) | 51 (5.8%) |
| Seconds per summary | none | 6.3 | 18.9 |
| Tokens per second (prompt and answer) | n/a | 93.6 | 35.6 |
| CPU-seconds per summary | none | 12.4 | 37.5 |
| CPU credits per summary, if a t3.large core is as fast | 0 | 0.21 | 0.62 |
| Peak memory | none | 2.1 GB | 5.4 GB |

The prompt was revised once. The first showed each slot's text for the case, and both models copied the figures
out of it instead of writing the slot (696 of Phi's 886 cases failed on a typed figure). The second never shows a
figure. That revision was made after reading the first run's failures and before anything else; no further tuning
was done.

### How they fail

By check, cases failing (a case can fail several):

| Check | Qwen 1.5B | Phi-3.5-mini |
| --- | --- | --- |
| Left out the demand, the supply or both | 740 | 546 |
| Wrong or missing verdict | 165 | 57 |
| Small counts not called a rough signal, or a promise | 105 | 10 |
| Relocation wrong, or other regions named when they shouldn't be | 27 | 23 |
| Too long | 6 | 3 |
| Reading grade over 12 | 0 | 4 |

The commonest failure is the one that matters most: the summary reads fluently and leaves the numbers out.

> You are in Region IV-A (CALABARZON) and prefer not to relocate for Automotive Servicing (Electrical Repair) NC
> II. Employers posted for it here, but no center offers it in Region IV-A (CALABARZON). The demand is a rough
> signal, suggesting you might consider training or getting assessed in another region. — Phi, fails: no counts

> You are in National Capital Region, your own region, and prefer not to relocate. [...] The counts are small, so
> they are a rough signal. Consider Region IV-A (CALABARZON). — Qwen, fails: no counts, and names another region to
> a learner whose area didn't call for it

### Passing the checks is not the same as being right

Reading all 20 of Phi's passing templates, about 3 are free of a broken sentence or a wrong statement. The checks
can't see these, which is what the staff ratings are for:

> For Housekeeping NC II, 10 posting records across 5 regions are nationwide, indicating a higher need. However, 20
> recorded centers across 5 regions is also nationwide, but with fewer centers, suggesting a crowded market. — passes
> every check; says twenty centers are "fewer" and draws two conclusions the counts don't support

> For Automotive Servicing (Chassis Repair) NC II, there are no no posting records in any region nationwide, but 2
> recorded centers across 1 region several of the centers nationwide [...] This shows a balanced national
> perspective — passes; garbled around both slots, and "balanced" is not what the counts say

> In National Capital Region, Cordillera Administrative Region and Region IV-A (CALABARZON) regions, demand is
> higher than supply, suggesting limited opportunities. — passes; the conclusion is backwards

One that is sound, for comparison:

> You are in Region VII (Central Visayas) and prefer not to relocate for Automotive Servicing (Electrical Repair) NC
> II. Here, demand is roughly signaled by 1 of the 6 posting records nationwide (17%), and supply by 3 of its 22
> recorded centers (14%). The balance between demand and supply in your region is balanced [...]

Every answer of every run, with the checks it failed, is in `results/*.json` under `by_situation`.

### Filipino

Feasible for neither. Asked for everyday Filipino with the same slots:

- **Qwen 1.5B** answered in English for all 86 situations.
- **Phi-3.5-mini** answered all 86 in something that looks like Filipino, and 197 cases (22%) pass the three
  checks that don't read English (figures, slots, length). Read by eye, it is not usable: invented words and
  sentences that don't mean anything, with the English slot text dropped in mid-sentence. For example: "naunang
  ito ay isang leeg signal" for "a rough signal", and "kulang sa lokasyon nang hindi naiintindihan". It also took
  32 seconds a summary. This reading is the author's, not a native speaker's; a Filipino speaker should confirm it
  from `results/phi-3.5-mini-instruct-q4_k_m-fil-prompt2.json`.

The rules have no Filipino version either. The app's other fixed text is translated through the locale
dictionaries, and the rule-written summary is a small number of sentence patterns, so a human-translated Filipino
summary is the dependable route.

## Go or no-go

The bar was: beat the rules on the staff ratings, with a 100% pass rate after fallback.

- **Pass rate after fallback** is 100% only in the sense that a failing summary gives way to the rule-written one.
  With Phi that happens for 66% of cases, and the 34% that get through include summaries that are wrong in ways
  the checks miss. A fallback that fires two times in three is the rules with extra risk.
- **Staff ratings** have not been collected; the sheet is ready (below). On this evidence there is no reason to
  expect the models to win, and good reason to expect "anything wrong or misleading?" to be answered yes.

So: **no-go**. No batch command was built and the product is unchanged. The optional Anthropic rewrite stays as it
was: off by default, and never called unless a deployment sets its key. It was to be removed only if a self-hosted
writer took its place; removing it is a separate, small change if wanted.

### What would have to change

1. **A larger model.** Both failures (dropping required content, drawing unsupported conclusions) are what small
   models do. A 7 to 8 billion parameter model may hold the slots; it needs about 6 to 8 GB and will not fit a
   t3.large beside PostgreSQL and the API.
2. **Or, a different job for the model.** With placeholders the whole task is 86 templates. A capable model, run
   once on any machine, could draft alternative wordings for a person to edit and approve; the approved templates
   would ship as rules. That gets the better wording without a model in production, an API, or a fallback.
3. **Constrained output.** A grammar that forces each required slot to appear would remove the largest failure. It
   would not stop wrong conclusions.

## What was not measured, and what to run on the sandbox

- **Speed, memory and CPU credits are from this build machine, not a t3.large.** It is a 4-core Intel Xeon at
  2.1 GHz with both models running at once, two threads each. The credits column assumes a t3.large core does the
  same work in the same time, which is unverified. For scale: a t3.large earns 36 credits an hour and holds at
  most 864. At 0.62 credits each, Phi's 86 templates would cost about 53 credits; writing all 886 cases one by one
  would cost about 550, most of a full balance.
- **Nothing ran on the sandbox.** To measure it there: install `llama-cpp-python`, download the two GGUF files,
  and run `python -m evaluation.outlook_summary.run model --gguf <file> --name <name> --threads 2` from `backend/`
  while watching `CPUCreditBalance` in CloudWatch and the API's response time.
- **Staff ratings and the learner check need people.** `rating-sheet.csv` has 30 cases where Phi passed, rule-written
  and model-written side by side in a fixed random order, with three 1-to-5 ratings each, a preference, and a
  free-text "anything wrong or misleading". `rating-sheet-key.csv` says which side is which: keep it from the
  raters. `comprehension-check.md` has the three learner questions and how to score them. The learner check is
  worth running on the rule-written summary whatever happens with models: it is the only test of whether learners
  understand "saturated" and "posting records".
- **Readability is a formula**, not a reading by a senior high graduate.
- **The stand-in centers are not real supply.** They test wording across verdicts; they say nothing about any region.

## The larger limit: most postings aren't linked to any qualification

The summary can only speak about postings that have a reviewed link to a qualification. In the 4 November 2026
PhilJobNet snapshot (development database, after the recorded review release):

| | Postings | Distinct job titles |
| --- | --- | --- |
| In the snapshot | 3,884 | 721 |
| Linked to a qualification | 316 (8.1%) | 22 |
| Never proposed for review | 3,568 (91.9%) | 699 |

(342 approved links cover those 316 postings, since a posting can link to more than one qualification.)

Two things follow.

- **The analysis rests on very little.** 20 of 319 qualifications have any posting at all, and one of them
  (Customer Services NC II, 211) has most of the linked postings. For the rest a region's "demand" is usually one
  to nine records, which is why nearly every summary carries "rough signal", and why balance verdicts barely occur
  in real data.
- **The gap is not a review backlog.** No unlinked posting has a pending or rejected proposal. The titles were
  never matched to a candidate qualification, so reviewers were never asked.

The unlinked postings are concentrated: the 50 commonest unlinked titles hold 1,643 postings, the top 100 hold
2,171, the top 200 hold 2,739. 294 titles appear once. Many of the commonest have an obvious TESDA qualification:
delivery driver (89), company driver (54), truck driver (30), electrician (39), airconditioning technician (30),
automotive mechanic (30), forklift operator (23), kitchen crew (23), barista (18), carpenter (16). Others have
none and should stay unlinked: business development officer (47), civil engineer (17), medical representative (17).

To raise it:

1. **Propose candidates for the top 100 to 200 unlinked titles**, with the catalog matcher and the embedding model
   the app already has, and put them through the existing review screen (`/admin?section=labor-market`). A reviewer
   deciding 100 titles would settle up to 2,171 postings. Titles with no TESDA qualification get rejected once and
   stay out.
2. **Review by title, not by posting.** One decision on "delivery driver" should cover all 89.
3. **This is where further training of the embedding model would pay**: job-title to qualification matching is what
   it does, and better candidates mean less reviewer time.

A realistic ceiling is well under 100%: sales, clerical and professional titles make up a large share and have no
TESDA qualification. Linking the trade and service titles alone would multiply the linked postings several times,
which would do more for the summary than any change to its wording.
