"""v6 data: every learner query with ALL the qualifications that own it, for training/v6_train.py.

Earlier rounds trained (query, one passage) pairs with in-batch negatives. A job, Core task or keyword that several
qualifications share was then pushed away from its other owners whenever they met in a batch, and the app's score
(a z-score against all 319 passages) was never optimised directly. v6 instead groups every training query with all
of its owners (catalog jobs, Core tasks, keywords, names, the v5 learner phrasings and the v6 Filipino/Taglish drafts
in data/v6/), and the trainer scores it against the whole catalog. Evaluation goals and MVP probes are excluded here,
so the dataset file carries no evaluation text and can be embedded in the Colab notebook.

From backend/ (main environment):
    python -m training.v6 --dataset training/runs/v6-dataset.json      # add --no-v6-drafts for an ablation
    python -m training.recover --onnx-folder models/tesda-e5-small-v4 --output models/_torch-v4   # .venv-train
    python -m training.v6_train --data training/runs/v6-dataset.json --base models/_torch-v4         --output models/tesda-e5-small-v6                                                       # .venv-train
or train in Colab with colab/train_colab_v6.ipynb (python -m training.v6_notebook builds it).
"""
import argparse
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from tesda_track.services.embeddings import qualification_text
from tesda_track.utils.helpers import normalize
from training.catalog import load_catalog
from training.pairs import augment, eval_exclusions, family, load_synthetic, names_a_level, training_pairs

DATA = Path(__file__).resolve().parent / "data"
V6_DIR = DATA / "v6"
UNRELATED_DIR = V6_DIR / "unrelated"
PROBES = DATA / "v5_eval" / "mvp_probes.json"
ACCEPTANCE = Path(__file__).resolve().parent / "model_acceptance.json"
LANGS = {"tl", "taglish", "en"}
KINDS = {"name", "job", "task", "short", "typo", "experience", "indirect"}
UNRELATED_KINDS = {"no_tvet", "non_goal", "vague"}
MAX_OWNERS = 24  # a query shared by more qualifications than this says little about any of them
LEARNER_BUCKET = 150  # v5 multilingual frames per (language, kind)
AUGMENT_SHARE = 0.15
HELD_OUT = 0.03


def _excluded(text: str, exclusions, probes: set[str]) -> bool:
    key = normalize(text)
    stem = key.rstrip(".!? ")
    forms = (key, stem, stem + ".", stem + "?")
    return any(form in exclusions or form in probes for form in forms)


def probe_texts() -> set[str]:
    """MVP probe goals and the acceptance gate's goals stay out of training, so both remain held-out checks."""
    texts = set()
    if PROBES.exists():
        texts |= {normalize(row["goal"]) for row in json.loads(PROBES.read_text(encoding="utf-8"))}
    if ACCEPTANCE.exists():
        policy = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
        texts |= {normalize(goal) for goal in [*policy["must_match"], *policy["must_reject"]]}
    return texts


def load_unrelated(directory: Path = UNRELATED_DIR) -> list[dict]:
    """Goals that must get no match: careers with no TESDA qualification, non-goals and vague requests."""
    rows = []
    for path in sorted(directory.glob("*.json")) if directory.is_dir() else []:
        for i, row in enumerate(json.loads(path.read_text(encoding="utf-8"))):
            if (not isinstance(row.get("query"), str) or not row["query"].strip() or row.get("lang") not in LANGS
                    or row.get("kind") not in UNRELATED_KINDS or row.get("review_status") not in ("draft", "reviewed")
                    or "accept" in row):
                raise ValueError(f"Invalid unrelated row {path.name}[{i}]")
            rows.append(row)
    return rows


def load_v6_rows(names: set[str], directory: Path = V6_DIR) -> list[dict]:
    rows = []
    for path in sorted(directory.glob("*.json")):
        for i, row in enumerate(json.loads(path.read_text(encoding="utf-8"))):
            where = f"{path.name}[{i}]"
            if (not isinstance(row.get("query"), str) or not row["query"].strip() or row.get("lang") not in LANGS
                    or row.get("kind") not in KINDS or row.get("review_status") not in ("draft", "reviewed")
                    or not isinstance(row.get("accept"), list) or not row["accept"]):
                raise ValueError(f"Invalid v6 row {where}")
            if unknown := set(row["accept"]) - names:
                raise ValueError(f"{where}: unknown qualification {sorted(unknown)}")
            rows.append(row)
    return rows


def build(qualifications, exclusions=None, probes=None, v6_dir: Path = V6_DIR,
          unrelated_dir: Path = UNRELATED_DIR) -> tuple[list[tuple[str, list[str]]], dict]:
    """(query text, owner names) for every distinct query text, and an audit of where they came from. Unrelated
    goals have no owners; one that equals a related query is dropped rather than trained both ways."""
    from training import v4, v5_examples

    exclusions = eval_exclusions() if exclusions is None else exclusions
    probes = probe_texts() if probes is None else probes
    names = {q.name for q in qualifications}
    owners: dict[str, set[str]] = defaultdict(set)  # normalized key -> owners
    forms: dict[str, dict[str, None]] = defaultdict(dict)  # normalized key -> surface forms
    sources: Counter = Counter()
    dropped: Counter = Counter()

    def add(text: str, labels, source: str) -> None:
        text = " ".join(text.split())
        if not text:
            return
        if _excluded(text, exclusions, probes):
            dropped["evaluation_overlap"] += 1
            return
        key = normalize(text)
        if key not in forms:
            sources[source] += 1
        owners[key].update(labels)
        forms[key][text] = None

    # 1. Everything v4 learned from: catalog names, jobs, keywords, Core tasks, synthetic goals, regional drafts.
    passage_owner = {qualification_text(q): q.name for q in qualifications}
    synthetic, _ = v4.enrich(qualifications, load_synthetic(), exclusions)
    for query, passage in training_pairs(qualifications, exclusions, synthetic, AUGMENT_SHARE):
        add(query, [passage_owner[passage]], "v4_pairs")
    # 2. Multilingual learner frames from the MVP round (named qualification, job, goal, skill), more per bucket.
    previous = v5_examples.PER_BUCKET
    v5_examples.PER_BUCKET = LEARNER_BUCKET
    try:
        for row in v5_examples.learner_rows(qualifications, exclusions):
            add(row["title"], row["labels"], "v5_learner")
    finally:
        v5_examples.PER_BUCKET = previous
    # 3. Filipino and Taglish drafts with every correct owner (data/v6).
    v6_rows = load_v6_rows(names, v6_dir) if v6_dir.is_dir() else []
    for row in v6_rows:
        text = " ".join(row["query"].split())
        add(text, row["accept"], "v6_drafts")
        add(text.lower(), row["accept"], "v6_drafts")
        seed = int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)
        if seed % 10_000 < AUGMENT_SHARE * 10_000 and (typo := augment(text, seed)):
            add(typo, row["accept"], "v6_typos")

    # 4. Goals that must get no match.
    unrelated_rows = load_unrelated(unrelated_dir)
    unrelated: dict[str, dict[str, None]] = defaultdict(dict)
    for row in unrelated_rows:
        text = " ".join(row["query"].split())
        for form in (text, text.lower()):
            key = normalize(form)
            if _excluded(form, exclusions, probes):
                dropped["evaluation_overlap"] += 1
            elif key in owners:
                dropped["unrelated_equals_related"] += 1
            else:
                unrelated[key][form] = None

    items = []
    for key, labels in owners.items():
        if len(labels) > MAX_OWNERS:
            dropped["too_many_owners"] += len(forms[key])
            continue
        for text in forms[key]:
            items.append((text, sorted(labels)))
    items += [(text, []) for key in unrelated for text in unrelated[key]]
    items.sort()
    owner_sizes = Counter(min(len(labels), 5) for _, labels in items if labels)
    audit = {"queries": len(items), "distinct_keys": len({normalize(t) for t, _ in items}),
             "new_keys_by_source": dict(sources), "dropped": dict(dropped),
             "owners_per_query": {("5+" if k == 5 else str(k)): v for k, v in sorted(owner_sizes.items())},
             "v6_draft_rows": len(v6_rows), "v6_by_lang": dict(Counter(r["lang"] for r in v6_rows)),
             "v6_by_kind": dict(Counter(r["kind"] for r in v6_rows)),
             "unrelated_queries": sum(not labels for _, labels in items),
             "unrelated_by_kind": dict(Counter(r["kind"] for r in unrelated_rows)),
             "unrelated_by_lang": dict(Counter(r["lang"] for r in unrelated_rows)),
             "qualifications_without_queries": sorted(names - {n for _, labels in items for n in labels}),
             "sha256": hashlib.sha256(json.dumps(items, ensure_ascii=False).encode()).hexdigest()}
    return items, audit


def split_items(items, seed: int) -> set[str]:
    """Normalised keys held out for the loss check; case variants and every owner of a query stay together."""
    keys = sorted({normalize(t) for t, _ in items})
    random.Random(seed).shuffle(keys)
    return set(keys[:max(1, round(len(keys) * HELD_OUT))])


def dataset(qualifications, items, audit, seed: int = 42) -> dict:
    """What v6_train.py needs: catalog names, passages and families, and (text, owner indices, names a level, held)."""
    names = [q.name for q in qualifications]
    index_of = {n: i for i, n in enumerate(names)}
    held = split_items(items, seed)
    return {"profile": "v6", "audit": audit, "names": names,
            "passages": [qualification_text(q) for q in qualifications], "families": [family(n) for n in names],
            "items": [[text, [index_of[n] for n in owners], names_a_level(text), normalize(text) in held]
                      for text, owners in items]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", type=Path, help="write the training dataset here")
    parser.add_argument("--no-v6-drafts", action="store_true", help="leave out data/v6 (ablation)")
    args = parser.parse_args()
    qualifications, _ = load_catalog()
    items, audit = build(qualifications, v6_dir=Path("__none__") if args.no_v6_drafts else V6_DIR)
    print(json.dumps(audit, ensure_ascii=False, indent=2))
    if args.dataset:
        args.dataset.parent.mkdir(parents=True, exist_ok=True)
        args.dataset.write_text(json.dumps(dataset(qualifications, items, audit), ensure_ascii=False,
                                           separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {args.dataset}")


if __name__ == "__main__":
    main()
