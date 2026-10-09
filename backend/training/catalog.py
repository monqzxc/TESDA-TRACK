"""The committed catalog as in-memory objects, so the evaluation needs no database."""
import json
from pathlib import Path

from tesda_track.models import Competency, Qualification, Sector
from tesda_track.seed import SEED_DIR, parse_catalog
from tesda_track.services.catalog import CatalogItem, catalog_item


def load_catalog(path: Path = SEED_DIR / "qualifications.json") -> tuple[list[Qualification], list[CatalogItem]]:
    """Transient qualifications (ids 1..N in file order, never added to a session) and their catalog items."""
    sectors: dict[str, Sector] = {}
    qualifications = []
    competency_id = 0
    for number, entry in enumerate(parse_catalog(json.loads(path.read_text(encoding="utf-8"))), start=1):
        sector = sectors.setdefault(entry.sector, Sector(name=entry.sector))
        qualification = Qualification(id=number, code=entry.code, name=entry.name, sector=sector,
                                      skill_label=entry.skill_label, career_keywords=entry.career_keywords,
                                      possible_jobs=entry.possible_jobs, is_active=True)
        for c in entry.competencies:
            competency_id += 1
            Competency(id=competency_id, position=c.id, name=c.name, category=c.category, is_active=True,
                       qualification=qualification)
        qualifications.append(qualification)
    return qualifications, [catalog_item(q) for q in qualifications]
