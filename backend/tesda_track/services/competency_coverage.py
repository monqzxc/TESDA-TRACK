"""How much of a qualification's CORE competencies a learner's Skill Passport already shows, and what to do next.

A qualification's CORE units are what its assessment tests. Each one counts as covered when a unit on any of the
learner's certificates (an NC or a COC, of any qualification) has the same title. Titles are compared, not
meanings: evaluation.competency (Nov 2026) found that embedding certificate units mostly finds the qualification
the learner already holds again (about 3 in 4) and halves Recall@3 when mixed into the search. A unit title is
exact evidence of something assessed, so it is matched exactly; the semantic model stays on skills and goals.

Two titles are the same when their words are, ignoring case, punctuation, "&" against "and", word order and a
plural "s". The catalog writes "Prepare poultry and game dish(es" where TSP writes "PREPARE POULTRY AND GAME
DISHES"; both normalize to the same words.

The next step follows from what they hold and how much they cover (thresholds signed off by the Product Owner,
21 Nov 2026):

    held          a certificate for it, valid today              nothing to do; look one level up
    renew         held, but every certificate for it expired     the assessment again, to renew it
    assessment    at least ASSESS_AT of its CORE units,          go to assessment: train only if unsure
                  or a strong fit their work experience backs    (TESDA assesses experienced workers directly,
                  (profile_fit decides "strong")                 without the training: Kuya Manuel, US-0004)
    gap_training  at least GAP_AT                                train for the missing units (a COC as each
                                                                 cluster is passed), then the full assessment
    training      less, or no certificate units at all           the full training program

Self-declared skills never count as coverage: they are not assessed. A job they have done is stronger evidence than
a skill they list, so it can send them to assessment; the assessment center confirms eligibility either way.
"""
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from tesda_track.services.tsp_profile import NormalizedProfile, Unit

ASSESS_AT = 0.7
GAP_AT = 0.3

NextStep = Literal["held", "renew", "assessment", "gap_training", "training"]

_WORD = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class Coverage:
    """A qualification's CORE units, split by whether the profile shows them. Names are the catalog's."""
    covered: tuple[str, ...]
    missing: tuple[str, ...]
    expired: tuple[str, ...]   # covered only by certificates that have expired

    @property
    def total(self) -> int:
        return len(self.covered) + len(self.missing)

    @property
    def share(self) -> float:
        return len(self.covered) / self.total if self.total else 0.0


_OPTIONAL_PLURAL = re.compile(r"\((e?s)\)?")
_ES_PLURAL = ("shes", "ches", "xes", "zes", "sses")


def _singular(word: str) -> str:
    if word.endswith(_ES_PLURAL):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def title_key(title: str) -> frozenset[str]:
    """The words of a unit title, as compared: lower case, '&' as 'and', plurals made singular
    ("dish(es)", "dishes" and "dish" are one word)."""
    text = _OPTIONAL_PLURAL.sub(r"\1", title.casefold()).replace("&", " and ")
    return frozenset(_singular(word) for word in _WORD.findall(text))


def core_units(rules: dict) -> list[str]:
    """A catalog item's CORE unit names, in the training regulation's order."""
    return [unit["name"] for unit in rules.get("competencies", ()) if unit.get("category") == "Core"]


def coverage(core: Sequence[str], units: Iterable[Unit]) -> Coverage | None:
    """Which of these CORE units the learner's certificate units show; None when there is nothing to compare."""
    held: dict[frozenset[str], bool] = {}  # title key -> shown on a certificate valid today
    for unit in units:
        key = title_key(unit.title)
        if key:
            held[key] = held.get(key, False) or unit.status == "active"
    if not core or not held:
        return None
    covered, missing, expired = [], [], []
    for name in core:
        key = title_key(name)
        if key in held:
            covered.append(name)
            if not held[key]:
                expired.append(name)
        else:
            missing.append(name)
    return Coverage(tuple(covered), tuple(missing), tuple(expired))


def next_step(status: Literal["held", "renew"] | None, found: Coverage | None, experienced: bool = False) -> NextStep:
    if status is not None:
        return status
    share = found.share if found else 0.0
    if share >= ASSESS_AT or experienced:
        return "assessment"
    if share >= GAP_AT:
        return "gap_training"
    return "training"


def for_profile(normalized: NormalizedProfile, rules_by_code: dict[str, dict]) -> dict[str, Coverage]:
    """Coverage of every qualification the profile shows at least one CORE unit of."""
    if not normalized.units:
        return {}
    found = {}
    for code, rules in rules_by_code.items():
        result = coverage(core_units(rules), normalized.units)
        if result is not None and result.covered:
            found[code] = result
    return found
