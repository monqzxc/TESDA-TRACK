# Matching model: evaluation and fine-tuning

**Version 4 (Kapampangan + Ilocano):** use [the v4 Colab notebook](colab/train_colab_v4.ipynb)
and [step-by-step guide](V4.md). Keeps English, Filipino/Taglish, Cebuano and Hiligaynon;
adds Kapampangan starter data, more Ilocano tasks, English meanings and a native-speaker
review template. These are unreviewed drafts, not a measured language capability.
Build the upload with `python -m training.bundle --output training/runs/colab-bundle-v4.zip`.

**Version 3:** [Colab notebook](colab/train_colab_v3.ipynb) and [complete v3 guide](V3.md) add
Cebuano/Bisaya, Ilocano and Hiligaynon/Ilonggo examples, deeper Core-competency requests,
coverage audits and per-language evaluation. Build `training/runs/colab-bundle-v3.zip` with
`python -m training.bundle --output training/runs/colab-bundle-v3.zip`. V3 is a training recipe;
trained weights and accuracy claims require a completed Colab run and local evaluation.

Offline tools for the embedding model that matches learner goals to qualifications. Nothing here runs in the
API: the API image copies only `tesda_track`, `migrations` and `seed`, and installs only
`backend/requirements.txt`. The API runs `intfloat/multilingual-e5-small`, or a fine-tuned copy from
`backend/models/` (see `docs/ml/2026-10-09-matching-model-evaluation.md`), on CPU through fastembed.

| File | What it does |
| --- | --- |
| `catalog.py` | Loads `seed/qualifications.json` as in-memory qualifications, so nothing needs a database |
| `data/eval_goals.json` | Hand-written learner goals (English, Filipino, Taglish, and goals with no TVET match), each in the `dev` or `test` split |
| `goals.py` | Loads and validates the goal sets: `dev` (v1 dev + `data/goals_v2/dev/*.json`), `test_v1` (v1 test), `sealed` (`data/goals_v2/sealed/*.json`) |
| `evaluate.py` | Scores the goals with the API's own matching code and reports top-1, top-3, MRR and rejection rate, overall, per language and per scenario tag |
| `pairs.py` | Builds (query, passage) training pairs from the catalog, `data/synthetic/*.json` and typo augmentation |
| `mine.py` | Mines hard negatives (main env, CPU): the closest wrong qualifications for every training query |
| `data/synthetic/G1..G6.json` | Goal-style queries per qualification (`{"exact name": ["query", ...]}`), written from the catalog by agents |
| `finetune.py` | Fine-tunes the model on those pairs, exports ONNX and checks that fastembed reproduces it |
| `feedback.py` | Exports learners' "Are you satisfied?" answers, with the numbers behind each recommendation, for `colab/feedback_colab.ipynb` (see [Learner feedback](#learner-feedback)) |
| `shared_goals.py` | Collects the goals learners chose to share into a git-ignored review file; reviewed ones join the evaluation sets or the training queries (see [Goals learners shared](#goals-learners-shared)) |

**Data.** Training and evaluation use only TESDA catalog text (`seed/qualifications.json`, whose Filipino
keywords come from `seed/sources/keywords_tl.json`), the hand-written goals and, once reviewed, the goals learners
ticked a box to share ([Goals learners shared](#goals-learners-shared)). Never learner accounts or records, worker,
T2MIS or TSP records. The training queries are each qualification's name, skill, jobs, keywords and Core competencies
(Basic and Common units such as "Participate in workplace communication" are shared by many qualifications, so
they are left out), plus short English and Filipino phrasings ("I want to work as a Chef", "gusto kong maging
Chef"). Each query appears as written in the catalog and in lower case, because the tokenizer is cased and the API
embeds goals as learners type them. Any query that equals an evaluation goal (ignoring case) is dropped, so the
evaluation stays held out. The catalog alone gives 18,309 pairs. `data/synthetic/*.json` adds goal-style queries
(as written and lower-cased; an unknown qualification name raises), and 15% of them (chosen by a hash of the query)
also get one deterministic typo or text-speak copy (`pairs.augment`), giving 24,640 pairs. Exclusions cover the v1 goals
and the v2 dev and sealed goals (normalised); sealed text is reduced to keys and never printed.

### Hard negatives

```bash
../.venv/Scripts/python -m training.mine --model-path models/tesda-e5-small-v1 --output training/runs/hard-negatives.json --k 3
```

For every training query, the top-k qualifications by similarity that are not among the query's own (a query that
belongs to several qualifications excludes all of them). `--limit N` mines a sample. It embeds with fastembed on CPU.
`finetune --hard-negatives <file>` then trains on (query, positive, negative) triplets with the same cached MNRL
loss: each pair gets one negative (a seeded pick among its mined ones, `--k 3` by default). Another level of the positive's own family ("Cookery NC III" for "Cookery NC II") is often a correct answer, so it is dropped unless the query names a level ("NC II", "level 2"); `--allow-sibling-negatives` keeps them, and a pair with none mined gets a random
other qualification's passage. `training.json` records the synthetic and augmented counts, the augment share, the sibling flag and the file's SHA-256.

## Evaluate and calibrate

The main environment (`.venv`) is enough. From `backend/`:

```bash
../.venv/Scripts/python -m training.evaluate --set test_v1           # the configured model and its parameters
../.venv/Scripts/python -m training.evaluate --set dev --json training/runs/dev.json   # also writes "errors"
../.venv/Scripts/python -m training.evaluate --calibrate --min-rejection 0.9 # calibrate on dev, report test_v1
../.venv/Scripts/python -m training.evaluate --params 2.5 4.0 0.5 25 # try FLOOR CEILING WEIGHT MIN
../.venv/Scripts/python -m training.evaluate --set sealed --final    # once per candidate, at the end
```

`--set dev|test_v1|sealed` picks the goals (default `test_v1`); `--split dev|test|all` still works as an alias
(`test` = `test_v1`, `all` = dev and test_v1). `--calibrate` always calibrates on `dev`, then reports the
requested set. `--set sealed` needs `--final` and prints a warning: the sealed set is evaluated once per candidate
and never used for tuning. Output includes a line per scenario tag (`n`, top-1/top-3 for goals with matches,
rejection for no-TVET goals). With `--json`, a `dev` run also lists `errors`: goals whose top result is wrong and
no-TVET goals that got a match, each with the goal, language, tags, accepted names and what was shown.

Goal files in `goals_v2/` are JSON lists of `{goal, accept, lang, tags, group}`; the loader rejects unknown tags,
languages or qualification names, and duplicate goals (the sealed copy wins: delete the dev one). Loading `dev` or `test_v1` reads the sealed files
only to compare normalised goal text, so a dev goal that duplicates a sealed one is rejected; sealed goals are
never returned or printed. Each error entry has a `rank` (1-based position of the first accepted name shown, or null).

Add `--json training/runs/<name>.json` to keep the numbers (`training/runs/` is git-ignored). Calibrate on `dev`
only and judge on a held-out set. The objective (0.4 × top-1 + 0.2 × top-3 + 0.4 × rejection) will trade wrong matches
for right ones, so calibrate with `--min-rejection`; if no parameters reach it, the output says so and uses the
ones that reject the most.

## Fine-tune

Training needs torch and sentence-transformers, which stay out of the API's requirements. Create a separate
environment at the repository root (Python 3.13), installing torch first from PyTorch's index:

```bash
python -m venv .venv-train
# NVIDIA GPU:
.venv-train/Scripts/python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
# or CPU only:
.venv-train/Scripts/python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
.venv-train/Scripts/python -m pip install -r backend/training/requirements.txt
.venv-train/Scripts/python -c "import torch; print(torch.cuda.is_available())"
```

Then, from `backend/`:

```bash
../.venv-train/Scripts/python -m training.finetune --output models/e5-small-tesda
```

Options: `--epochs 3`, `--batch-size 64`, `--mini-batch-size 8` (lower it if GPU memory runs out; it does not
change the result), `--lr 2e-5`, `--seed 42`, `--max-steps N` (a short smoke run), `--hard-negatives FILE`, `--no-synthetic`, `--resume`. It trains with in-batch
negatives (`CachedMultipleNegativesRankingLoss`, no duplicate texts in a batch), uses fp16 on a CUDA GPU, and
reports the loss on 5% of the pairs held out from training. Use a GPU: a step of 64 pairs took about 2.5 s on
a 4 GB laptop RTX 3050 (a full 3-epoch run on the 24,640 pairs is about 1,100 steps, roughly 45 minutes; with Smart App Control blocking torch on this laptop, it now trains on Google Colab) but about 3 minutes on a
4-core laptop CPU, which makes CPU training impractical beyond a few smoke steps.

**Interruptions.** The script saves a checkpoint in `<output>/checkpoints/` every 100 steps (`--save-steps`). If a run
stops, start it again with the same options plus `--resume` to continue from that checkpoint; without `--resume`
it refuses to overwrite an unfinished run. Resume also requires the same data/settings in `run_config.json`;
older checkpoints without that file need their original training script. The checkpoints are deleted once the model has been exported and
verified.

**One new folder and model name per retrain.** The script refuses an output folder that already holds a finished
model (`onnx/model.onnx` or `training.json`): stored embeddings are keyed by model name and text, and
`calibration.json` lives in the folder, so reusing a name would keep stale vectors and scores. Train into a new
folder and give the model a new name, e.g. `models/tesda-e5-small-v2` served as `tesda-track/tesda-e5-small-v2`.

The output folder (git-ignored, like everything in `backend/models/` except its README) holds the
sentence-transformers model, `onnx/model.onnx` (what fastembed runs) and `training.json` (base model, settings,
pair counts, held-out loss, date and git commit). `training.json` is written only after the parity check passes,
so a folder that has it holds a finished, verified model. The check fails, and the script exits with an error, if
fastembed's vectors for the exported model differ from sentence-transformers' (cosine below 0.999 on ten catalog
texts).

The ONNX export uses `torch.onnx` directly: no optimum release supports transformers 5, so sentence-transformers'
ONNX backend can't be used.

## Train on Google Colab

Windows Smart App Control blocks PyTorch's DLLs on the dev laptop (`WinError 4551`), so fine-tuning runs on a free
Colab T4 GPU. Evaluation, calibration, mining and serving stay local (onnxruntime is not blocked).

**Before.** From `backend/`, build the bundle (main environment, no torch):

```bash
../.venv/Scripts/python -m training.bundle --output training/runs/colab-bundle.zip --hard-negatives training/runs/hard-negatives-v3.json
```

The zip (under 1 MB) holds the `tesda_track` package, the catalog, the training code, `data/synthetic/*.json`, the
hard-negative file and `data/exclusions.json`, the SHA-256 of every v1, dev and sealed goal's normalised text. It holds
no goal files, `.env` or model. In the bundle `eval_exclusions()` uses those hashes, and the pairs come out identical.
Open `backend/training/colab/train_colab.ipynb` in Colab (Runtime, T4 GPU), run it top to bottom with `SMOKE = True`
first (6 steps, checks the ONNX export and the fastembed parity), then `SMOKE = False`. Keep `USE_DRIVE = True` so a
disconnect can continue (`--resume` is added automatically). The notebook downloads `tesda-e5-small-<ROUND>.zip`
with only the serving files (never `model.safetensors` or checkpoints).

**After.** Use a new `<ROUND>` for every run (v2, v3, ...). From `backend/`:

```bash
mkdir models/tesda-e5-small-<ROUND> && unzip ~/Downloads/tesda-e5-small-<ROUND>.zip -d models/tesda-e5-small-<ROUND>
../.venv/Scripts/python -m training.evaluate --model tesda-track/tesda-e5-small-<ROUND> --model-path models/tesda-e5-small-<ROUND> --set dev --calibrate --min-rejection 0.9
```

## Learner feedback

The answers to "Are you satisfied with this recommendation?" keep the goal only as a keyed hash, so they can't become
training pairs (the goals learners choose to share can: see below). They show what to improve instead. From `backend/`, with `DATABASE_URL` set to the database the
answers are in (the pilot's, not a laptop's test data):

```bash
../.venv/Scripts/python -m training.feedback --output training/runs/feedback.csv   # --from/--to YYYY-MM-DD, Philippine dates
```

Upload the file to [colab/feedback_colab.ipynb](colab/feedback_colab.ipynb) (no GPU) and run all cells. It shows
satisfaction with 95% ranges per model, place among the matches, score band and readiness level, and what a higher
minimum score would have hidden. It downloads `feedback-worklist.csv`: the qualifications to work on, each marked
`matching` (write new examples and dev/sealed goals for it before the next round), `readiness` or `pathway` (content
to review). A row holds the qualification, the match numbers, the readiness result and the answer (with, after "wrong
qualification", the one the learner wanted); not the answer's id, the goal hash, sign-in status, the learner's
experience or certification, or a time finer than the month.

### Goals learners shared

After rating a recommendation, a learner can tick a box (unticked by default) to share their goal's words: after Yes,
labelled with that qualification; after "wrong qualification", with the one they picked as wanted, and the one they
were shown kept as a known wrong answer. They are stored apart from the answer (table `shared_goal`: no account, no
answer, only the day). The privacy policy (version `2026-10-21`, `SHARED_GOAL_CONSENT`) says what sharing means.

```bash
../.venv/Scripts/python -m training.shared_goals collect            # new goals become dev/sealed evaluation goals
../.venv/Scripts/python -m training.shared_goals collect --split train   # once there are enough of those
```

`collect` adds new goals to `training/learner/shared_goals.json` (git-ignored; never commit or publish it) as
`pending`, each with a split it keeps for good. A reviewer takes anything personal out of `goal` or rejects the row,
checks `accept` (exact catalog names, more than one when several fit), sets `lang` and sets `review_status` to
`reviewed` or `rejected`. Only reviewed rows are used: dev and sealed ones join those sets with the tag `learner`
(so `training.evaluate` reports them on their own), train ones join the training queries. Every dev and sealed goal,
pending ones too, is excluded from training, and the Colab bundle carries only their hashes; of the shared goals it
carries only the reviewed train ones. The next `collect` deletes reviewed, rejected and duplicate goals from the
database and empties rejected rows, so the server keeps a shared goal only until its review and the review file holds
the only copy of the reviewed ones: back it up outside git. Real goals are the best test of the model, so keep the
default split until the dev and sealed sets hold a few hundred of them.
