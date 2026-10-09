"""(query, passage) pairs for fine-tuning, built from catalog text only.

Each qualification's passage is exactly what the API embeds; its queries are the names, jobs, keywords and
competencies a learner might type, plus a few English and Filipino goal phrasings over the jobs and keywords.
Evaluation goals are excluded so the held-out numbers stay honest.
"""
import json
from pathlib import Path

from tesda_track.models import Qualification
from tesda_track.services.embeddings import qualification_text
from tesda_track.utils.helpers import normalize

GOALS_PATH = Path(__file__).resolve().parent / "data" / "eval_goals.json"
TEMPLATES = ("I want to be a {x}", "I want to work as a {x}", "gusto kong maging {x}", "may karanasan ako bilang {x}",
             "marunong ako sa {x}")


def _queries(qualification: Qualification) -> list[str]:
    terms = [*qualification.possible_jobs, *qualification.career_keywords]
    queries = [qualification.name, qualification.skill_label or "", *terms,
               *(c.name for c in qualification.competencies if c.is_active),
               *(template.format(x=term) for term in terms for template in TEMPLATES)]
    return list(dict.fromkeys(normalize(query) for query in queries if query.strip()))


def training_pairs(qualifications: list[Qualification], exclude: set[str]) -> list[tuple[str, str]]:
    """Every query of every qualification with its passage, minus queries that equal an excluded goal."""
    pairs = []
    for qualification in qualifications:
        passage = qualification_text(qualification)
        pairs.extend((query, passage) for query in _queries(qualification) if query not in exclude)
    return pairs


def eval_exclusions(path: Path = GOALS_PATH) -> set[str]:
    return {normalize(goal["goal"]) for goal in json.loads(path.read_text(encoding="utf-8"))}
