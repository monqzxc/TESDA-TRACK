"""Versioned import, audited human decisions and approved-only public evidence. No scoring imports."""

import csv, hashlib, json
from datetime import date, datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from sqlalchemy import func
from sqlmodel import Session, select
from tesda_track.models import Qualification, Region, Learner, utcnow
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
    LaborMarketReview as Review,
)
from tesda_track.schemas.labor_market import (
    DatasetInput,
    EvidenceInput,
    MappingInput,
    ReviewInput,
)
from tesda_track.errors import ConflictError, InvalidRequestError, NotFoundError


def job_key(title):
    return " ".join(title.split()).casefold()


_matching_views_cache = None


def matching_rule_views(session, views):
    """Approved national occupation names are retrieval evidence, never training labels.

    Do not mutate the shared catalog snapshot. Review revocation takes effect on
    the next request; pending/manual/rejected proposals never enter matching.
    """
    global _matching_views_cache
    year = datetime.now(ZoneInfo("Asia/Manila")).year
    rows = session.exec(
        select(Qualification.code, Evidence.occupation_title)
        .join(Mapping, Mapping.qualification_id == Qualification.id)
        .join(Evidence, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .where(
            Qualification.is_active == True,
            Mapping.decision == "approved",
            Mapping.proposal == "high_confidence",
            Dataset.status == "active",
            Dataset.evidence_class == "national_forecast",
            Dataset.period_start_year <= year,
            Dataset.period_end_year >= year,
            Evidence.geographic_scope == "national",
            Evidence.classification.in_(["in_demand", "hard_to_fill"]),
        )
    ).all()
    if not rows:
        return views
    signature = tuple(sorted(set(rows)))
    cached = _matching_views_cache
    if cached is not None and cached[0] is views and cached[1] == signature:
        return cached[2]
    titles = {}
    for code, title in rows:
        titles.setdefault(code, []).append(title.lower())
    enriched = [
        dict(
            view,
            career_keywords=list(
                dict.fromkeys([*view["career_keywords"], *titles.get(view["code"], [])])
            ),
        )
        for view in views
    ]
    # Reuse the list identity so the existing fuzzy keyword index stays warm.
    # Approval state is still queried on every call and included in the signature.
    _matching_views_cache = (views, signature, enriched)
    return enriched


def get_dataset(session, id):
    row = session.get(Dataset, id)
    if row is None:
        raise NotFoundError("Dataset not found.")
    return row


def import_bundle(session: Session, folder: Path):
    """Caller commits one whole bundle or rolls it all back. Existing versions are immutable."""
    files = [folder / "dataset.json", folder / "evidence.csv"]
    if (folder / "mappings.csv").exists():
        files.append(folder / "mappings.csv")
    fingerprint = hashlib.sha256(
        b"".join(f.name.encode() + b"\0" + f.read_bytes() for f in files)
    ).hexdigest()
    raw = json.loads(files[0].read_text(encoding="utf-8-sig"))
    meta = DatasetInput.model_validate(raw)
    dataset_key = f"{meta.source_id}@{meta.version}"
    # Serialize imports per source; concurrent repeat imports cannot create duplicate versions.
    session.exec(
        select(
            func.pg_advisory_xact_lock(func.hashtext("labor-market:" + meta.source_id))
        )
    ).all()
    existing = session.exec(select(Dataset).where(Dataset.key == dataset_key)).first()
    if existing:
        if existing.input_sha256 != fingerprint:
            raise ConflictError(
                "This version has different content. Import a new version; reviewed records are immutable."
            )
        return dict(
            dataset_id=existing.id,
            key=existing.key,
            unchanged=True,
            evidence=existing.record_count,
        )
    regions = set(session.exec(select(Region.code)).all())
    quals = {q.code: q.id for q in session.exec(select(Qualification)).all()}
    if meta.region_code and meta.region_code not in regions:
        raise InvalidRequestError("Unknown dataset region.")

    def csv_rows(file):
        with file.open(encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    evidence = []
    issues = []
    for n, row in enumerate(csv_rows(folder / "evidence.csv"), 2):
        try:
            row = {k: (v if v != "" else None) for k, v in row.items()}
            row["provenance"] = json.loads(row.get("provenance") or "{}")
            e = EvidenceInput.model_validate(row)
            if (
                e.geographic_scope != meta.geographic_scope
                or e.region_code != meta.region_code
            ):
                raise ValueError("Source/evidence geography mismatch")
            if e.period_label is None:
                e.period_label = meta.period_label
            if e.geographic_scope == "national" and e.region_code:
                raise ValueError("National evidence must not have a regional code")
            if meta.evidence_class == "observed_posting" and (
                e.classification != "observed_posting" or not e.observed_on
            ):
                raise ValueError(
                    "Posting requires a dated observation and posting classification"
                )
            if (
                meta.evidence_class != "observed_posting"
                and e.classification == "observed_posting"
            ):
                raise ValueError("Posting cannot be imported as a forecast")
            if (
                e.observed_on
                and not meta.period_start_year
                <= e.observed_on.year
                <= meta.period_end_year
            ):
                raise ValueError("Observed date outside reporting period")
            evidence.append(e)
        except Exception as ex:
            issues.append(f"evidence.csv row {n}: {ex}")
    mappings = []
    for n, row in enumerate(
        csv_rows(folder / "mappings.csv") if (folder / "mappings.csv").exists() else [],
        2,
    ):
        try:
            row["competencies"] = json.loads(row.get("competencies") or "[]")
            m = MappingInput.model_validate(row)
            if m.qualification_code not in quals:
                raise ValueError(
                    "Unknown catalog qualification " + m.qualification_code
                )
            mappings.append(m)
        except Exception as ex:
            issues.append(f"mappings.csv row {n}: {ex}")
    ekeys = [e.occurrence_key for e in evidence]
    mkeys = [m.mapping_key for m in mappings]
    pairs = [(m.occurrence_key, m.qualification_code) for m in mappings]
    if len(ekeys) != len(set(ekeys)):
        issues.append("Duplicate occurrence keys")
    if len(mkeys) != len(set(mkeys)) or len(pairs) != len(set(pairs)):
        issues.append("Duplicate mapping IDs or pairs")
    if any(m.occurrence_key not in set(ekeys) for m in mappings):
        issues.append("Mapping references missing occurrence")
    if issues:
        raise InvalidRequestError(
            "Import rejected atomically: " + "; ".join(issues[:20])
        )
    older = session.exec(
        select(Dataset).where(Dataset.source_id == meta.source_id)
    ).first()
    values = meta.model_dump(mode="json", exclude={"research", "metadata"})
    values["publication_date"] = meta.publication_date
    dataset = Dataset(
        **values,
        key=dataset_key,
        input_sha256=fingerprint,
        imported_at=utcnow(),
        record_count=len(evidence),
        status="retired" if older else "active",
        validation=dict(
            research=meta.research,
            metadata=meta.metadata,
            mappings=len(mappings),
            errors=0,
        ),
    )
    session.add(dataset)
    session.flush()
    ids = {}
    for e in evidence:
        data = e.model_dump(mode="json")
        data["observed_on"] = e.observed_on
        item = Evidence(
            **data, dataset_id=dataset.id, normalized_title=job_key(e.occupation_title)
        )
        session.add(item)
        session.flush()
        ids[e.occurrence_key] = item.id
    for m in mappings:
        data = m.model_dump(
            mode="json", exclude={"occurrence_key", "qualification_code"}
        )
        data["mapping_key"] = dataset_key + ":" + m.mapping_key
        session.add(
            Mapping(
                **data,
                evidence_id=ids[m.occurrence_key],
                qualification_id=quals[m.qualification_code],
                decision="rejected" if m.proposal == "rejected" else "pending",
            )
        )
    session.flush()
    return dict(
        dataset_id=dataset.id,
        key=dataset.key,
        unchanged=False,
        evidence=len(evidence),
        mappings=len(mappings),
        status=dataset.status,
    )


def decide(session: Session, mapping_id: int, request: ReviewInput, actor: Learner):
    row = session.exec(
        select(Mapping).where(Mapping.id == mapping_id).with_for_update()
    ).first()
    if row is None:
        raise NotFoundError("Mapping not found.")
    if row.decision != request.expected_decision:
        raise ConflictError(
            "Another reviewer changed this mapping. Refresh before reviewing."
        )
    if request.decision == "approved" and row.proposal != "high_confidence":
        raise InvalidRequestError(
            "Only high-confidence proposals are eligible. Manual/rejected proposals need a new evidence-reviewed dataset version; they cannot be activated here."
        )
    previous = row.decision
    row.decision = request.decision
    row.decided_by = actor.id
    row.decided_by_label = actor.full_name
    row.decided_at = utcnow()
    row.decision_note = request.note
    session.add(row)
    session.add(
        Review(
            mapping_id=row.id,
            dataset_id=session.get(Evidence, row.evidence_id).dataset_id,
            actor_id=actor.id,
            action="mapping_review",
            previous=previous,
            decision=row.decision,
            note=request.note,
        )
    )
    session.flush()
    return row


def set_dataset_status(session, id, status, note, actor):
    row = get_dataset(session, id)
    session.exec(
        select(
            func.pg_advisory_xact_lock(func.hashtext("labor-market:" + row.source_id))
        )
    ).all()
    if status == "active":
        for old in session.exec(
            select(Dataset).where(
                Dataset.source_id == row.source_id, Dataset.status == "active"
            )
        ).all():
            if old.id != row.id:
                old.status = "retired"
                session.add(old)
                session.add(
                    Review(
                        dataset_id=old.id,
                        actor_id=actor.id,
                        action="dataset_status",
                        previous="active",
                        decision="retired",
                        note=note,
                    )
                )
    previous = row.status
    row.status = status
    session.add(row)
    session.add(
        Review(
            dataset_id=row.id,
            actor_id=actor.id,
            action="dataset_status",
            previous=previous,
            decision=status,
            note=note,
        )
    )
    session.flush()
    return row


def indicators(session, qualification_code, region_code=None):
    if region_code and session.get(Region, region_code) is None:
        raise InvalidRequestError("Unknown region.")
    year = datetime.now(ZoneInfo("Asia/Manila")).year
    rows = session.exec(
        select(Mapping, Evidence, Dataset, Qualification)
        .join(Evidence, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .join(Qualification, Mapping.qualification_id == Qualification.id)
        .where(
            Qualification.code == qualification_code,
            Qualification.is_active == True,
            Mapping.decision == "approved",
            Mapping.proposal == "high_confidence",
            Dataset.status == "active",
            Dataset.evidence_class.in_(["national_forecast", "regional_forecast"]),
            Dataset.period_start_year <= year,
            Dataset.period_end_year >= year,
            Evidence.classification.in_(["in_demand", "hard_to_fill"]),
        )
    ).all()
    return [
        dict(
            mapping_id=m.id,
            occurrence_key=e.occurrence_key,
            occupation_key=e.normalized_title,
            occupation_title=e.occupation_title,
            sector=e.sector,
            relationship_scope=m.review_reason,
            scope_cautions=m.cautions,
            qualification_code=q.code,
            qualification_name=q.name,
            classification=e.classification,
            geographic_scope=e.geographic_scope,
            region_code=e.region_code,
            coverage_label=(
                "Philippines — National"
                if e.geographic_scope == "national"
                else session.get(Region, e.region_code).name
            ),
            period_label=d.period_label,
            publisher=d.publisher,
            source_title=d.title,
            source_url=e.source_url or d.source_url,
            source_reference="; ".join(
                x
                for x in [
                    e.source_table,
                    "PDF p. " + e.page_pdf if e.page_pdf else None,
                    "printed p. " + e.page_printed if e.page_printed else None,
                ]
                if x
            ),
            dataset_key=d.key,
        )
        for m, e, d, q in rows
        if e.geographic_scope == "national"
        or region_code is not None
        and e.region_code == region_code
    ]


def observed_postings(session, qualification_code, region_code=None):
    """Dated observations, kept separate from demand forecasts and personal-fit scoring.

    Return one representative per title/region/snapshot, with an explicit posting
    count. Raw source records and reviewed links remain independently auditable.
    """
    if region_code and session.get(Region, region_code) is None:
        raise InvalidRequestError("Unknown region.")
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    statement = (
        select(Mapping, Evidence, Dataset, Qualification)
        .join(Evidence, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .join(Qualification, Mapping.qualification_id == Qualification.id)
        .where(
            Qualification.code == qualification_code,
            Qualification.is_active == True,
            Mapping.decision == "approved",
            Mapping.proposal == "high_confidence",
            Dataset.status == "active",
            Dataset.evidence_class == "observed_posting",
            Evidence.classification == "observed_posting",
            Evidence.observed_on >= date(today.year, 1, 1),
            Evidence.observed_on <= today,
            Evidence.geographic_scope.in_(["regional", "local"]),
        )
        .order_by(Evidence.id)
    )
    if region_code:
        statement = statement.where(Evidence.region_code == region_code)
    regions = {r.code: r.name for r in session.exec(select(Region)).all()}
    found = {}
    for mapping, evidence, dataset, qualification in session.exec(statement).all():
        key = (evidence.normalized_title, evidence.region_code, evidence.observed_on)
        if key in found:
            found[key]["posting_count"] += 1
            continue
        found[key] = dict(
            mapping_id=mapping.id,
            occurrence_key=evidence.occurrence_key,
            occupation_key=evidence.normalized_title,
            occupation_title=evidence.occupation_title,
            sector=evidence.sector,
            relationship_scope=mapping.review_reason,
            scope_cautions=mapping.cautions,
            qualification_code=qualification.code,
            qualification_name=qualification.name,
            classification="observed_posting",
            geographic_scope=evidence.geographic_scope,
            region_code=evidence.region_code,
            coverage_label=regions[evidence.region_code],
            period_label=dataset.period_label,
            observed_on=evidence.observed_on.isoformat(),
            posted_on=evidence.provenance.get("posted_on"),
            posting_count=1,
            publisher=dataset.publisher,
            source_title=dataset.title,
            source_url=evidence.source_url or dataset.source_url,
            source_reference=evidence.source_table,
            dataset_key=dataset.key,
        )
    return list(found.values())


def mapping_public(session, m, e, d, q):
    history = session.exec(
        select(Review).where(Review.mapping_id == m.id).order_by(Review.id.desc())
    ).all()
    return dict(
        id=m.id,
        mapping_key=m.mapping_key,
        proposal=m.proposal,
        decision=m.decision,
        occupation_title=e.occupation_title,
        occurrence_key=e.occurrence_key,
        original_record_id=e.source_record_id,
        sector=e.sector,
        classification=e.classification,
        coverage=d.geographic_scope,
        region_code=e.region_code,
        period_label=d.period_label,
        evidence_class=d.evidence_class,
        source_url=e.source_url or d.source_url,
        source_title=d.title,
        source_reference="; ".join(
            x
            for x in [
                e.source_table,
                "PDF p. " + e.page_pdf if e.page_pdf else None,
                "printed p. " + e.page_printed if e.page_printed else None,
            ]
            if x
        ),
        qualification_code=q.code,
        qualification_name=q.name,
        review_reason=m.review_reason,
        competencies=m.competencies,
        evidence_tier=m.evidence_tier,
        training_regulation_url=m.training_regulation_url,
        training_regulation_reference=m.training_regulation_reference,
        cautions=m.cautions,
        provenance=e.provenance,
        dataset_id=d.id,
        dataset_key=d.key,
        dataset_status=d.status,
        decision_note=m.decision_note,
        history=[
            dict(
                id=h.id,
                actor_id=str(h.actor_id) if h.actor_id else None,
                at=h.created_at.isoformat(),
                previous=h.previous,
                decision=h.decision,
                note=h.note,
            )
            for h in history
        ],
    )
