# Matching model — training rounds

Each round trains a new model folder (`backend/models/tesda-e5-small-<round>`, git-ignored) and is judged on the dev
set (1,454 goals: v1 dev + `backend/training/data/goals_v2/dev/`) with its score parameters calibrated on dev at
rejection ≥ 0.9 (`training.evaluate --set dev --calibrate --min-rejection 0.9`). The sealed set is not used until the
final decision (plan Task 10). Since 2026-10-10 training runs on Google Colab (T4) because Windows Smart App Control
blocks PyTorch on the dev laptop; evaluation runs locally.

Columns: top-1 / top-3 over goals with a TVET answer, rejection over goals with none, objective = 0.4·top-1 +
0.2·top-3 + 0.4·rejection.

| Round | Model | Training | Params (floor/ceiling/weight/min) | Top-1 | Top-3 | Rejection | Objective | en / taglish / tl top-1 |
|---|---|---|---|---|---|---|---|---|
| R0 | v1 (adopted 2026-10-10) | catalog pairs, 3 epochs (RTX 3050) | 4.0/6.0/0.3/20 | 0.591 | 0.639 | 0.921 | 0.733 | 0.743 / 0.571 / 0.436 |
| R1 | v2 | + 4,772 synthetic queries, 15% typo copies; 24,631 pairs; 3 epochs, 1,098 steps, 17 min (Colab T4) | 3.0/6.0/0.4/25 | 0.719 | 0.783 | 0.901 | 0.804 | 0.846 / 0.740 / 0.551 |

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

Next: R2 adds hard negatives mined with the R1 model (sibling NC levels excluded unless the goal names a level).
