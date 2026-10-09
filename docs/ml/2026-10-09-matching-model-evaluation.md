# Matching model evaluation: fine-tuned vs base model

Date: 2026-10-10. Branch `feature/postgresql-backend`. Harness: `backend/training/evaluate.py`, which scores goals with
the API's own matching code (`score_matches`).

**Decision: adopt the fine-tuned `tesda-track/tesda-e5-small-v1` with its own score parameters, 4.0 / 5.5 / 0.4 / 25
(floor / ceiling / keyword weight / minimum score), saved in its `calibration.json`.** On the held-out test split it
beats the base model on the objective (0.660 vs 0.561), rejects 20 of 21 goals with no TVET equivalent (0.952), and
improves top-1 in English, Taglish and Filipino. The base model's defaults stay 3.0 / 5.0 / 0.5 / 20; they apply
whenever the fine-tuned folder is not configured.

The decision came from a second round. The first round (below) calibrated on the objective alone and did not adopt;
its rules were inconsistent, and the second round fixed them before any new test numbers were looked at.

## Data

Only TESDA catalog text and hand-written goals; no learner, worker, T2MIS or TSP records.

- **Training pairs:** 18,428 (query, passage) pairs from `backend/seed/qualifications.json` and
  `backend/seed/sources/keywords_tl.json`: 17,507 for training, 921 (5%) held out for the loss. Queries equal to an
  evaluation goal (ignoring case) are dropped.
- **Evaluation goals** (`backend/training/data/eval_goals.json`, 243 goals). "Related" goals have accepted
  qualifications; "no TVET" goals (doctor, astronaut, diplomat, ...) should get no match.

| Split | English related | Taglish related | Filipino related | No TVET (en / taglish / tl) | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| dev | 58 | 22 | 22 | 21 (12 / 3 / 6) | 123 |
| test | 57 | 22 | 20 | 21 (12 / 4 / 5) | 120 |

Parameters are calibrated on dev only; decisions use test only.

## Training

`python -m training.finetune --output models/tesda-e5-small-v1 --mini-batch-size 4` at commit `e098f23`, on a 4 GB
laptop RTX 3050 (CUDA, fp16). From the folder's `training.json`:

| Setting | Value |
| --- | --- |
| Base model | `intfloat/multilingual-e5-small` |
| Loss | `CachedMultipleNegativesRankingLoss` (in-batch negatives) |
| Epochs / steps | 3 / 822 |
| Batch / mini-batch | 64 / 4 |
| Learning rate / seed | 2e-5 / 42 |
| Held-out loss | 2.711 before, 0.096 after |
| ONNX parity (cosine, fastembed vs sentence-transformers) | 0.999999 |
| Training time recorded | 1,450 s (24 min) |

A CUDA out-of-memory crash interrupted the run; it resumed with `--resume` from the end-of-epoch-1 checkpoint (step
274). The recorded 1,450 s matches the 548 steps after the resume at about 2.5 s per step, so the first epoch's time
is probably not included. The held-out loss is measured only before and after training, so the "loss rises after
epoch 1" check can only use the logged training loss: mean 0.133 in epoch 2 and 0.112 in epoch 3 (epoch 1's log was
lost in the crash). Nothing suggested overfitting, so the 3-epoch model was evaluated as is.

## Metrics

Objective = 0.4 × top-1 + 0.2 × top-3 + 0.4 × rejection. Top-1, top-3 and MRR are over related goals; rejection is
the share of no-TVET goals that get no match. The adoption rule, on the test split, with each model at its own
dev-calibrated parameters: adopt if and only if the fine-tuned objective is more than 0.02 above the base model's, the
fine-tuned rejection is at least 0.8, and no language's top-1 is more than 0.05 below the base model's.

## Round 1: calibrated on the objective alone (superseded)

| Model, parameters | Split | Top-1 | Top-3 | MRR | Rejection | Objective | Top-1 en | Top-1 taglish | Top-1 tl |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base, defaults 3.0 / 5.0 / 0.5 / 20 | dev | 0.480 | 0.529 | 0.505 | 0.952 | 0.679 | 0.552 | 0.409 | 0.364 |
| | test | 0.333 | 0.384 | 0.355 | 0.857 | 0.553 | 0.421 | 0.182 | 0.250 |
| Base, calibrated 3.0 / 4.5 / 0.4 / 15 | dev | 0.598 | 0.657 | 0.624 | 0.857 | 0.713 | 0.672 | 0.545 | 0.455 |
| | test | 0.434 | 0.535 | 0.483 | 0.762 | 0.586 | 0.544 | 0.318 | 0.250 |
| Fine-tuned, calibrated 3.0 / 6.0 / 0.4 / 20 | dev | 0.637 | 0.716 | 0.675 | 0.857 | 0.741 | 0.776 | 0.409 | 0.500 |
| | test | 0.586 | 0.697 | 0.638 | 0.714 | 0.659 | 0.684 | 0.545 | 0.350 |

Test counts: top-1 33, 43 and 58 of 99 related goals; rejection 18, 16 and 15 of 21 no-TVET goals.

Rule: objective 0.659 > 0.586 + 0.02 (met); rejection 0.714 ≥ 0.8 (**not met**, 15 of 21); per-language top-1 all
higher (met). Not adopted. The fallback then allowed the base defaults to change on objective alone (0.586 vs 0.553),
which moved them to parameters with test rejection 0.762.

**Why a second round.** The rules were inconsistent. The rejection bar refused the fine-tuned model at 0.714 but did
not apply to the fallback, which lowered the base model's rejection to 0.762. And calibration maximised the objective
with no rejection constraint, so both calibrated setups dropped dev rejection from 0.952 to 0.857: the objective will
trade wrong matches on no-TVET goals for right matches on related ones. The fix, decided before any new test numbers:

- Calibration takes a minimum dev rejection (`--min-rejection`, here 0.9, which is at least 19 of 21 dev no-TVET goals)
  and picks the best objective among the combinations that reach it.
- The adoption rule is unchanged and compares each model at its constrained parameters.
- The fallback may change the base defaults only if the base model's constrained parameters beat the defaults on test
  objective by more than 0.02 and also reach test rejection 0.8.

## Round 2: calibrated with dev rejection ≥ 0.9 (the decision)

| Model, parameters | Split | Top-1 | Top-3 | MRR | Rejection | Objective | Top-1 en | Top-1 taglish | Top-1 tl |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base, defaults 3.0 / 5.0 / 0.5 / 20 (reference) | dev | 0.480 | 0.529 | 0.505 | 0.952 | 0.679 | 0.552 | 0.409 | 0.364 |
| | test | 0.333 | 0.384 | 0.355 | 0.857 | 0.553 | 0.421 | 0.182 | 0.250 |
| Base, constrained 3.5 / 4.5 / 0.3 / 20 | dev | 0.500 | 0.529 | 0.515 | 0.952 | 0.687 | 0.586 | 0.409 | 0.364 |
| | test | 0.354 | 0.384 | 0.367 | 0.857 | 0.561 | 0.456 | 0.182 | 0.250 |
| Fine-tuned, constrained 4.0 / 5.5 / 0.4 / 25 | dev | 0.539 | 0.569 | 0.554 | 1.000 | 0.729 | 0.603 | 0.409 | 0.500 |
| | test | 0.455 | 0.485 | 0.468 | 0.952 | 0.660 | 0.509 | 0.455 | 0.300 |

Test counts: top-1 35 (base) and 45 (fine-tuned) of 99 related goals; rejection 18 and 20 of 21 no-TVET goals. The
fine-tuned model's one test miss is "I want to write novels" → Illustration NC II.

The rule, on the test split:

1. Fine-tuned objective > base objective + 0.02: 0.660 > 0.561 + 0.02 = 0.581. **Met.**
2. Fine-tuned rejection ≥ 0.8: 0.952 (20 of 21). **Met.**
3. No language's top-1 more than 0.05 below the base model's: English 0.509 vs 0.456, Taglish 0.455 vs 0.182,
   Filipino 0.300 vs 0.250. **Met**; every language improved.

**Adopted.** The fallback check for the base model: its constrained parameters beat the defaults on test by
0.561 − 0.553 = 0.008, not more than 0.02, so the defaults stay 3.0 / 5.0 / 0.5 / 20 (round 1's change was reverted).

The cost of the rejection constraint: the fine-tuned model's test top-1 is 0.455 at the constrained band against 0.586
at round 1's band. It still finds the right qualification first for 10 more test goals than the base model, and it
wrongly matches 1 no-TVET test goal instead of 3.

### The real-model guard test

`TESDA_MODEL_TESTS=1 pytest backend/tests/test_semantic.py -k real_model` now builds its embedder like the API, so it
runs the configured model and its `calibration.json` against the real catalog. With the adopted model, 6 of its 8
related goals and all 5 no-TVET goals pass; the expectations were not changed. The two failures:

- "I want to install solar panels on houses": no match. The fine-tuned model puts Carpentry NC III closest (z 3.85)
  and PV Systems Installation NC II second (z 3.18), so this is the model's ranking, not the band.
- "I want to work in a call center": no match. Contact Center Services NC II is closest (z 4.52), but at the 4.0–5.5
  band it scores 21, under the minimum of 25.

The base model at its defaults passes all 13.

## "I want to become Bob the Builder"

The matches a learner sees with the adopted configuration, and in brackets the qualification the model put closest,
with its z-score. None of these goals has a keyword hit.

| Goal | Base, defaults 3.0 / 5.0 / 0.5 / 20 | Fine-tuned, 4.0 / 5.5 / 0.4 / 25 (adopted) |
| --- | --- | --- |
| I want to become Bob the Builder | none (Carpentry NC III, z 2.72) | none (Carpentry NC III, z 3.06) |
| gusto kong maging builder ng bahay | none (Domestic Work NC II, z 3.61) | none (Carpentry NC II, z 3.43) |
| I want to be a builder | none (Carpentry NC II, z 2.94) | none (Electrical Installation and Maintenance NC II, z 3.13) |
| I want to be an astronaut | none (Pyrotechnics NC II, z 2.95) | none (Attractions and Theme Parks Operations NC II, z 3.11) |

Both models put carpentry nearest to "Bob the Builder", but not far enough above the rest of the catalog to count,
so the learner sees no match. In round 1, the base model's looser band (3.0 / 4.5 / 0.4 / 15) showed Domestic Work NC
II for "gusto kong maging builder ng bahay" ("bahay" means house). That no longer happens: neither the base defaults
nor the adopted model show it, and the fine-tuned model's nearest guess for that goal is Carpentry. "Builder" is not a
catalog keyword (the catalog has only "Automotive Engine Rebuilder"); adding it, with "construction worker" and
"gumagawa ng bahay", to the carpentry and masonry keywords would let these goals match through the rules.

## Latency

One query embedding on CPU (Intel Core i5-11300H, 4 cores; fastembed 0.8.1, onnxruntime 1.30.0, CPU provider), the
median of 50 runs after 5 warm-up runs:

| Model | Median | 90th percentile |
| --- | ---: | ---: |
| `intfloat/multilingual-e5-small` | 5.4 ms | 6.0 ms |
| `tesda-track/tesda-e5-small-v1` | 5.5 ms | 6.2 ms |

The fine-tuned model has the same architecture and size (470 MB ONNX), so it costs the same.

## Serving the adopted model

- `backend/models/tesda-e5-small-v1/calibration.json`: `{"z_floor": 4.0, "z_ceiling": 5.5, "keyword_weight": 0.4,
  "min_score": 25}`. The folder is git-ignored; copy it to each server.
- `.env`: `EMBEDDING_MODEL=tesda-track/tesda-e5-small-v1` and `EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v1`
  (in Docker, `/app/finetuned/tesda-e5-small-v1`; see `backend/models/README.md`).
- Then `cd backend && PYTHONPATH=. ../.venv/Scripts/python -m tesda_track.embeddings sync` (on the dev database: 0
  created, 492 updated) and restart the API.

Without those two settings the API runs the base model at the defaults. A configured folder that is missing or broken
leaves the API on keyword matching only, with one logged error.

## Reproduce and retrain

From `backend/`, with the main environment. With the fine-tuned model configured in `.env`, plain `training.evaluate`
runs it with its `calibration.json`; name the base model to evaluate that instead:

```bash
../.venv/Scripts/python -m training.evaluate --split all                                      # the configured model
../.venv/Scripts/python -m training.evaluate --model intfloat/multilingual-e5-small --split all # base, defaults
../.venv/Scripts/python -m training.evaluate --model intfloat/multilingual-e5-small --calibrate --min-rejection 0.9
../.venv/Scripts/python -m training.evaluate --model-path models/tesda-e5-small-v1 --calibrate --min-rejection 0.9
```

Round 1's numbers come from the same commands without `--min-rejection`.

Retrain with the training environment (see `backend/training/README.md`):

```bash
../.venv-train/Scripts/python -m training.finetune --output models/<name>   # add --mini-batch-size 4 on a 4 GB GPU
```

To adopt a later model, calibrate it with `--min-rejection 0.9`, apply the rule above against the base model at its
own constrained parameters, write the chosen parameters to `models/<name>/calibration.json`, point `EMBEDDING_MODEL`
and `EMBEDDING_MODEL_PATH` at it, run `embeddings sync`, and restart the API. A next attempt should look at the two
guard-test failures (solar panels on houses, call center) and add goals like them to the dev split.
