"""Evaluate profile-only suggestions (POST /analysis/suggestions) against baselines, with the API's own ranking.

Run from backend/:

    python -m evaluation.suggestions --model-path models/tesda-e5-small-v6-colab --output ../reports/suggestion-evaluation.json
    python -m evaluation.suggestions --no-model --output ../reports/suggestion-evaluation-keyword.json
    python -m evaluation.suggestions --model-path ... --from-db --output ...   # on the server: adds stored TSP profiles

Every system ranks with analysis.rank_suggestions, the function the API calls; only its inputs differ:

    suggest         the API as configured: keyword evidence + the model, with the model's calibration.json or, when it
                    has none, the settings' defaults (what v6-colab gets)
    keyword_only    the API with no model
    semantic_only   the same scoring with keyword weight 0
    hybrid_kw<w>    keyword weight swept from 0.0 to 1.0, everything else as in `suggest`
    most_popular    the same three qualifications for everyone with a signal (counts from --popularity or the database)
    random          three random qualifications for everyone with a signal (averaged over --random-runs)

Cases come from separate sources and are reported separately, because they answer different questions:

    goal_sets     the team's labeled dev goals (held out of v6 training), used as Skill Passport skills: short searches,
                  job titles, typos and near-TVET goals as single skills; two or three goals that share an answer as one
                  multi-skill profile; two with different answers as a mixed profile; no-TVET, vague and non-goals
                  should get nothing
    adversarial   evaluation/data/suggestion_adversarial_v1.json: empty, generic, Filipino/Taglish, typo, no-fit
    --cases       any labeled file in the same schema (assessor labels from evaluation.labeling)
    real          --from-db: the profiles stored for TSP-linked learners on this server. They have no answers, so
                  they give distribution and abstention numbers, plus recall where a learner's own credential maps to
                  the catalog (a weak label). Only aggregates are written; slices smaller than --k are suppressed.

Graded metrics come from evaluation.metrics.relevance (Recall@3, MRR@3, nDCG@3). Distribution metrics show collapse:
catalog coverage, normalised entropy of what is shown, and the share taken by the five most-shown qualifications.
"""
import argparse
import hashlib
import json
import math
import random
import re
import statistics
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, date, datetime
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from evaluation.metrics import relevance
from tesda_track.config import get_settings
from tesda_track.schemas.analysis import Profile
from tesda_track.seed import SEED_DIR
from tesda_track.services.analysis import (MatchParams, match_params, rank_suggestions, suggestion_keyword,
                                           suggestion_text)
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.recommendation_service import refine_profile
from training.catalog import load_catalog

EVALUATION_VERSION = "suggestion-evaluation-v1"
DATA_DIR = Path(__file__).with_name("data")
ADVERSARIAL = DATA_DIR / "suggestion_adversarial_v1.json"
GATES = DATA_DIR / "suggestion_gates_v1.json"
K = 3
SKILL_LENGTH, SKILL_LIMIT = 80, 20  # as the webview sends them (frontend/src/features/tsp/passport.ts)
SWEEP = [round(0.1 * step, 1) for step in range(11)]
SINGLE_TAGS = ("typo", "short", "near_tvet", "job_title")  # priority order when a goal has several
EMPTY_TAGS = ("no_tvet", "non_goal", "vague")
CALIBRATION_GRID = {"z_floor": [1.5, 2.0, 2.5, 3.0, 3.5, 4.0], "z_span": [1.0, 2.0, 3.0],
                    "keyword_weight": [0.2, 0.3, 0.4, 0.5, 0.6, 0.7], "min_score": [15, 20, 25, 30, 35]}


# --- Cases ---------------------------------------------------------------------------------------------------------


@dataclass
class Case:
    id: str
    source: str
    kind: str
    language: str
    skills: list[str]
    judgments: dict[str, int] = field(default_factory=dict)
    expect_empty: bool = False
    experience_years: float | None = None
    has_certification: bool | None = None
    region: str | None = None
    origin: str = "passport"  # passport | hints | both: where the webview got the skills

    @property
    def positive(self) -> bool:
        return any(grade > 0 for grade in self.judgments.values())

    @property
    def labeled(self) -> bool:
        return self.positive or self.expect_empty

    def profile(self) -> Profile:
        skills = [s.strip()[:SKILL_LENGTH] for s in self.skills if s.strip()][:SKILL_LIMIT]
        return Profile(existing_skills=skills, experience_years=self.experience_years,
                       has_certification=self.has_certification)


class FileCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: str
    language: str
    skills: list[str] = Field(max_length=SKILL_LIMIT)
    judgments: dict[str, StrictInt] = Field(default_factory=dict)
    expect_empty: bool = False
    experience_years: float | None = None
    has_certification: bool | None = None
    region: str | None = None
    origin: str = "passport"

    @model_validator(mode="after")
    def consistent(self):
        if any(isinstance(g, bool) or not 0 <= g <= 3 for g in self.judgments.values()):
            raise ValueError(f"{self.id}: grades must be 0..3")
        if self.expect_empty and any(self.judgments.values()):
            raise ValueError(f"{self.id}: an expected-empty case cannot have relevant judgments")
        if not self.expect_empty and not any(self.judgments.values()):
            raise ValueError(f"{self.id}: a positive case needs at least one relevant judgment")
        if self.origin not in ("passport", "hints", "both"):
            raise ValueError(f"{self.id}: origin is passport, hints or both")
        return self


class CaseFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str
    review_status: str
    provenance: str
    reviewers: list[str] = Field(default_factory=list)
    cases: list[FileCase] = Field(min_length=1)

    @model_validator(mode="after")
    def reviewed(self):
        if len({c.id for c in self.cases}) != len(self.cases):
            raise ValueError("Case IDs must be unique")
        if self.review_status not in ("engineering_draft", "expert_reviewed"):
            raise ValueError("Unknown review status")
        if self.review_status == "expert_reviewed" and not self.reviewers:
            raise ValueError("Reviewed cases require named reviewers")
        return self


def file_cases(path: Path, source: str, known: set[str]) -> tuple[CaseFile, list[Case]]:
    data = CaseFile.model_validate_json(path.read_text(encoding="utf-8"))
    unknown = {code for case in data.cases for code in case.judgments} - known
    if unknown:
        raise ValueError(f"{path.name}: unknown catalog codes {sorted(unknown)}")
    return data, [Case(source=source, **case.model_dump()) for case in data.cases]


def goal_set_cases(split: str, code_by_name: dict[str, str], seed: int = 7) -> list[Case]:
    """The team's labeled goals as Skill Passport skills. Answers are qualification names; grades are binary (2)."""
    from training import goals as goal_sets

    rng = random.Random(seed)
    cases, singles = [], []
    for number, goal in enumerate(goal_sets.load(split)):
        tags = set(goal.get("tags", []))
        codes = sorted({code_by_name[name] for name in goal["accept"] if name in code_by_name})
        if not goal["accept"] and tags & set(EMPTY_TAGS):
            kind = next(tag for tag in EMPTY_TAGS if tag in tags)
            cases.append(Case(f"{split}-{number}", "goal_sets", kind, goal["lang"], [goal["goal"]], expect_empty=True))
        elif codes and tags & set(SINGLE_TAGS):
            kind = next(tag for tag in SINGLE_TAGS if tag in tags)
            case = Case(f"{split}-{number}", "goal_sets", kind, goal["lang"], [goal["goal"]], {c: 2 for c in codes})
            cases.append(case)
            if kind != "near_tvet":
                singles.append(case)
    by_answer: dict[tuple, list[Case]] = defaultdict(list)
    for case in singles:
        by_answer[tuple(sorted(case.judgments))].append(case)
    for answer, group in sorted(by_answer.items()):
        if len(group) >= 2:
            chosen = rng.sample(group, min(len(group), rng.choice((2, 3))))
            languages = {c.language for c in chosen}
            cases.append(Case(f"{split}-multi-{'+'.join(c.id.rsplit('-', 1)[1] for c in chosen)}", "goal_sets",
                              "multi_skill", languages.pop() if len(languages) == 1 else "mixed_lang",
                              [s for c in chosen for s in c.skills], dict(chosen[0].judgments)))
    pool = [c for c in singles if len(c.judgments) == 1]
    for _ in range(min(100, len(pool) // 2)):
        first, second = rng.sample(pool, 2)
        if set(first.judgments) == set(second.judgments):
            continue
        languages = {first.language, second.language}
        cases.append(Case(f"{split}-mixed-{first.id.rsplit('-', 1)[1]}+{second.id.rsplit('-', 1)[1]}", "goal_sets",
                          "mixed", languages.pop() if len(languages) == 1 else "mixed_lang",
                          first.skills + second.skills, {**first.judgments, **second.judgments}))
    return cases


# --- Systems -------------------------------------------------------------------------------------------------------


@dataclass
class Prepared:
    case: Case
    text: str | None
    keyword: dict[str, dict]
    similarities: dict[int, float] | None


def prepare(cases: list[Case], items: list[CatalogItem], passages: np.ndarray | None,
            embed_queries: Callable[[list[str]], list[list[float]]] | None) -> list[Prepared]:
    """The text, keyword evidence and similarities of each case, exactly as analysis.suggest works them out."""
    rules = [item.rules for item in items]
    texts, refined = [], []
    for case in cases:
        profile = Profile.model_validate(refine_profile(case.profile().model_dump()))
        refined.append(profile)
        texts.append(suggestion_text(profile))
    similarities: list[dict[int, float] | None] = [None] * len(cases)
    if passages is not None and embed_queries is not None:
        wanted = [i for i, text in enumerate(texts) if text is not None]
        if wanted:
            queries = _unit(np.asarray(embed_queries([texts[i] for i in wanted]), dtype=np.float64))
            cosine = queries @ passages.T
            for row, i in zip(cosine, wanted):
                similarities[i] = {item.id: float(value) for item, value in zip(items, row)}
    return [Prepared(case, text, suggestion_keyword(text, profile, rules) if text else {}, sims)
            for case, text, profile, sims in zip(cases, texts, refined, similarities)]


def _unit(array: np.ndarray) -> np.ndarray:
    return array / np.maximum(np.linalg.norm(array, axis=1, keepdims=True), 1e-12)


def ranked(p: Prepared, items: list[CatalogItem], params: MatchParams | None, *, use_keyword: bool = True,
           use_model: bool = True) -> list[str]:
    if p.text is None:
        return []
    similarities = p.similarities if use_model else None
    if use_model and similarities is None:
        return []
    matches = rank_suggestions(items, p.keyword if use_keyword else {}, similarities,
                               params if use_model else None, K)
    return [m.qualification.code for m in matches]


def systems(prepared: list[Prepared], items: list[CatalogItem], params: MatchParams | None,
            popularity: dict[str, float] | None, random_runs: int, seed: int) -> dict[str, list[list[list[str]]]]:
    """Each system's shown codes per case; a list of runs per system (one run unless the system is random)."""
    with_model = params is not None and any(p.similarities is not None for p in prepared)
    out: dict[str, list[list[list[str]]]] = {}
    out["suggest"] = [[ranked(p, items, params, use_model=with_model) for p in prepared]]
    if with_model:  # without a model, `suggest` is the keyword path itself
        out["keyword_only"] = [[ranked(p, items, None, use_model=False) for p in prepared]]
        out["semantic_only"] = [[ranked(p, items, replace(params, keyword_weight=0.0), use_keyword=False)
                                 for p in prepared]]
        for weight in SWEEP:
            out[f"hybrid_kw{weight:.1f}"] = [[ranked(p, items, replace(params, keyword_weight=weight))
                                             for p in prepared]]
    known = {item.code for item in items}
    if popularity:
        top = [code for code, _ in sorted(popularity.items(), key=lambda kv: (-kv[1], kv[0])) if code in known][:K]
        out["most_popular"] = [[top if p.text else [] for p in prepared]]
    else:
        # No outside counts: the three answers most often right in these very cases. An upper bound for any one
        # fixed list, since it peeks at the labels; a suggestion that can't beat it is not personalising.
        counts = Counter(code for p in prepared for code, grade in p.case.judgments.items() if grade > 0)
        if counts:
            top = [code for code, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])) if code in known][:K]
            out["most_popular_oracle"] = [[top if p.text else [] for p in prepared]]
    codes = sorted(item.code for item in items)
    runs = []
    for run in range(random_runs):
        rng = random.Random(f"{seed}-{run}")
        runs.append([rng.sample(codes, K) if p.text else [] for p in prepared])
    out["random"] = runs
    return out


# --- Metrics -------------------------------------------------------------------------------------------------------


def _mean(values: list[float]) -> float | None:
    values = [v for v in values if v is not None]
    return statistics.fmean(values) if values else None


def labeled(cases: list[Case], shown: list[list[str]]) -> dict:
    positives = [(c, s) for c, s in zip(cases, shown) if c.positive]
    negatives = [(c, s) for c, s in zip(cases, shown) if c.expect_empty]
    measured = [relevance(s, c.judgments, K) for c, s in positives]
    shown_slots = [(code, c.judgments.get(code)) for c, s in positives for code in s]
    return {
        "positive_cases": len(positives), "negative_cases": len(negatives),
        "recall_at_3": _mean([m["recall_at_k"] for m in measured]),
        "mrr_at_3": _mean([m["mrr_at_k"] for m in measured]),
        "ndcg_at_3": _mean([m["ndcg_at_k"] for m in measured]),
        "precision_at_3": _mean([m["precision_at_k"] for m in measured]),
        "top1_relevant": _mean([m["top1_relevant"] for m in measured]),
        "hit_at_3": _mean([float(any(c.judgments.get(code, 0) > 0 for code in s)) for c, s in positives]),
        "abstained_on_positive": _mean([float(not s) for _, s in positives]),
        "abstention_on_expected_empty": _mean([float(not s) for _, s in negatives]),
        "shown_slots_on_positive": len(shown_slots),
        "shown_slots_judged_relevant": _mean([float((g or 0) > 0) for _, g in shown_slots]),
        # Of the shown suggestions that were judged: rated relevant or better (2+), and rated inappropriate (0).
        "shown_judged_grade2plus": _mean([float(g >= 2) for _, g in shown_slots if g is not None]),
        "shown_judged_grade0": _mean([float(g == 0) for _, g in shown_slots if g is not None]),
        "shown_slots_unjudged": sum(g is None for _, g in shown_slots),
    }


def distribution(cases: list[Case], shown: list[list[str]], catalog_size: int) -> dict:
    """Collapse: over cases with any signal, how widely the shown qualifications spread across the catalog."""
    with_signal = [s for c, s in zip(cases, shown) if any(x.strip() for x in c.skills)]
    counts = Counter(code for s in with_signal for code in s)
    slots = sum(counts.values())
    entropy = -sum((n / slots) * math.log(n / slots) for n in counts.values()) if slots else 0.0
    top5 = sum(n for _, n in counts.most_common(5))
    return {"cases_with_signal": len(with_signal), "shown_slots": slots, "distinct_shown": len(counts),
            "catalog_coverage": len(counts) / catalog_size if catalog_size else None,
            "entropy_normalised": entropy / math.log(catalog_size) if slots and catalog_size > 1 else None,
            "top5_share": top5 / slots if slots else None,
            "max_single_share": counts.most_common(1)[0][1] / slots if slots else None,
            "abstention_rate": _mean([float(not s) for s in with_signal])}


def per_sector(cases: list[Case], shown: list[list[str]], sector_of: dict[str, str]) -> dict:
    groups: dict[str, list[float]] = defaultdict(list)
    for case, s in zip(cases, shown):
        if case.positive:
            best = max(case.judgments, key=lambda code: (case.judgments[code], code))
            groups[sector_of.get(best, "?")].append(relevance(s, case.judgments, K)["recall_at_k"])
    return {sector: {"n": len(v), "recall_at_3": _mean(v)} for sector, v in sorted(groups.items())}


def slices(cases: list[Case], shown: list[list[str]], key: Callable[[Case], str | None], k_min: int = 1) -> dict:
    groups: dict[str, list[int]] = defaultdict(list)
    for index, case in enumerate(cases):
        value = key(case)
        if value is not None:
            groups[value].append(index)
    result = {}
    for value, indices in sorted(groups.items()):
        if len(indices) < k_min:
            result[value] = {"n": f"<{k_min}"}
            continue
        sub_cases, sub_shown = [cases[i] for i in indices], [shown[i] for i in indices]
        row = labeled(sub_cases, sub_shown)
        result[value] = {"n": len(indices), "recall_at_3": row["recall_at_3"], "ndcg_at_3": row["ndcg_at_3"],
                         "abstention_on_expected_empty": row["abstention_on_expected_empty"],
                         "abstention_rate": _mean([float(not s) for s in sub_shown])}
    return result


def profile_size(case: Case) -> str:
    n = len([s for s in case.skills if s.strip()])
    return "0" if n == 0 else "1" if n == 1 else "2-3" if n <= 3 else "4+"


def paired_bootstrap(a: list[float], b: list[float], resamples: int = 2000, seed: int = 11) -> dict | None:
    """Mean of a - b over cases, with a 95% percentile interval from resampling cases."""
    if not a or len(a) != len(b):
        return None
    diffs = np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)
    rng = np.random.default_rng(seed)
    means = diffs[rng.integers(0, len(diffs), size=(resamples, len(diffs)))].mean(axis=1)
    return {"n": len(diffs), "mean_difference": float(diffs.mean()),
            "ci95": [float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))]}


def misses(cases: list[Case], shown: list[list[str]], items: list[CatalogItem], limit: int = 60) -> list[dict]:
    """Where `suggest` went wrong: a suggestion for a profile that should get none, or no relevant one in the three.
    Nudges that should not have happened come first."""
    name_of = {item.code: item.summary.name for item in items}
    found = []
    for case, codes in zip(cases, shown):
        if case.expect_empty and codes:
            found.append({"id": case.id, "kind": case.kind, "skills": case.skills, "problem": "suggested_for_no_fit",
                          "shown": [name_of[c] for c in codes]})
        elif case.positive and not any(case.judgments.get(c, 0) > 0 for c in codes):
            found.append({"id": case.id, "kind": case.kind, "skills": case.skills,
                          "problem": "abstained" if not codes else "no_relevant_in_three",
                          "shown": [name_of[c] for c in codes],
                          "expected": [name_of[c] for c, g in sorted(case.judgments.items(), key=lambda kv: -kv[1])
                                       if g >= 2][:3]})
    found.sort(key=lambda row: row["problem"] != "suggested_for_no_fit")
    return found[:limit]


def per_case(cases: list[Case], shown: list[list[str]], metric: str) -> list[float]:
    return [relevance(s, c.judgments, K)[metric] for c, s in zip(cases, shown) if c.positive]


def summarise(cases: list[Case], runs_by_system: dict[str, list[list[list[str]]]], items: list[CatalogItem],
              k_min: int) -> dict:
    sector_of = {item.code: item.sector for item in items}
    report: dict = {"cases": len(cases), "labeled_positive": sum(c.positive for c in cases),
                    "labeled_expected_empty": sum(c.expect_empty for c in cases),
                    "kinds": dict(Counter(c.kind for c in cases)), "systems": {}, "comparisons": {}}
    for name, runs in runs_by_system.items():
        rows = [_average([labeled(cases, run) for run in runs]),
                _average([distribution(cases, run, len(items)) for run in runs])]
        shown = runs[0]
        entry = {"runs": len(runs), "labeled": rows[0], "distribution": rows[1]}
        if len(runs) == 1:
            entry["per_sector"] = per_sector(cases, shown, sector_of)
            entry["by_kind"] = slices(cases, shown, lambda c: c.kind)
            entry["by_language"] = slices(cases, shown, lambda c: c.language)
            entry["by_profile_size"] = slices(cases, shown, profile_size)
            entry["by_region"] = slices(cases, shown, lambda c: c.region, k_min)
            entry["by_origin"] = slices(cases, shown, lambda c: c.origin, k_min)
        report["systems"][name] = entry
    if "suggest" in runs_by_system and report["labeled_positive"]:
        mine = runs_by_system["suggest"][0]
        for name, runs in runs_by_system.items():
            if name == "suggest":
                continue
            report["comparisons"][f"suggest_minus_{name}"] = {
                metric: paired_bootstrap(per_case(cases, mine, metric),
                                         [_mean(values) for values in zip(*[per_case(cases, run, metric)
                                                                            for run in runs])])
                for metric in ("recall_at_k", "ndcg_at_k", "mrr_at_k")}
    return report


def _average(rows: list[dict]) -> dict:
    if len(rows) == 1:
        return rows[0]
    return {key: (_mean([row[key] for row in rows]) if all(isinstance(row[key], (int, float)) or row[key] is None
                                                            for row in rows) else rows[0][key])
            for key in rows[0]}


# --- Calibration check ---------------------------------------------------------------------------------------------


def split_half(case: Case) -> str:
    return "tune" if int(hashlib.sha256(case.id.encode()).hexdigest(), 16) % 2 == 0 else "test"


def calibrate(prepared: list[Prepared], items: list[CatalogItem], min_abstention: float = 0.9) -> tuple[MatchParams, dict]:
    """Suggestion parameters tuned on half the labeled goal-set cases: best Recall@3 among those that leave at least
    min_abstention of the expected-empty cases empty (as matching's calibration does with --min-rejection)."""
    cases = [p.case for p in prepared]
    best: tuple[tuple, MatchParams, dict] | None = None
    for floor in CALIBRATION_GRID["z_floor"]:
        for span in CALIBRATION_GRID["z_span"]:
            for weight in CALIBRATION_GRID["keyword_weight"]:
                for minimum in CALIBRATION_GRID["min_score"]:
                    params = MatchParams(floor, floor + span, weight, minimum)
                    row = labeled(cases, [ranked(p, items, params) for p in prepared])
                    abstention = row["abstention_on_expected_empty"] or 0.0
                    rank = (abstention >= min_abstention, row["recall_at_3"] or 0.0, abstention)
                    if best is None or rank > best[0]:
                        best = (rank, params, row)
    return best[1], best[2]


# --- Real profiles (server only) -----------------------------------------------------------------------------------


def real_cases(items: list[CatalogItem], since: date | None, exclude: set[str]) -> tuple[list[Case], dict]:
    """Stored TSP profiles as the webview would send them (passport skills; launch hints are never stored). A
    learner's own qualification or credential that maps to the catalog becomes a weak label (grade 2)."""
    from sqlmodel import Session, select

    from tesda_track.db import get_engine
    from tesda_track.models.identity import LearnerIdentity
    from tesda_track.services.tsp_sign_in import profile_labels

    by_name = {_norm(item.summary.name): item.code for item in items}
    crosswalk = _crosswalk(set(by_name.values()))
    cases, notes = [], Counter()
    engine = get_engine()
    with Session(engine) as session:
        if engine.dialect.name == "postgresql":
            session.connection().exec_driver_sql("SET TRANSACTION READ ONLY")
        query = select(LearnerIdentity.subject, LearnerIdentity.profile, LearnerIdentity.linked_at)
        for number, (subject, kept, linked_at) in enumerate(session.exec(query).all()):
            if subject in exclude or (since and linked_at.date() < since):
                notes["excluded"] += 1
                continue
            labels = profile_labels(kept or {})
            region = ((kept or {}).get("personal_information") or {}).get("region") or "(none)"
            held = labels["qualifications"] + labels["credentials"]
            codes = {by_name.get(_norm(label)) or crosswalk.get(_norm(label)) for label in held} - {None}
            skills_text = _norm(" ".join(labels["skills"]))
            leaked = any(_norm(re.sub(r"\bnc\s*[iv]+\b", "", name)).strip() in skills_text
                         for name in (item.summary.name for item in items if item.code in codes))
            notes["with_mappable_credential"] += bool(codes and labels["skills"])
            notes["credential_name_inside_skills"] += bool(codes and labels["skills"] and leaked)
            cases.append(Case(f"real-{number}", "real", "credential_proxy" if codes and labels["skills"] else "real",
                              "unknown", labels["skills"], {code: 2 for code in codes} if labels["skills"] else {},
                              region=region))
        session.rollback()
    return cases, dict(notes)


def _crosswalk(known: set[str]) -> dict[str, str]:
    import csv

    path = SEED_DIR / "sources" / "qualification_code_crosswalk.csv"
    mapping = {}
    if path.exists():
        with path.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row["qualification_code"] in known and row["relation"] == "same":
                    mapping[_norm(f"{row['official_title']} NC {row['level']}")] = row["qualification_code"]
                    mapping[_norm(row["official_code"])] = row["qualification_code"]
    return mapping


def db_popularity(items: list[CatalogItem]) -> dict[str, float]:
    """Registered training programs per qualification (not sample data): what is most offered, not most wanted."""
    from sqlalchemy import func
    from sqlmodel import Session, select

    from tesda_track.db import get_engine
    from tesda_track.models import Qualification, TrainingProgram

    with Session(get_engine()) as session:
        rows = session.exec(select(Qualification.code, func.count(TrainingProgram.id))
                            .join(TrainingProgram, TrainingProgram.qualification_id == Qualification.id)
                            .where(TrainingProgram.data_status != "example")
                            .group_by(Qualification.code)).all()
    return {code: float(n) for code, n in rows}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold().replace("(superseded)", "")).strip()


# --- Gates ---------------------------------------------------------------------------------------------------------


def check_gates(report: dict, gates: dict) -> dict:
    """Each proposed gate as pass, fail or not_measured, from the report's numbers. See evaluation/README notes in
    docs/evaluation-and-release-checks.md for where each threshold comes from."""
    results = {}
    for gate in gates["gates"]:
        value = _lookup(report, gate["metric"])
        if value is None:
            results[gate["id"]] = {"status": "not_measured", "metric": gate["metric"]}
            continue
        passed = value >= gate["minimum"] if "minimum" in gate else value <= gate["maximum"]
        results[gate["id"]] = {"status": "pass" if passed else "fail", "value": value,
                               **{key: gate[key] for key in ("minimum", "maximum") if key in gate}}
    return results


def _lookup(report: dict, path: str):
    node = report
    for part in path.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        elif isinstance(node, list) and part.isdigit() and int(part) < len(node):
            node = node[int(part)]
        else:
            return None
    return node if isinstance(node, (int, float)) and not isinstance(node, bool) else None


def derived(report: dict) -> dict:
    """Numbers the gates read that need more than one system: margins over the strongest baseline."""
    out = {}
    for source, section in report["sources"].items():
        comparisons = section.get("comparisons", {})
        baselines = {name: comp for name, comp in comparisons.items()
                     if not name.startswith("suggest_minus_hybrid")}
        lows = [comp["recall_at_k"]["ci95"][0] for comp in baselines.values() if comp.get("recall_at_k")]
        suggest = section["systems"].get("suggest", {})
        out[source] = {"recall_margin_ci_low_vs_best_baseline": min(lows) if lows else None,
                       "region_abstention_gap_max": _gap(suggest.get("by_region", {}), "abstention_rate",
                                                        suggest.get("distribution", {}).get("abstention_rate")),
                       "origin_recall_gap_max": _gap(suggest.get("by_origin", {}), "recall_at_3",
                                                     suggest.get("labeled", {}).get("recall_at_3"))}
    return out


def _gap(groups: dict, metric: str, overall: float | None) -> float | None:
    """The largest distance between a slice and the whole, over slices big enough to be reported (two or more)."""
    values = [row[metric] for row in groups.values() if isinstance(row.get("n"), int) and row.get(metric) is not None]
    if overall is None or len(values) < 2:
        return None
    return max(abs(value - overall) for value in values)


# --- Main ----------------------------------------------------------------------------------------------------------


def evaluate(args) -> dict:
    qualifications, items = load_catalog()
    known = {item.code for item in items}
    code_by_name = {item.summary.name: item.code for item in items}
    passages = embed_queries = None
    model_name, params, params_source = None, None, "none (keyword only)"
    if not args.no_model:
        from tesda_track.services.embeddings import E5Embedder, qualification_text

        settings = get_settings()
        model_name = args.model or (f"tesda-track/{args.model_path.name}" if args.model_path
                                    else settings.embedding_model)
        path = args.model_path or (None if args.model else settings.embedding_model_path)
        embedder = E5Embedder(model_name, settings.embedding_cache_dir, str(path) if path else None)
        passages = _unit(np.asarray(embedder.embed_passages([qualification_text(q) for q in qualifications]),
                                    dtype=np.float64))
        embed_queries = embedder.embed_queries
        if args.params:
            params = MatchParams(*args.params[:3], int(args.params[3]))
            params_source = args.params_source or "--params"
        else:
            params = match_params(embedder)
            params_source = "model calibration.json" if embedder.calibration else "settings defaults (no calibration.json)"

    sources: dict[str, list[Case]] = {}
    provenance: dict[str, dict] = {}
    if "goal_sets" in args.sources:
        sources["goal_sets"] = goal_set_cases(args.goal_split, code_by_name)
        provenance["goal_sets"] = {"split": args.goal_split, "review_status": "engineering_draft",
                                   "note": "team-written labeled goals used as skills; not TSP payloads"}
    if "adversarial" in args.sources:
        data, cases = file_cases(args.adversarial, "adversarial", known)
        sources["adversarial"] = cases
        provenance["adversarial"] = {"version": data.version, "review_status": data.review_status,
                                     "sha256": hashlib.sha256(args.adversarial.read_bytes()).hexdigest()}
    for path in args.cases or []:
        data, cases = file_cases(path, f"file:{data_name(path)}", known)
        sources[f"file:{data_name(path)}"] = cases
        provenance[f"file:{data_name(path)}"] = {"version": data.version, "review_status": data.review_status,
                                                 "reviewers": data.reviewers,
                                                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    real_notes = None
    if args.from_db:
        exclude = set(Path(args.exclude_subjects).read_text().split()) if args.exclude_subjects else set()
        sources["real"], real_notes = real_cases(items, args.since, exclude)
        provenance["real"] = {"note": "stored TSP profiles on this server; aggregates only", **real_notes}

    popularity, popularity_source = None, None
    if args.popularity:
        popularity, popularity_source = json.loads(args.popularity.read_text(encoding="utf-8")), str(args.popularity)
    elif args.from_db:
        popularity, popularity_source = db_popularity(items), "registered training programs per qualification (DB)"

    report: dict = {
        "evaluation_version": EVALUATION_VERSION, "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model": model_name, "params": asdict(params) if params else None, "params_source": params_source,
        "catalog_size": len(items),
        "catalog_sha256": hashlib.sha256((SEED_DIR / "qualifications.json").read_bytes()).hexdigest(),
        "popularity_source": popularity_source, "random_runs": args.random_runs, "k": K,
        "provenance": provenance, "sources": {},
        "limitations": [
            "Goal-set and adversarial cases are written by the team, not TSP payloads; their labels are engineering "
            "drafts until TESDA assessors review them (evaluation.labeling).",
            "Real profiles carry no answers: their recall uses a learner's own credential as a weak label, which says "
            "what they already hold, not what they should train in next.",
            "most_popular counts what is offered (registered programs), not what learners want.",
        ],
    }
    for name, cases in sources.items():
        prepared = prepare(cases, items, passages, embed_queries)
        runs = systems(prepared, items, params, popularity, args.random_runs, args.seed)
        report["sources"][name] = summarise(cases, runs, items, args.k if name == "real" else 1)
        if name != "real":  # team-written cases only: never a learner's words
            report["sources"][name]["suggest_misses"] = misses(cases, runs["suggest"][0], items)
        if args.calibrate and name == "goal_sets" and params is not None:
            tune = [p for p in prepared if split_half(p.case) == "tune" and p.case.labeled]
            test = [p for p in prepared if split_half(p.case) == "test" and p.case.labeled]
            tuned, tune_row = calibrate(tune, items)
            test_cases = [p.case for p in test]
            report["calibration_check"] = {
                "objective": "best Recall@3 with at least 0.9 abstention on expected-empty cases (tune half)",
                "inherited_params": asdict(params), "params_source": params_source,
                "tuned_params": asdict(tuned), "tune": tune_row,
                "test_inherited": labeled(test_cases, [ranked(p, items, params) for p in test]),
                "test_tuned": labeled(test_cases, [ranked(p, items, tuned) for p in test]),
                "test_keyword_only": labeled(test_cases, [ranked(p, items, None, use_model=False) for p in test]),
            }
    report["derived"] = derived(report)
    if args.gates and args.gates.exists():
        gates = json.loads(args.gates.read_text(encoding="utf-8"))
        report["gates_version"] = gates["version"]
        report["gates"] = check_gates(report, gates)
    return report


def data_name(path: Path) -> str:
    return path.stem


def compact(report: dict) -> str:
    lines = [f"model={report['model']} params={report['params']} ({report['params_source']})"]
    for source, section in report["sources"].items():
        lines.append(f"\n[{source}] cases={section['cases']} positive={section['labeled_positive']} "
                     f"expected_empty={section['labeled_expected_empty']}")
        lines.append(f"  {'system':<20} {'R@3':>6} {'MRR':>6} {'nDCG3':>6} {'empty✓':>7} {'abst+':>6} "
                     f"{'cover':>6} {'H':>5} {'top5':>5}")
        for name, entry in section["systems"].items():
            lab, dist = entry["labeled"], entry["distribution"]
            fmt = lambda v: "   -  " if v is None else f"{v:6.3f}"
            lines.append(f"  {name:<20} {fmt(lab['recall_at_3'])} {fmt(lab['mrr_at_3'])} {fmt(lab['ndcg_at_3'])} "
                         f"{fmt(lab['abstention_on_expected_empty']):>7} {fmt(lab['abstained_on_positive'])} "
                         f"{fmt(dist['catalog_coverage'])} {fmt(dist['entropy_normalised'])[1:]} "
                         f"{fmt(dist['top5_share'])[1:]}")
    if "gates" in report:
        lines.append("\ngates: " + ", ".join(f"{k}={v['status']}" for k, v in report["gates"].items()))
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=None, help="embedding model name (default: the settings' model)")
    parser.add_argument("--model-path", type=Path, default=None, help="folder of a fine-tuned model")
    parser.add_argument("--no-model", action="store_true", help="keyword, popularity and random legs only")
    parser.add_argument("--params", nargs=4, type=float, metavar=("FLOOR", "CEILING", "WEIGHT", "MIN"),
                        help="score parameters for `suggest` instead of the model's calibration or the settings")
    parser.add_argument("--params-source", default=None, help="with --params, where they came from (for the report)")
    parser.add_argument("--params-from", type=Path, default=None,
                        help="read --params from a training.evaluate --json report (its calibrated 'params')")
    parser.add_argument("--sources", nargs="+", default=["goal_sets", "adversarial"],
                        choices=["goal_sets", "adversarial"])
    parser.add_argument("--goal-split", default="dev", choices=["dev", "test_v1"])
    parser.add_argument("--adversarial", type=Path, default=ADVERSARIAL)
    parser.add_argument("--cases", type=Path, nargs="*", help="more labeled case files (e.g. assessor labels)")
    parser.add_argument("--from-db", action="store_true", help="add the TSP profiles stored on this server")
    parser.add_argument("--since", type=date.fromisoformat, default=None,
                        help="with --from-db, only learners linked on or after this date (YYYY-MM-DD)")
    parser.add_argument("--exclude-subjects", default=None,
                        help="with --from-db, a file of sso_ids to leave out (TSP test accounts), one per line")
    parser.add_argument("--k", type=int, default=5, help="with --from-db, suppress slices smaller than this")
    parser.add_argument("--popularity", type=Path, default=None, help="JSON {code: count} for most_popular")
    parser.add_argument("--random-runs", type=int, default=20)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--calibrate", action="store_true",
                        help="also tune suggestion parameters on half the goal-set cases and compare on the other half")
    parser.add_argument("--gates", type=Path, default=GATES)
    args = parser.parse_args(argv)
    if args.params_from:
        found = json.loads(args.params_from.read_text(encoding="utf-8"))["params"]
        args.params = [found["z_floor"], found["z_ceiling"], found["keyword_weight"], found["min_score"]]
        args.params_source = args.params_source or f"calibrated params in {args.params_from.name}"
    if args.no_model and (args.model or args.model_path or args.params):
        parser.error("--no-model excludes --model, --model-path and --params")
    if args.k < 2:
        parser.error("--k must be at least 2")
    report = evaluate(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(compact(report))
    failed = [k for k, v in report.get("gates", {}).items() if v["status"] == "fail"]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
