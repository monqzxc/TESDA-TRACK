"""(query, passage) pairs for fine-tuning, built from catalog text only.

Each qualification's passage is exactly what the API embeds; its queries are the names, jobs, keywords and
core competencies a learner might type, plus a few English and Filipino goal phrasings over the jobs and keywords,
each as written in the catalog and in lower case. Synthetic goal-style queries written from the catalog (data/synthetic/*.json) add realistic phrasings, and a seeded
share of them gets one typo or text-speak copy. Evaluation goals (v1, dev and sealed) are excluded so the held-out
numbers stay honest.
"""
import hashlib
import json
import random
import re
import zlib
from pathlib import Path

from tesda_track.models import Qualification
from tesda_track.services.embeddings import qualification_text
from tesda_track.utils.helpers import normalize

SYNTHETIC_DIR = Path(__file__).resolve().parent / "data" / "synthetic"
TEMPLATES = ("I want to be a {x}", "I want to work as a {x}", "gusto kong maging {x}", "may karanasan ako bilang {x}",
             "marunong ako sa {x}")


def _queries(qualification: Qualification) -> list[str]:
    terms = [*qualification.possible_jobs, *qualification.career_keywords]
    # Core units only: Basic and Common units ("Participate in workplace communication") are shared by dozens of
    # qualifications, so they say nothing about which one a learner means.
    queries = [qualification.name, qualification.skill_label or "", *terms,
               *(c.name for c in qualification.competencies if c.is_active and c.category == "Core"),
               *(template.format(x=term) for term in terms for template in TEMPLATES)]
    # The tokenizer is cased and the API embeds the goal as typed, so both "Chef" and "chef" need training signal.
    written = [" ".join(query.split()) for query in queries if query.strip()]
    return list(dict.fromkeys(form for query in written for form in (query, normalize(query))))


# Whole-word text-speak that Filipino learners really type (case-insensitive match, lower-case output).
TEXT_SPEAK = {"ako": "aq", "ko": "q", "gusto": "gsto", "kasi": "kc", "maging": "mging", "para": "pra",
              "marunong": "mrunong", "work": "wrk", "want": "wnt", "you": "u", "because": "bcs"}
LEVEL_SUFFIX = re.compile(r"\s+(?:NC|Level)\s+(?:I{1,3}|IV|V)\b.*$", re.IGNORECASE)
# A query that asks for a level: "NC II", "nc3", "level 2", "antas IV". Without one, sibling levels are all right answers.
LEVEL_CUE = re.compile(r"\b(?:nc|level|antas)\s*(?:i{1,3}|iv|[1-4])\b", re.IGNORECASE)
MIN_TYPO_WORD = 5  # shorter words are too easy to turn into a different word


def family(name: str) -> str:
    """A qualification name without its NC level: "Cookery NC II" and "Cookery NC III" share the family "Cookery"."""
    return LEVEL_SUFFIX.sub("", name).strip()


def names_a_level(query: str) -> bool:
    return bool(LEVEL_CUE.search(query))


def augment(query: str, seed: int) -> str | None:
    """One plausible typo variant of the query, or None when nothing sensible can change.

    Either a text-speak substitution of a whole word, or one dropped, doubled or swapped letter inside a word of at
    least five letters. Deterministic for a given (query, seed); never equal to the query and never empty."""
    rng = random.Random(f"{seed}:{query}")
    words = query.split(" ")
    candidates, speak = [], []
    for position, word in enumerate(words):
        if word.casefold() in TEXT_SPEAK:
            speak.append((position, TEXT_SPEAK[word.casefold()]))
        if len(word) >= MIN_TYPO_WORD and word.isalpha():
            for index in range(1, len(word) - 1):  # keep the first letter: people rarely mistype it
                candidates.append((position, word[:index] + word[index + 1:]))  # drop
                candidates.append((position, word[:index] + word[index] + word[index:]))  # double
                if word[index] != word[index + 1]:
                    candidates.append((position, word[:index] + word[index + 1] + word[index] + word[index + 2:]))  # swap
    # Pick the kind of edit first, so text-speak gets about a third of the variants rather than being drowned by the
    # many possible letter edits; fall back to the other kind when the chosen one has nothing.
    kinds = [speak, candidates] if rng.random() < 1 / 3 else [candidates, speak]
    ordered = []
    for kind in kinds:
        rng.shuffle(kind)
        ordered += kind
    for position, replacement in ordered:
        variant = " ".join([*words[:position], replacement, *words[position + 1:]])
        if variant.strip() and variant != query:
            return variant
    return None


def _in_share(query: str, share: float) -> bool:
    return zlib.crc32(query.encode("utf-8")) % 10_000 < share * 10_000


def training_pairs(qualifications: list[Qualification], exclude: "set[str] | HashedExclusions",
                   synthetic: dict[str, list[str]] | None = None, augment_share: float = 0.15
                   ) -> list[tuple[str, str]]:
    """Every query of every qualification with its passage, minus queries that equal an excluded goal.

    synthetic maps a qualification name to extra queries, used as written and lower-cased; a seeded hash of the query
    picks the augment_share of them that also get one typo/text-speak copy."""
    pairs = []
    for qualification in qualifications:
        passage = qualification_text(qualification)
        queries = _queries(qualification)
        for raw in (synthetic or {}).get(qualification.name, []):
            query = " ".join(raw.split())
            if not query:
                continue
            queries += [query, normalize(query)]
            if _in_share(query, augment_share) and (typo := augment(query, zlib.crc32(query.encode("utf-8")))):
                queries.append(typo)
        pairs.extend((query, passage) for query in dict.fromkeys(queries) if normalize(query) not in exclude)
    return pairs


def load_synthetic(directory: Path = SYNTHETIC_DIR) -> dict[str, list[str]]:
    """data/synthetic/*.json merged by qualification name; an unknown name raises, so a typo cannot go unnoticed."""
    from training.catalog import load_catalog

    known = {q.name for q in load_catalog()[0]}
    merged: dict[str, list[str]] = {}
    for path in sorted(directory.glob("*.json")):
        for name, queries in json.loads(path.read_text(encoding="utf-8")).items():
            if name not in known:
                raise ValueError(f"{path.name}: unknown qualification {name!r}")
            if not isinstance(queries, list) or not all(isinstance(q, str) for q in queries):
                raise ValueError(f"{path.name}: {name!r} must map to a list of strings")
            merged.setdefault(name, []).extend(queries)
    return {name: list(dict.fromkeys(queries)) for name, queries in merged.items()}


DATA_DIR = Path(__file__).resolve().parent / "data"
EXCLUSIONS_PATH = DATA_DIR / "exclusions.json"


def exclusion_hash(text: str) -> str:
    return hashlib.sha256(normalize(text).encode("utf-8")).hexdigest()


class HashedExclusions:
    """Evaluation goals known only by the SHA-256 of their normalised text (the Colab bundle ships no goal text).

    Supports `normalized_query in exclusions`, which is all training_pairs needs."""

    def __init__(self, hashes):
        self.hashes = frozenset(hashes)

    def __contains__(self, normalized: str) -> bool:
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest() in self.hashes

    def __bool__(self) -> bool:
        return bool(self.hashes)

    def __len__(self) -> int:
        return len(self.hashes)


def eval_exclusions():
    """Normalised v1 (dev and test), v2 dev and sealed goals. Sealed text is only reduced to keys, never shown.

    Where the goal files are absent (the Colab bundle) the hashes in data/exclusions.json are used instead."""
    if not (DATA_DIR / "eval_goals.json").exists():
        return HashedExclusions(json.loads(EXCLUSIONS_PATH.read_text(encoding="utf-8")))
    from training import goals

    return {normalize(g["goal"]) for split in ("dev", "test_v1", "sealed") for g in goals.load(split)}
