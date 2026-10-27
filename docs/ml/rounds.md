# Matching model — training rounds

Each round trains a new model folder (`backend/models/tesda-e5-small-<round>`, git-ignored) and is judged on the dev
set (v1 dev + `backend/training/data/goals_v2/dev/`; 1,482 goals as of v4) with its score parameters calibrated on dev at
rejection ≥ 0.9 (`training.evaluate --set dev --calibrate --min-rejection 0.9`). The sealed set is not used until the
final decision (plan Task 10). Since 2026-10-10 training runs on Google Colab (T4) because Windows Smart App Control
blocks PyTorch on the dev laptop; evaluation runs locally.

Columns: top-1 / top-3 over goals with a TVET answer, rejection over goals with none, objective = 0.4·top-1 +
0.2·top-3 + 0.4·rejection.

| Round | Model | Training | Params (floor/ceiling/weight/min) | Top-1 | Top-3 | Rejection | Objective | en / taglish / tl top-1 |
|---|---|---|---|---|---|---|---|---|
| R0 | v1 (adopted 2026-10-10) | catalog pairs, 3 epochs (RTX 3050) | 4.0/6.0/0.3/20 | 0.591 | 0.639 | 0.921 | 0.733 | 0.743 / 0.571 / 0.436 |
| R1 | v2 | + 4,772 synthetic queries, 15% typo copies; 24,631 pairs; 3 epochs, 1,098 steps, 17 min (Colab T4) | 3.0/6.0/0.4/25 | 0.719 | 0.783 | 0.901 | 0.804 | 0.846 / 0.740 / 0.551 |
| R2 | v3 (adopted 2026-10-21) | 40,356 pairs; 3 epochs, 1,797 steps, 41.2 min (Colab T4); catalog-grounded Core tasks, NC-level and regional drafts | 3.5/5.5/0.3/20 | 0.779 | 0.838 | 0.955 | 0.861 | 0.866 / 0.824 / 0.629 |
| R3 | v4 (evaluation candidate) | 45,674 pairs; 3 epochs, 2,037 steps, 51.8 min (Colab T4); Kapampangan + 1,276 workplace scenarios, all regional enrichment unreviewed | 3.5/6.5/0.3/15 | 0.779 | 0.829 | 0.980 | 0.869 | 0.882 / 0.819 / 0.614 |

R2/R3 use the same expanded 1,482-goal dev set; their evidence is `backend/training/runs/v3-dev-v4set.json`
and `v4-dev.json`. R0/R1 used earlier sets and are historical, rather than direct same-set comparisons.

## Pilot decision, 21 October 2026

**TASK-085: adopt v3.** Its reusable 120-goal test results are top-1 0.788, top-3 0.818, MRR 0.800,
rejection 0.905, objective 0.841. V4 ties dev top-1 and improves rejection but loses top-3; the sealed
objectives are effectively tied (v3 0.870; v4 0.869 on a set with five additional Kapampangan goals).
Regional drafts have not been reviewed and five-goal language samples cannot establish reliability.
See the [full comparison](2026-10-20-matching-model-v1-v4-comparison.md). These are existing evaluation
results, not a fresh expert review or a new sealed run.

The serving configuration is `EMBEDDING_MODEL=tesda-track/tesda-e5-small-v3`, local path
`backend/models/tesda-e5-small-v3`, Docker path `/app/finetuned/tesda-e5-small-v3`, and accepted
`calibration.json` values `3.5 / 5.5 / 0.3 / 20`. Re-embed the catalog and restart the API when changing
models; stored vectors are model-specific. `.env.example`, README, the model guide and Compose agree.

The regression gate is frozen in `backend/training/model_acceptance.json`: on `test_v1`, top-1 ≥ 0.78,
top-3 ≥ 0.81, MRR ≥ 0.79, rejection ≥ 0.90 and objective ≥ 0.84. It also requires eight named goal-to-qualification
ownership cases and five explicit no-TVET rejections. `TESDA_MODEL_TESTS=1` runs
`backend/tests/test_model_acceptance.py`, using the app's scoring and the configured model's calibration.
Tests neither recalibrate these thresholds nor inspect sealed results. The familiar ownership examples live
in the development set; the separate reusable-test thresholds keep them from being the entire acceptance test.
Future candidates must meet this recorded policy before adoption; any policy change needs an explicit decision.

## R1 by scenario (dev)

| Tag | n | R0 top-1 / top-3 | R1 top-1 / top-3 |
|---|---|---|---|
| job_title | 455 | 0.730 / 0.782 | 0.811 / 0.875 |
| task | 476 | 0.483 / 0.519 | 0.660 / 0.716 |
| short | 179 | 0.709 / 0.777 | 0.793 / 0.849 |
| typo | 134 | 0.579 / 0.619 | 0.675 / 0.762 |
| certification | 129 | 0.488 / 0.550 | 0.682 / 0.767 |
| experience | 123 | 0.480 / 0.528 | 0.659 / 0.756 |
| abroad | 76 | 0.763 / 0.803 | 0.842 / 0.921 |
| near_tvet | 50 | 0.380 / 0.420 | 0.460 / 0.460 |
| indirect | 41 | 0.512 / 0.512 | 0.561 / 0.634 |
| long | 35 | 0.457 / 0.486 | 0.657 / 0.771 |
| multi | 32 | 0.875 / 0.938 | 0.938 / 0.969 |
| negation | 30 | 0.533 / 0.767 | 0.667 / 0.800 |

Rejection by tag: no_tvet 0.967 → 0.951, vague 0.941 → 0.902, non_goal 0.845 → 0.862.

Historical R1 next-step proposal: mine sibling-aware hard negatives. The recorded v3/v4 runs did not use mined
hard negatives; do not infer otherwise from the earlier proposal.
