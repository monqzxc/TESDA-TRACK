# Matching model evaluation: fine-tuned vs base model

Date: 2026-10-10. Branch `feature/postgresql-backend`. Harness: `backend/training/evaluate.py`, which scores goals with
the API's own matching code (`score_matches`).

**Decision: keep `intfloat/multilingual-e5-small`; do not adopt the fine-tuned `tesda-track/tesda-e5-small-v1`.** The
fine-tuned model ranks related goals much better on the held-out test split, but it rejects only 15 of the 21 test
goals that have no TVET equivalent (0.714, below the 0.8 bar). The base model's score parameters were recalibrated
instead: the defaults are now `SEMANTIC_Z_FLOOR=3.0`, `SEMANTIC_Z_CEILING=4.5`, `MATCH_WEIGHT_KEYWORD=0.4`,
`MATCH_MIN_SCORE=15` (were 3.0 / 5.0 / 0.5 / 20).

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

Parameters are calibrated on dev only; the decision uses test only.

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

## Results

Objective = 0.4 × top-1 + 0.2 × top-3 + 0.4 × rejection. Top-1, top-3 and MRR are over related goals; rejection is
the share of no-TVET goals that get no match. Parameters are floor / ceiling / keyword weight / minimum score.

| Model, parameters | Split | Top-1 | Top-3 | MRR | Rejection | Objective | Top-1 en | Top-1 taglish | Top-1 tl |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base, previous defaults 3.0 / 5.0 / 0.5 / 20 | dev | 0.480 | 0.529 | 0.505 | 0.952 | 0.679 | 0.552 | 0.409 | 0.364 |
| | test | 0.333 | 0.384 | 0.355 | 0.857 | 0.553 | 0.421 | 0.182 | 0.250 |
| Base, calibrated on dev 3.0 / 4.5 / 0.4 / 15 | dev | 0.598 | 0.657 | 0.624 | 0.857 | 0.713 | 0.672 | 0.545 | 0.455 |
| | test | 0.434 | 0.535 | 0.483 | 0.762 | 0.586 | 0.544 | 0.318 | 0.250 |
| Fine-tuned, calibrated on dev 3.0 / 6.0 / 0.4 / 20 | dev | 0.637 | 0.716 | 0.675 | 0.857 | 0.741 | 0.776 | 0.409 | 0.500 |
| | test | 0.586 | 0.697 | 0.638 | 0.714 | 0.659 | 0.684 | 0.545 | 0.350 |

Counts behind the test rates: top-1 33, 43 and 58 of 99 related goals; rejection 18, 16 and 15 of 21 no-TVET goals.

## Decision

The rule, on the test split, each model at its own dev-calibrated parameters:

1. Fine-tuned objective > base objective + 0.02: 0.659 > 0.586 + 0.02 = 0.606. **Met.**
2. Fine-tuned rejection ≥ 0.8: 0.714 (15 of 21). **Not met**; it needed 17 of 21.
3. No language's top-1 more than 0.05 below the base model's: English 0.684 vs 0.544, Taglish 0.545 vs 0.318,
   Filipino 0.350 vs 0.250. **Met**; every language improved.

Condition 2 fails, so the fine-tuned model is not adopted. The goals it wrongly matched sit next to a trade in
meaning (a doctor's clinic → Dental Hygiene, writing novels → Illustration, defending clients in court → Security
Services). The model ranks related goals better, but at the band chosen on dev it also lets more no-TVET goals
through. Its dev numbers did not warn of this (dev rejection 0.857, the same as the calibrated base model), and the
band was not retuned on test.

The "otherwise" branch: the base model's calibrated parameters beat its previous ones on test by 0.586 − 0.553 =
0.033 > 0.02, so they became the defaults in `backend/tesda_track/config.py`. Trade-off: test top-1 rises from 0.333 to
0.434 and top-3 from 0.384 to 0.535, while rejection falls from 0.857 to 0.762 (18 to 16 of 21 no-TVET goals). The
real-model guard test (`TESDA_MODEL_TESTS=1`, 8 related goals and 5 no-TVET goals on the real catalog) still passes
with the new defaults.

## "I want to become Bob the Builder"

The matches a learner would see (up to three, score ≥ the minimum), and in brackets the qualification the model put
closest, with its z-score. No goal below has a keyword hit.

| Goal | Base, previous defaults | Base, calibrated (now the default) | Fine-tuned, calibrated |
| --- | --- | --- | --- |
| I want to become Bob the Builder | none (Carpentry NC III, z 2.72) | none (Carpentry NC III, z 2.72) | none (Carpentry NC III, z 3.06) |
| gusto kong maging builder ng bahay | none (Domestic Work NC II, z 3.61) | Domestic Work NC II, score 24 | none (Carpentry NC II, z 3.43) |
| I want to be a builder | none (Carpentry NC II, z 2.94) | none (Carpentry NC II, z 2.94) | none (Electrical Installation and Maintenance NC II, z 3.13) |
| I want to be an astronaut | none (Pyrotechnics NC II, z 2.95) | none (Pyrotechnics NC II, z 2.95) | none (Attractions and Theme Parks Operations NC II, z 3.11) |

Both models put carpentry nearest to "Bob the Builder", but not far enough above the rest of the catalog to count,
so the learner sees no match. "builder ng bahay" shows the cost of the looser band: the base model's nearest guess,
Domestic Work ("bahay" means house), is now shown; the fine-tuned model's nearest guess, Carpentry, is right but too
weak to show. "Builder" is not a catalog keyword (the catalog has only "Automotive Engine Rebuilder"); adding it,
with "construction worker" and "gumagawa ng bahay", to the carpentry and masonry keywords would let these goals match
through the rules.

## Latency

One query embedding on CPU (Intel Core i5-11300H, 4 cores; fastembed 0.8.1, onnxruntime 1.30.0, CPU provider), the
median of 50 runs after 5 warm-up runs:

| Model | Median | 90th percentile |
| --- | ---: | ---: |
| `intfloat/multilingual-e5-small` | 5.4 ms | 6.0 ms |
| `tesda-track/tesda-e5-small-v1` | 5.5 ms | 6.2 ms |

The fine-tuned model has the same architecture and size (470 MB ONNX), so it costs the same.

## Reproduce and retrain

From `backend/`, with the main environment:

```bash
../.venv/Scripts/python -m training.evaluate --split all --params 3.0 5.0 0.5 20      # previous defaults
../.venv/Scripts/python -m training.evaluate --calibrate                              # base model, calibrated on dev
../.venv/Scripts/python -m training.evaluate --model-path models/tesda-e5-small-v1 --calibrate
```

Retrain with the training environment (see `backend/training/README.md`):

```bash
../.venv-train/Scripts/python -m training.finetune --output models/<name>   # add --mini-batch-size 4 on a 4 GB GPU
```

To adopt a later model that passes the rule: write its dev-calibrated parameters to `models/<name>/calibration.json`
(`{"z_floor": ..., "z_ceiling": ..., "keyword_weight": ..., "min_score": ...}`), set
`EMBEDDING_MODEL=tesda-track/<name>` and `EMBEDDING_MODEL_PATH=backend/models/<name>` in `.env`, run
`PYTHONPATH=. ../.venv/Scripts/python -m tesda_track.embeddings sync`, and restart the API. A next attempt should
add no-TVET goals near a trade to the dev split, or such goals as hard negatives in training, so that calibration
sees the failure the test split showed.
