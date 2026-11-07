"""Create a least-privilege reviewer and clearly labelled fixture in the isolated LOCAL preview only.
Credentials are random and saved outside the repository; no default password or production account.
"""

import sys, os, json, secrets, csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.chdir(ROOT)
from tesda_track.config import get_settings
from sqlalchemy.engine import make_url

u = make_url(get_settings().database_url)
if (
    u.host not in ["127.0.0.1", "localhost"]
    or get_settings().environment == "production"
):
    raise RuntimeError("Local preview only")
os.environ["DATABASE_URL"] = u.set(
    database="tesda_track_phase5_preview"
).render_as_string(hide_password=False)
get_settings.cache_clear()
from tesda_track.db import get_engine
from sqlmodel import Session, select
from tesda_track.models import Learner, Role, utcnow
from tesda_track.security import hash_password
from tesda_track.services.labor_market import import_bundle
from tesda_track.models.labor_market import LaborMarketMapping as Mapping

private = Path.home() / ".codex/private/tesda-track-phase5-reviewer.json"
private.parent.mkdir(parents=True, exist_ok=True)
if private.exists():
    credentials = json.loads(private.read_text(encoding="utf-8"))
else:
    credentials = {
        "email": "phase5-reviewer@example.com",
        "password": secrets.token_urlsafe(32),
        "scope": "Isolated local Phase 5 preview only",
        "url": "http://127.0.0.1:5188/sign-in",
    }
    with private.open("x", encoding="utf-8") as f:
        json.dump(credentials, f, indent=2)
with Session(get_engine()) as s:
    role = s.get(Role, "labor_market_reviewer")
    if role is None:
        s.add(
            Role(
                key="labor_market_reviewer",
                label="Occupation mapping reviewer",
                permissions=["labor-market:review"],
                is_system=False,
            )
        )
        s.flush()
    user = s.exec(select(Learner).where(Learner.email == credentials["email"])).first()
    if user is None:
        user = Learner(
            email=credentials["email"],
            full_name="Isolated preview mapping reviewer",
            password_hash=hash_password(credentials["password"]),
            privacy_consent_at=utcnow(),
            role="labor_market_reviewer",
        )
        s.add(user)
    s.commit()
    folder = ROOT / "reports/phase5-20261106/demo-bundle"
    folder.mkdir(exist_ok=True)
    raw = ROOT / "backend/seed/sources/labor_market/dole-ble-national-jlmf-2025-2026-v1"

    def read(file):
        with (raw / file).open(encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    original = next(
        m
        for m in read("mappings.csv")
        if m["qualification_code"] == "EIM-NC-II" and m["proposal"] == "high_confidence"
    )
    e = next(
        e
        for e in read("evidence.csv")
        if e["occurrence_key"] == original["occurrence_key"]
    )
    e["occurrence_key"] = "DEMO-EIM-NATIONAL"
    e["source_record_id"] = "DEMO-ONLY"
    e["provenance"] = json.dumps(
        {
            "demo_only": True,
            "not_formal_approval": True,
            "original_occurrence_key": original["occurrence_key"],
        }
    )
    m = dict(
        original,
        mapping_key="DEMO-EIM-001",
        occurrence_key=e["occurrence_key"],
        review_reason="ISOLATED TEST FIXTURE ONLY. This tests the secure review workflow; not a formal approval of any Phase 4 proposal.",
    )
    meta = json.loads((raw / "dataset.json").read_text(encoding="utf-8"))
    meta.update(
        source_id="phase5-isolated-demo",
        title="LOCAL TEST FIXTURE — not a formal mapping approval",
        publisher="LOCAL TEST FIXTURE (DOLE excerpt)",
        notes="Local demonstration only. All real research mappings remain pending/rejected.",
    )
    (folder / "dataset.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    for name, row in [("evidence.csv", e), ("mappings.csv", m)]:
        with (folder / name).open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(row))
            w.writeheader()
            w.writerow(row)
    result = import_bundle(s, folder)
    s.commit()
    mapping = s.exec(
        select(Mapping).where(
            Mapping.mapping_key == "phase5-isolated-demo@1:DEMO-EIM-001"
        )
    ).one()
    (ROOT / "reports/phase5-20261106/demo-info.json").write_text(
        json.dumps(
            {
                "mapping_id": mapping.id,
                "fixture_only": True,
                "credentials_file": str(private),
                "reviewer_role": "labor_market_reviewer",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        "Fixture mapping ID:",
        mapping.id,
        "; real proposals not approved. Reviewer credentials saved outside repository:",
        private,
    )
