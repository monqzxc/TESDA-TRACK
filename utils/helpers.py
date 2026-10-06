import json
import re
from pathlib import Path


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().replace("’", "'")).strip()


def contains(text: str, phrase: str) -> bool:
    return bool(re.search(r"\b" + re.escape(phrase) + r"\b", text))


def load_qualifications() -> list[dict]:
    path = Path(__file__).resolve().parents[1] / "data" / "qualifications.json"
    with path.open(encoding="utf-8") as source:
        return json.load(source)
