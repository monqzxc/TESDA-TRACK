"""Does Skill Passport evidence beyond self-declared skills make profile-only suggestions better or worse?

Run from backend/:

    python -m evaluation.competency --model-path models/tesda-e5-small-v6-colab --output ../reports/competency.json
    python -m evaluation.competency --model-path ... --from-db --output ...   # on the server: stored TSP profiles

Every profile goes through tsp_profile.normalize, then one of these representations (group weights fixed before any
run, never tuned):

    skills_only     the learner's own skills: what suggest() uses today
    core_only       CORE competency units, each embedded on its own and averaged
    all_units_flat  every unit, BASIC and COMMON as much as CORE: a control, to show what generic units do
    type_weighted   CORE 1.0, COMMON 0.25, BASIC 0 (BASIC titles sit in 88 to 178 qualifications each)
    quals_core      the qualifications held (catalog names) and CORE units
    combined        skills 1.0, qualifications 0.5, CORE 1.0, COMMON 0.25, trainings and experience 0.5

A representation's similarity to a qualification is the weighted mean, over its groups, of each group's mean cosine.
Except in the control, a ranking needs occupational evidence (skills, CORE units, a qualification, training or
experience): BASIC and COMMON units can add to it, never start it.
Each is ranked twice by analysis.rank_suggestions, as the API ranks: `semantic` (keyword weight 0) and `hybrid` (the
API's own keyword evidence on the representation's text, with the parameters the model gets today). skills_only
hybrid is the current suggest().

Profiles:

    augmented   the team's labeled dev goals (short searches, job titles, typos) as the learner's skill, each given
                certificates built from real catalog units in TSP's shape: none; same sector, not the answer
                (supporting); another sector (unrelated); another sector's BASIC and COMMON units only (generic); the
                supporting one expired; the answer itself held (duplicate bait). The labels stay the skill's answers:
                a certificate is evidence of what someone learned, not of what they want next.
    safety      credential-only profiles from the catalog, with no right answer, only right behaviour: nothing for
                empty, unmapped or BASIC/COMMON-only evidence; never a qualification held today; nothing from a sector
                the profile gives no evidence for.
    real        --from-db: stored TSP profiles. Safety checks on all of them, and a weak label by leaving one
                credential out and asking for it back (what a learner did go on to hold, not what they should).
                Aggregates only; groups smaller than --k are suppressed.

No threshold is tuned here; the sealed goal set is never read.
"""
import argparse
import hashlib
import json
import random
import re
from collections import Counter, defaultdict
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, date, datetime
from pathlib import Path

import numpy as np

from evaluation.metrics import relevance
from evaluation.suggestions import K, _mean, _unit, goal_set_cases, paired_bootstrap
from tesda_track.config import get_settings
from tesda_track.schemas.analysis import Profile
from tesda_track.seed import SEED_DIR
from tesda_track.services.analysis import MatchParams, match_params, rank_suggestions, suggestion_keyword
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.tsp_profile import CodeBook, NormalizedProfile, normalize
from training.catalog import load_catalog

EVALUATION_VERSION = "competency-evaluation-v1"
REPRESENTATIONS: dict[str, dict[str, float]] = {
    "skills_only": {"skills": 1.0},
    "core_only": {"core": 1.0},
    "all_units_flat": {"units": 1.0},
    "type_weighted": {"core": 1.0, "common": 0.25, "basic": 0.0},
    "quals_core": {"quals": 1.0, "core": 1.0},
    "combined": {"skills": 1.0, "quals": 0.5, "core": 1.0, "common": 0.25, "history": 0.5},
}
UNIT_GROUPS = {"core": ("CORE",), "common": ("COMMON",), "basic": ("BASIC",),
               "units": ("BASIC", "COMMON", "CORE", "UNKNOWN")}
# What a ranking can start from. COMMON and BASIC units may add to one but never start it: with weights
# renormalised over the groups present (and z-scores blind to scale), a COMMON-only profile would otherwise rank as
# confidently as a CORE one. all_units_flat, the control, has no such rule, to show what happens without it.
STRONG_GROUPS = frozenset({"skills", "core", "quals", "history"})
CONTROL = "all_units_flat"
SYSTEMS = ("semantic", "hybrid")
CURRENT = ("skills_only", "hybrid")
VARIANTS = ("none", "supporting", "unrelated", "generic", "expired_supporting", "held_answer")
INSUFFICIENT = ("empty", "unmapped", "generic_only")
ACTIVE, EXPIRED = "1st of January, 2099", "1st of January, 2001"  # far from any evaluation date
SKILL_LENGTH, SKILL_LIMIT = 80, 20


# --- Catalog -------------------------------------------------------------------------------------------------------


@dataclass
class Catalog:
    qualifications: list[dict]
    items: list[CatalogItem]
    codes: CodeBook
    name_of: dict[str, str] = field(init=False)
    sector_of: dict[str, str] = field(init=False)
    core_titles: dict[str, frozenset[str]] = field(init=False)
    official: dict[str, str] = field(init=False)

    def __post_init__(self):
        self.name_of = {q.code: q.summary.name for q in self.items}
        self.sector_of = {q.code: q.sector for q in self.items}
        by_code = {q["code"]: q for q in self.qualifications}
        self.core_titles = {code: frozenset(_norm(c["name"]) for c in by_code[code]["competencies"]
                                            if c["category"].upper() == "CORE") for code in self.name_of}
        self.official = {}
        for official, code in sorted(self.codes.by_official_code.items()):
            self.official.setdefault(code, official)

    @classmethod
    def load(cls) -> "Catalog":
        qualifications, items = load_catalog()
        raw = json.loads((SEED_DIR / "qualifications.json").read_text(encoding="utf-8"))
        raw = raw if isinstance(raw, list) else raw["qualifications"]
        codes = CodeBook.from_catalog(SEED_DIR / "sources" / "qualification_code_crosswalk.csv",
                                      {q.summary.name: q.code for q in items})
        known = {q.code for q in items}
        return cls([q for q in raw if q["code"] in known], items, codes)

    def certificate(self, code: str, status: str, types=("BASIC", "COMMON", "CORE")) -> dict:
        """A certificate in TSP's shape for a catalog qualification, with its real units; no identifiers."""
        q = next(q for q in self.qualifications if q["code"] == code)
        units = [{"unit_code": _unit_code(c["name"], c["category"]), "type": c["category"].upper(), "title": c["name"]}
                 for c in q["competencies"] if c["category"].upper() in types]
        return {"qual_code": self.official.get(code, q["name"]), "certificate_title": q["name"],
                "qualification_name": q["name"], "certificate_type": "NC", "status": status,
                "expiration_date": ACTIVE if status == "Active" else EXPIRED, "competencies": units}


def _unit_code(title: str, category: str) -> str:
    """The same title and type get the same code, as BASIC units share one code across TSP certificates."""
    return "U" + hashlib.sha1(f"{_norm(title)}|{category.upper()}".encode()).hexdigest()[:10]


# --- Representations -----------------------------------------------------------------------------------------------


def evidence(profile: NormalizedProfile, representation: str, catalog: Catalog) -> dict[str, list[str]]:
    """The texts each group of a representation contributes; groups with weight 0 or nothing in them are left out."""
    groups: dict[str, list[str]] = {}
    for group, weight in REPRESENTATIONS[representation].items():
        if weight <= 0:
            continue
        if group == "skills":
            skills = [s[:SKILL_LENGTH] for s in profile.skills][:SKILL_LIMIT]
            pieces = [", ".join(skills)] if skills else []
        elif group == "quals":
            names = list(dict.fromkeys(catalog.name_of[q.catalog_code] for q in profile.qualifications
                                       if q.catalog_code in catalog.name_of))
            pieces = [", ".join(names)] if names else []
        elif group == "history":
            labels = list(profile.trainings + profile.experience)
            pieces = [", ".join(labels)] if labels else []
        else:
            pieces = list(dict.fromkeys(u.title for u in profile.units_of(*UNIT_GROUPS[group])))
        if pieces:
            groups[group] = pieces
    return groups


def similarity(groups: dict[str, list[str]], weights: Mapping[str, float], vectors: Mapping[str, np.ndarray],
               passages: np.ndarray) -> np.ndarray | None:
    """Weighted mean over groups of each group's mean cosine with every catalog passage."""
    total, combined = 0.0, None
    for group, pieces in groups.items():
        cosine = np.mean([vectors[piece] @ passages.T for piece in pieces], axis=0)
        combined = weights[group] * cosine if combined is None else combined + weights[group] * cosine
        total += weights[group]
    return combined / total if combined is not None and total else None


@dataclass
class Scored:
    """One profile, normalized, with what each representation x system shows it."""
    id: str
    dataset: str
    kind: str
    profile: NormalizedProfile
    judgments: dict[str, int] = field(default_factory=dict)
    expect_empty: bool = False
    region: str | None = None
    shown: dict[tuple[str, str], list[str]] = field(default_factory=dict)
    sectors: set[str] | None = None  # evidence_sectors, worked out once


def score(profiles: list[Scored], catalog: Catalog, embed: Callable[[list[str]], list[list[float]]],
          passages: np.ndarray, params: MatchParams) -> None:
    """Fill each profile's `shown` for every representation and system, with the API's ranking."""
    plans = [(p, r, evidence(p.profile, r, catalog)) for p in profiles for r in REPRESENTATIONS]
    texts = sorted({piece for _, _, groups in plans for pieces in groups.values() for piece in pieces})
    vectors = dict(zip(texts, _unit(np.asarray(embed(texts), dtype=np.float64)))) if texts else {}
    rules = [item.rules for item in catalog.items]
    semantic = replace(params, keyword_weight=0.0)
    for scored, representation, groups in plans:
        if not groups or (representation != CONTROL and not groups.keys() & STRONG_GROUPS):
            for system in SYSTEMS:
                scored.shown[(representation, system)] = []
            continue
        cosine = similarity(groups, REPRESENTATIONS[representation], vectors, passages)
        sims = {item.id: float(value) for item, value in zip(catalog.items, cosine)}
        text = ", ".join(piece for pieces in groups.values() for piece in pieces)
        skills = [s[:SKILL_LENGTH] for s in scored.profile.skills][:SKILL_LIMIT]
        keyword = suggestion_keyword(text, Profile(existing_skills=skills), rules)
        scored.shown[(representation, "semantic")] = _codes(rank_suggestions(catalog.items, {}, sims, semantic, K))
        scored.shown[(representation, "hybrid")] = _codes(rank_suggestions(catalog.items, keyword, sims, params, K))


def _codes(matches) -> list[str]:
    return [m.qualification.code for m in matches]


# --- Profiles ------------------------------------------------------------------------------------------------------


def augmented(catalog: Catalog, cases_per_variant: int, seed: int) -> list[Scored]:
    rng = random.Random(seed)
    code_by_name = {item.summary.name: item.code for item in catalog.items}
    singles = [c for c in goal_set_cases("dev", code_by_name)
               if c.kind in ("short", "job_title", "typo") and c.positive]
    by_sector: dict[str, list[str]] = defaultdict(list)
    for item in catalog.items:
        by_sector[item.sector].append(item.code)
    profiles = []
    for case in rng.sample(singles, min(cases_per_variant, len(singles))):
        answer = max(case.judgments, key=lambda code: (case.judgments[code], code))
        sector = catalog.sector_of[answer]
        same = sorted(set(by_sector[sector]) - set(case.judgments))
        other = sorted(code for code in catalog.name_of if catalog.sector_of[code] != sector)
        supporting = rng.choice(same) if same else None
        unrelated, generic = rng.choice(other), rng.choice(other)
        certificates = {
            "none": [],
            "supporting": [catalog.certificate(supporting, "Active")] if supporting else None,
            "unrelated": [catalog.certificate(unrelated, "Active")],
            "generic": [catalog.certificate(generic, "Active", types=("BASIC", "COMMON"))],
            "expired_supporting": [catalog.certificate(supporting, "Expired")] if supporting else None,
            "held_answer": [catalog.certificate(answer, "Active")],
        }
        for variant, held in certificates.items():
            if held is None:
                continue
            raw = {"skills": case.skills, "credentials": {"certificates": held}}
            # Holding the answer already: suggesting it again is a duplicate, and what should come instead (another
            # level? nothing?) is for assessors, so this variant has no labels, only the duplicate check.
            labels = {} if variant == "held_answer" else dict(case.judgments)
            profiles.append(Scored(f"{case.id}:{variant}", "augmented", variant,
                                   normalize(raw, catalog.codes, date.today()), labels))
    return profiles


def safety(catalog: Catalog, per_sector: int, seed: int) -> list[Scored]:
    rng = random.Random(seed)
    today = date.today()
    by_sector: dict[str, list[str]] = defaultdict(list)
    for item in catalog.items:
        by_sector[item.sector].append(item.code)
    sectors = sorted(by_sector)
    profiles = [Scored("empty", "safety", "empty", normalize({}, catalog.codes, today), expect_empty=True),
                Scored("unmapped", "safety", "unmapped",
                       normalize({"qualifications": ["ZZZ00000"]}, catalog.codes, today), expect_empty=True)]
    for sector in sectors:
        for code in rng.sample(sorted(by_sector[sector]), min(per_sector, len(by_sector[sector]))):
            other = rng.choice([c for s in sectors if s != sector for c in by_sector[s]])
            for kind, certificates in (
                    ("generic_only", [catalog.certificate(code, "Active", types=("BASIC", "COMMON"))]),
                    ("active_single", [catalog.certificate(code, "Active")]),
                    ("expired_single", [catalog.certificate(code, "Expired")]),
                    ("two_sectors", [catalog.certificate(code, "Active"), catalog.certificate(other, "Active")])):
                raw = {"credentials": {"certificates": certificates}}
                profiles.append(Scored(f"{code}:{kind}", "safety", kind, normalize(raw, catalog.codes, today),
                                       expect_empty=kind == "generic_only"))
    return profiles


def real(catalog: Catalog, since: date | None, exclude: set[str]) -> tuple[list[Scored], list[Scored], dict]:
    """Stored TSP profiles (all of them, for safety), and leave-one-credential-out cases (weak labels)."""
    from sqlmodel import Session, select

    from tesda_track.db import get_engine
    from tesda_track.models.identity import LearnerIdentity

    today, notes = date.today(), Counter()
    profiles, held_out = [], []
    engine = get_engine()
    with Session(engine) as session:
        if engine.dialect.name == "postgresql":
            session.connection().exec_driver_sql("SET TRANSACTION READ ONLY")
        rows = session.exec(select(LearnerIdentity.subject, LearnerIdentity.profile, LearnerIdentity.linked_at)).all()
        session.rollback()
    for number, (subject, kept, linked_at) in enumerate(rows):
        if subject in exclude or (since and linked_at.date() < since):
            notes["excluded"] += 1
            continue
        kept = kept or {}
        normalized = normalize(kept, catalog.codes, today)
        notes.update(f"warning:{w}" for w in normalized.warnings)
        region = (kept.get("personal_information") or {}).get("region") or "(none)"
        kind = "has_evidence" if normalized.has_occupational_evidence else "insufficient"
        profiles.append(Scored(f"real-{number}", "real", kind, normalized, expect_empty=kind == "insufficient",
                               region=region))
        for index, (code, raw) in enumerate(leave_one_out(kept, catalog.codes)):
            remainder = normalize(raw, catalog.codes, today)
            if remainder.has_occupational_evidence:
                held_out.append(Scored(f"real-{number}-{index}", "real_held_out", "held_out", remainder,
                                       {code: 2}, region=region))
    notes["profiles"], notes["held_out_cases"] = len(profiles), len(held_out)
    return profiles, held_out, dict(notes)


def leave_one_out(kept: Mapping, codes: CodeBook) -> list[tuple[str, dict]]:
    """Each certificate whose qualification the catalog knows, taken out with everything that names it; the code is
    the answer for the profile left. Only certificates: a bare code in `qualifications` has no units to lose."""
    credentials = kept.get("credentials") or {}
    certificates = [c for c in credentials.get("certificates") or [] if isinstance(c, Mapping)]
    cases = []
    for index, certificate in enumerate(certificates):
        given = certificate.get("qual_code") or certificate.get("qualification_name") or ""
        code = codes.resolve(given).catalog_code if isinstance(given, str) and given else None
        if not code:
            continue
        others = [c for i, c in enumerate(certificates) if i != index]
        named = {code}
        raw = {**kept,
               "qualifications": [q for q in kept.get("qualifications") or []
                                  if not (isinstance(q, str) and codes.resolve(q).catalog_code in named)],
               "credentials": {**credentials, "certificates": others,
                               "assessments": [a for a in credentials.get("assessments") or []
                                               if not (isinstance(a, Mapping) and isinstance(a.get("QualificationName"), str)
                                                       and codes.resolve(a["QualificationName"]).catalog_code in named)]}}
        if any(codes.resolve(c.get("qual_code") or "").catalog_code == code for c in others):
            continue  # held twice: leaving one out leaves the answer in
        cases.append((code, raw))
    return cases


# --- Checks --------------------------------------------------------------------------------------------------------


def evidence_sectors(scored: Scored, catalog: Catalog) -> set[str]:
    """Sectors the profile gives evidence for: credentials and qualifications of any status, assessments, and what
    the learner's own skills point to (the API's keyword evidence), plus the labeled answers."""
    if scored.sectors is not None:
        return scored.sectors
    p = scored.profile
    codes = {c.qualification.catalog_code for c in p.credentials} | {q.catalog_code for q in p.qualifications}
    codes |= {a.qualification.catalog_code for a in p.assessments if a.qualification}
    if p.skills:
        hits = suggestion_keyword(", ".join(p.skills), Profile(existing_skills=list(p.skills)[:SKILL_LIMIT]),
                                  [item.rules for item in catalog.items])
        codes |= set(list(hits)[:5])
    codes |= {code for code, grade in scored.judgments.items() if grade > 0}
    scored.sectors = {catalog.sector_of[c] for c in codes if c in catalog.sector_of}
    return scored.sectors


def checks(profiles: list[Scored], key: tuple[str, str], catalog: Catalog) -> dict:
    """The behaviour checks, as shares of profiles (with any suggestion) or of shown suggestions."""
    shown_profiles = [p for p in profiles if p.shown[key]]
    slots = [(p, code) for p in shown_profiles for code in p.shown[key]]
    insufficient = [p for p in profiles if p.kind in INSUFFICIENT or not p.profile.has_occupational_evidence]
    sectors = {p.id: evidence_sectors(p, catalog) for p in shown_profiles}
    core = {p.id: {_norm(u.title) for u in p.profile.units_of("CORE")} for p in shown_profiles}
    cross = [(p, c) for p, c in slots if catalog.sector_of[c] not in sectors[p.id]]
    return {
        "profiles": len(profiles), "with_suggestion": len(shown_profiles),
        "abstention": _share(len(profiles) - len(shown_profiles), len(profiles)),
        "insufficient_evidence_profiles": len(insufficient),
        "insufficient_evidence_suggested": _share(sum(bool(p.shown[key]) for p in insufficient), len(insufficient)),
        "duplicate_held_today_profiles": _share(sum(bool(set(p.shown[key]) & p.profile.held_today)
                                                    for p in shown_profiles), len(shown_profiles)),
        "renewal_of_expired_profiles": _share(sum(bool(set(p.shown[key]) & p.profile.held_before)
                                                  for p in shown_profiles), len(shown_profiles)),
        "cross_sector_unsupported_slots": _share(len(cross), len(slots)),
        "unrelated_slots": _share(sum(not (catalog.core_titles[c] & core[p.id]) for p, c in cross), len(slots)),
    }


def labeled(profiles: list[Scored], key: tuple[str, str]) -> dict:
    positives = [p for p in profiles if any(g > 0 for g in p.judgments.values())]
    measured = [relevance(p.shown[key], p.judgments, K) for p in positives]
    return {"positive_cases": len(positives),
            "recall_at_3": _mean([m["recall_at_k"] for m in measured]),
            "ndcg_at_3": _mean([m["ndcg_at_k"] for m in measured]),
            "mrr_at_3": _mean([m["mrr_at_k"] for m in measured]),
            "hit_at_3": _mean([float(any(p.judgments.get(c, 0) > 0 for c in p.shown[key])) for p in positives]),
            "abstained_on_positive": _mean([float(not p.shown[key]) for p in positives])}


def per_sector(profiles: list[Scored], key: tuple[str, str], catalog: Catalog, k_min: int) -> dict:
    groups: dict[str, list[float]] = defaultdict(list)
    for p in profiles:
        if any(g > 0 for g in p.judgments.values()):
            answer = max(p.judgments, key=lambda code: (p.judgments[code], code))
            groups[catalog.sector_of.get(answer, "?")].append(relevance(p.shown[key], p.judgments, K)["recall_at_k"])
    return {sector: ({"n": len(v), "recall_at_3": _mean(v)} if len(v) >= k_min else {"n": f"<{k_min}"})
            for sector, v in sorted(groups.items())}


def recall_ci(profiles: list[Scored], key: tuple[str, str], baseline: tuple[str, str]) -> dict | None:
    """Recall@3 of `key` minus the current suggest(), paired by profile, with a 95% bootstrap interval."""
    positives = [p for p in profiles if any(g > 0 for g in p.judgments.values())]
    if not positives:
        return None
    mine = [relevance(p.shown[key], p.judgments, K)["recall_at_k"] for p in positives]
    current = [relevance(p.shown[baseline], p.judgments, K)["recall_at_k"] for p in positives]
    return paired_bootstrap(mine, current)


def section(profiles: list[Scored], catalog: Catalog, by: Callable[[Scored], str], k_min: int = 1,
            labels: bool = True) -> dict:
    out = {}
    for representation in REPRESENTATIONS:
        for system in SYSTEMS:
            key = (representation, system)
            row: dict = {"checks": checks(profiles, key, catalog)}
            groups = defaultdict(list)
            for p in profiles:
                groups[by(p)].append(p)
            row["by_kind"] = {}
            for kind, members in sorted(groups.items()):
                if len(members) < k_min:
                    row["by_kind"][kind] = {"n": f"<{k_min}"}
                    continue
                row["by_kind"][kind] = {"n": len(members), **checks(members, key, catalog)}
                if labels:
                    row["by_kind"][kind] |= labeled(members, key)
                    if key != CURRENT:
                        row["by_kind"][kind]["recall_vs_current"] = recall_ci(members, key, CURRENT)
            if labels:
                row["labeled"] = labeled(profiles, key)
                row["per_sector"] = per_sector(profiles, key, catalog, k_min)
                if key != CURRENT:
                    row["recall_vs_current"] = recall_ci(profiles, key, CURRENT)
            out[f"{representation}/{system}"] = row
    return out


def _share(n: int, total: int) -> float | None:
    return n / total if total else None


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


# --- Main ----------------------------------------------------------------------------------------------------------


def evaluate(args, embed: Callable | None = None, passages: np.ndarray | None = None,
             params: MatchParams | None = None, catalog: Catalog | None = None) -> dict:
    catalog = catalog or Catalog.load()
    model_name, params_source = None, "given"
    if embed is None:
        from tesda_track.services.embeddings import E5Embedder, qualification_text

        settings = get_settings()
        model_name = f"tesda-track/{args.model_path.name}" if args.model_path else settings.embedding_model
        path = args.model_path or settings.embedding_model_path
        embedder = E5Embedder(model_name, settings.embedding_cache_dir, str(path) if path else None)
        texts = [qualification_text(q) for q in load_catalog()[0]]
        passages = _unit(np.asarray(embedder.embed_passages(texts), dtype=np.float64))
        embed, params = embedder.embed_queries, match_params(embedder)
        params_source = "model calibration.json" if embedder.calibration else "settings defaults (no calibration.json)"

    report: dict = {
        "evaluation_version": EVALUATION_VERSION, "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model": model_name, "params": asdict(params), "params_source": params_source,
        "representations": REPRESENTATIONS, "current": "/".join(CURRENT), "k": K,
        "limitations": [
            "Augmented and safety profiles are built from catalog units in TSP's certificate shape, not from real "
            "learners; augmented labels are the team-written goal labels (engineering draft).",
            "Certificates are never labels of what a learner wants: augmented keeps the skill's answers, and the "
            "real held-out label only asks whether evidence points back to a qualification the learner did earn.",
            "No threshold was tuned; every system uses the parameters the model gets in the API.",
            "Not evidence of production readiness: that needs assessor-labeled real profiles (evaluation.labeling).",
        ],
        "datasets": {},
    }
    datasets = {"augmented": augmented(catalog, args.cases, args.seed), "safety": safety(catalog, args.per_sector,
                                                                                          args.seed)}
    real_notes = None
    if args.from_db:
        exclude = set(Path(args.exclude_subjects).read_text().split()) if args.exclude_subjects else set()
        datasets["real"], datasets["real_held_out"], real_notes = real(catalog, args.since, exclude)
    for name, profiles in datasets.items():
        score(profiles, catalog, embed, passages, params)
    report["datasets"]["augmented"] = {"profiles": len(datasets["augmented"]),
                                       "results": section(datasets["augmented"], catalog, lambda p: p.kind)}
    report["datasets"]["safety"] = {"profiles": len(datasets["safety"]),
                                    "results": section(datasets["safety"], catalog, lambda p: p.kind, labels=False)}
    if args.from_db:
        report["datasets"]["real"] = {"notes": real_notes, "results": section(
            datasets["real"], catalog, lambda p: p.kind, k_min=args.k, labels=False)}
        report["datasets"]["real_by_region"] = {"results": section(
            datasets["real"], catalog, lambda p: p.region, k_min=args.k, labels=False)}
        if len(datasets["real_held_out"]) >= args.k:
            report["datasets"]["real_held_out"] = {"profiles": len(datasets["real_held_out"]), "results": section(
                datasets["real_held_out"], catalog, lambda p: p.kind, k_min=args.k)}
    return report


def compact(report: dict) -> str:
    lines = [f"model={report['model']} params={report['params']} ({report['params_source']})"]
    fmt = lambda v: "   -  " if v is None else f"{v:6.3f}"
    aug = report["datasets"]["augmented"]["results"]
    lines.append("\n[augmented] Recall@3 by certificate variant (labels: the skill's answers)")
    lines.append(f"  {'representation/system':<26}" + "".join(f"{v[:10]:>11}" for v in VARIANTS) + "   dup  xsect")
    for name, row in aug.items():
        kinds = row["by_kind"]
        lines.append(f"  {name:<26}" + "".join(f"{fmt(kinds.get(v, {}).get('recall_at_3')):>11}" for v in VARIANTS)
                     + f" {fmt(row['checks']['duplicate_held_today_profiles'])}"
                     + f" {fmt(row['checks']['cross_sector_unsupported_slots'])}")
    saf = report["datasets"]["safety"]["results"]
    lines.append("\n[safety] insufficient evidence suggested / duplicates of held-today / cross-sector unsupported")
    for name, row in saf.items():
        c = row["checks"]
        lines.append(f"  {name:<26} {fmt(c['insufficient_evidence_suggested'])} "
                     f"{fmt(c['duplicate_held_today_profiles'])} {fmt(c['cross_sector_unsupported_slots'])}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-path", type=Path, default=None, help="folder of the fine-tuned model")
    parser.add_argument("--cases", type=int, default=300, help="labeled goal-set skills to augment (each 6 ways)")
    parser.add_argument("--per-sector", type=int, default=3, help="catalog qualifications per sector for safety")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--from-db", action="store_true", help="add the TSP profiles stored on this server")
    parser.add_argument("--since", type=date.fromisoformat, default=None)
    parser.add_argument("--exclude-subjects", default=None, help="file of sso_ids to leave out (test accounts)")
    parser.add_argument("--k", type=int, default=5, help="with --from-db, suppress groups smaller than this")
    args = parser.parse_args(argv)
    report = evaluate(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    print(compact(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
