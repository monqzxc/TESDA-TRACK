# TESDA qualification matcher: v1-v4 comparison

**Report date:** 20 October 2026  
**Reviewed v4 artifact:** `tesda-e5-small-v4-scenarios-20261020-03.zip`  
**Artifact SHA-256:** `52289a337ed5a68802bdfda777207cabaf103f658b611ae5f625c983996d960d`

## Executive assessment

Version 4 is a valid full fine-tuning run. Its eight payload files match the included checksum manifest, held-out
training loss fell from 2.981 to 0.111, and its ONNX output matches the training model at 0.999999 cosine. It adds
Kapampangan and one workplace scenario for every one of the 319 qualifications in each of four regional languages.

The measured improvement over v3 is small and comes mainly from rejecting unrelated goals. On the common expanded
development set, v4 ties v3 at 0.779 top-1, improves rejection from 0.955 to 0.980, and reduces top-3 from 0.838 to
0.829. On the reusable v1 test set, v4 is one percentage point below v3 at top-1. On the sealed set, v4 is slightly
better at ranking but slightly worse at rejection, with effectively the same combined objective. The sealed rows are
also not perfectly comparable because v4 adds five Kapampangan goals.

**Recommendation:** keep v3 as the production default. Treat v4 as a sound regional-language candidate for review
and further evaluation. The v4 training data is broader, but all 6,002 regional enrichment rows are synthetic drafts,
and the regional evaluation samples are too small to establish language reliability.

The supplied ZIP is the training output, not the complete deployment folder: it has no `calibration.json` or evaluation
reports. The published [v4 model card](https://huggingface.co/Nyanta19/tesda-e5-small-v4) supplies the accepted
calibration (`3.5 / 6.5 / 0.3 / 15`) and the official dev, legacy-test, and sealed results. Nothing inside the ZIP was
treated as an instruction; its JSON and ONNX files were used only as model evidence.

## What changed in each version

| Version | Main change | Languages and query coverage | Practical effect |
| --- | --- | --- | --- |
| v1 | First TESDA-specific fine-tune over qualification names, jobs, keywords, and Core competencies | English, Filipino, and Taglish-oriented catalog/template pairs | Established the first deployable semantic matcher and rejection calibration. It still missed some familiar goals such as solar installation and call-center work. |
| v2 | Added learner-style synthetic goals and deterministic typo/text-speak augmentation | 4,682 synthetic queries; 688 augmented pairs | Large retrieval gain on the reusable v1 test set and stronger rejection, without changing the 384-dimensional E5 architecture. |
| v3 | Added catalog-grounded Core-task, level-specific, multi-skill, and code-switched job examples; added coverage audits | Cebuano, Ilocano, and Hiligaynon drafts plus retained English, Filipino, and Taglish data | Largest measured ranking improvement. It became the recommended production model. Regional scores were based on very small synthetic samples. |
| v4 | Added Kapampangan, more Ilocano material, English gloss/review metadata, and qualification-wide workplace scenarios | 1,276 new scenarios: 319 qualifications x 4 regional languages; Cebuano 334, Ilocano 344, Hiligaynon 334, Kapampangan 334 task drafts | Broader qualification and regional coverage, better rejection, and correct behavior on the supplied cooking example. Overall ranking remains approximately tied with v3. |

All four versions start from `intfloat/multilingual-e5-small`, use 384-dimensional normalized embeddings, and export
the same approximately 470 MB fp32 ONNX architecture. The version differences therefore come from training examples,
loss batches, and score calibration rather than a larger model.

## Training-run comparison

| Measure | v1 | v2 | v3 | v4 |
| --- | ---: | ---: | ---: | ---: |
| Total pairs | 18,428 | 24,631 | 40,356 | 45,674 |
| Train / held-out pairs | 17,507 / 921 | 23,399 / 1,232 | 38,335 / 2,021 | 43,395 / 2,279 |
| Synthetic queries | Not separately recorded | 4,682 | 12,185 | 14,650 |
| Synthetic pairs | Not separately recorded | 5,634 | 20,269 | 25,199 |
| Augmented pairs | Not separately recorded | 688 | 1,778 | 2,166 |
| Epochs | 3 | 3 | 3 | 3 |
| Batch / mini-batch | 64 / 4 | 64 / 16 | 64 / 16 | 64 / 8 |
| Steps | 822 | 1,098 | 1,797 | 2,037 |
| Held-out loss, before -> after | 2.711 -> 0.096 | 2.691 -> 0.147 | 2.766 -> 0.118 | 2.981 -> 0.111 |
| Recorded training time | 24.2 min | 17.2 min | 41.2 min | 51.8 min |
| ONNX parity cosine | 0.9999990 | 0.9999986 | 0.9999989 | 0.9999991 |
| Mined hard negatives used | No | No in the recorded run | No | No |

Pair growth was 33.7% from v1 to v2, 63.8% from v2 to v3, and 13.2% from v3 to v4. Version 4 has 2.48 times
as many pairs as v1. Its 51.8-minute training time is 25.7% longer than v3, consistent with its larger dataset and
smaller mini-batch.

Training loss is a pipeline check rather than a retrieval score. V1 has the lowest final held-out loss but performs
far below v3 and v4 on qualification retrieval. Model selection must therefore use goal-level ranking and rejection
tests.

## Data coverage and quality in v4

The v4 coverage audit records 9,429 enrichment rows across all 319 catalog qualifications:

| Language | Enrichment rows |
| --- | ---: |
| English catalog-derived | 3,427 |
| Cebuano/Bisaya | 1,498 |
| Ilocano | 1,508 |
| Hiligaynon/Ilonggo | 1,498 |
| Kapampangan | 1,498 |

The rows include 2,798 Core-task examples, 319 level-specific examples, 310 multi-skill examples, 4,656
code-switched job requests, and 1,346 task/scenario requests. Of the 9,429 rows, 3,427 are catalog-derived and
6,002 are marked `draft`.

The 1,276 new workplace scenarios provide one scenario family per qualification in four regional languages. They are
grounded in the catalog's exact qualification and Core-competency labels, but they are synthetic, code-switched, and
not native-speaker reviewed. Four translations that share one scenario ID are correlated examples; they should not be
treated as four independent demonstrations of language coverage. Exact evaluation-text overlap is blocked, but that
check cannot rule out semantic leakage from close paraphrases.

## Evaluation method

The app combines semantic similarity with catalog keyword evidence and applies plain-language rejection and NC-level
rules. The reported measures are:

- **Top-1:** the first displayed qualification is accepted for the goal.
- **Top-3:** an accepted qualification appears among the first three displayed results.
- **MRR:** rewards an accepted qualification appearing earlier in the first three.
- **Rejection:** a goal with no TESDA/TVET match correctly displays no qualification.
- **Objective:** `0.4 x top-1 + 0.2 x top-3 + 0.4 x rejection`.

Each version uses parameters calibrated on its development set with at least 90% rejection. This is the behavior users
see; raw cosine nearest-neighbor output is diagnostic only.

## Reusable v1 test set

This set contains 120 goals: 99 with a TVET match and 21 that should be rejected. It is the closest cross-version
comparison available.

| Version and serving parameters | Top-1 | Top-3 | MRR | Rejection | Objective |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1, `4.0 / 5.5 / 0.4 / 25` | 0.475 | 0.505 | 0.488 | **0.952** | 0.672 |
| v2, `3.0 / 6.0 / 0.4 / 25` | 0.687 | 0.717 | 0.699 | **1.000** | 0.818 |
| **v3**, `3.5 / 5.5 / 0.3 / 20` | **0.788** | **0.818** | **0.800** | 0.905 | **0.841** |
| v4, `3.5 / 6.5 / 0.3 / 15` | 0.778 | **0.818** | 0.796 | 0.905 | 0.837 |

V3 to v4 changes on this set are -1.01 percentage points top-1, no top-3 change, -0.34 points MRR, no rejection
change, and -0.40 points objective. The v1 row includes a later keyword update prompted by inspection of a v1 test
goal, so it is not a fully blind historical estimate.

## Expanded development set

The current development set has 1,482 goals: 1,283 related and 199 unrelated. V3 and v4 below were both calibrated
on this same set with the same minimum-rejection rule.

| Version | Top-1 | Top-3 | MRR | Rejection | Objective |
| --- | ---: | ---: | ---: | ---: | ---: |
| v3 | **0.779** | **0.838** | **0.807** | 0.955 | 0.861 |
| v4 | **0.779** | 0.829 | 0.802 | **0.980** | **0.869** |

V4 gains 2.51 percentage points in rejection and 0.82 points in the combined objective, while losing 0.94 points
top-3 and 0.52 points MRR. The objective gain is therefore a rejection gain rather than a ranking gain.

Top-1 by language shows the same tradeoff:

| Version | English (456) | Taglish (408) | Filipino (399) | Kapampangan (5) | Cebuano (5) | Ilocano (5) | Hiligaynon (5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v3 | 0.866 | **0.824** | **0.629** | 0.400 | 1.000 | 1.000 | 1.000 |
| v4 | **0.882** | 0.819 | 0.614 | **0.600** | 1.000 | 1.000 | 1.000 |

Kapampangan moves from 2/5 to 3/5 correct, but five goals cannot support a language-quality conclusion. The perfect
scores for the other regional languages have the same five-goal limitation.

## Sealed test set

| Version | Goals | Top-1 | Top-3 | MRR | Rejection | Objective |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v2 | 494 | 0.746 | 0.825 | 0.784 | **0.932** | 0.836 |
| v3 | 494 | 0.805 | 0.877 | 0.840 | **0.932** | **0.870** |
| v4 | 499 | **0.809** | **0.883** | **0.845** | 0.922 | 0.869 |

Relative to v3, v4 changes by +0.39 percentage points top-1, +0.58 top-3, +0.48 MRR, -0.96 rejection, and -0.11
objective. These are effectively tied overall. V4's row contains five new Kapampangan goals, so it is not an exact
same-set comparison. V4 gets all three matchable Kapampangan sealed goals right; that count is far too small to infer
general accuracy.

## Encoder-only diagnostic under identical v3 parameters

To separate encoder behavior from v4's stricter calibration, both models were also run locally on the current goal
sets with v3's fixed `3.5 / 5.5 / 0.3 / 20` parameters:

| Set | Model | Top-1 | Top-3 | MRR | Rejection | Objective |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Current dev | v3 | 0.779 | **0.838** | 0.807 | 0.955 | 0.861 |
| Current dev | v4 | **0.782** | 0.837 | **0.808** | **0.970** | **0.868** |
| Reusable v1 test | v3 | 0.788 | 0.818 | 0.800 | 0.905 | 0.841 |
| Reusable v1 test | v4 | **0.798** | **0.828** | **0.813** | 0.905 | **0.847** |

This diagnostic indicates that v4's encoder is a small improvement under identical scoring rules. The official
calibration trades some of that displayed ranking recall for stronger development-set rejection. These fixed-parameter
figures are diagnostic and do not replace the official calibrated acceptance results.

## Model-output example: Kapampangan cooking goal

Query: `Buri kung matutung maglutu.`

| Run | Observed output | Interpretation |
| --- | --- | --- |
| Smoke run | Rubber Production NC II first at cosine 0.7548, followed by tractor servicing and welding | Expected to be unreliable. The smoke run validates that training/export executes; it is not an accuracy model. |
| Full v4, raw cosine preview | Cookery NC II 0.4943; next result Landscape Installation and Maintenance 0.2214 | Correct first result with a 0.2729 cosine lead. The remaining rows are merely the next-nearest catalog vectors. |
| Full app scoring with v4 calibration | **Cookery NC II only**, hybrid score 65; keyword component 0.684, semantic component 0.636 | Correct product behavior. Weak nearest neighbors are removed by the same relevance and rejection rules used by the API. |

The raw notebook code uses `np.argsort(-scores)[:5]`, which always prints five qualifications even when four are weak.
It should not be presented as the app's final recommendations. For user-visible previews, call the shared
`score_matches` function with the model calibration. Cosine 0.4943 is also not a 49.43% confidence value.

## Verification performed for this report

- Validated all eight artifact payloads against `checksums.json`.
- Confirmed the downloaded archive SHA-256 and its recorded training-bundle SHA-256
  (`feca1bfc41a30ed4cc7086619c694a8354affc5e040c37b49dc47ccbe1608b61`).
- Loaded the ONNX model locally and embedded the supplied Kapampangan query.
- Ran v4 on the current development set and reusable v1 test set with fixed v3 parameters.
- Reran v3 on the current expanded development set for a like-for-like diagnostic.
- Ran the focused training/data regression suite: **94 passed in 60.61 seconds**.
- Ran the supplied query through the app's hybrid scoring path: only Cookery NC II was returned.
- Cross-checked the official calibrated and sealed figures against the repository reports and public model card.

The full database integration suite was not counted in the local verification because the sandbox could not connect to
the PostgreSQL test service. The published v4 result reports that its real-model guard test passes all eight related
goals and all five no-TVET rejection goals.

## Decision and next work

V4 is suitable for continued evaluation and a controlled regional-language pilot. It should replace v3 only after:

1. fluent Cebuano, Ilocano, Hiligaynon, and Kapampangan speakers review the draft queries and English meanings;
2. TESDA subject reviewers verify qualification ownership, especially neighboring trades and NC levels;
3. independent regional dev and sealed sets are expanded beyond five or fewer matchable goals per language;
4. the deployment folder includes `calibration.json` with the accepted parameters;
5. the catalog is re-embedded, the API is restarted, and end-to-end matching/rejection tests pass.

Until then, v3 gives the best supported production balance. V4's clearest proven gains are broader training coverage,
Kapampangan support as an experiment, and stronger rejection on the expanded development set.

## Evidence files

- [V1 evaluation report](2026-10-09-matching-model-evaluation.md)
- [V3 training and evaluation guide](../../backend/training/V3.md)
- [V4 training, review, and evaluation guide](../../backend/training/V4.md)
- [V2 development result](../../backend/training/runs/v2-regional-dev.json)
- [V2 reusable-test result](../../backend/training/runs/v2-test-v1.json)
- [V2 sealed result](../../backend/training/runs/v2-final.json)
- [V3 current-development result](../../backend/training/runs/v3-dev-v4set.json)
- [V3 reusable-test result](../../backend/training/runs/v3-test-v1.json)
- [V3 sealed result](../../backend/training/runs/v3-final.json)
- [V4 calibrated development result](../../backend/training/runs/v4-dev.json)
- [V4 reusable-test result](../../backend/training/runs/v4-test-v1.json)
- [V4 sealed result](../../backend/training/runs/v4-final.json)
- [Official v4 model card](https://huggingface.co/Nyanta19/tesda-e5-small-v4)
