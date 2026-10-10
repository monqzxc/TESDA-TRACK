import re
from functools import lru_cache


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().replace("’", "'")).strip()


@lru_cache(maxsize=4096)
def _phrase_pattern(phrase: str) -> re.Pattern:
    # The catalog has about 1,000 distinct keywords: more than re's own cache of 512 patterns holds, so without
    # this every keyword was compiled again on every request.
    return re.compile(r"\b" + re.escape(phrase) + r"\b")


def contains(text: str, phrase: str) -> bool:
    return _phrase_pattern(phrase).search(text) is not None


# Typo tolerance for single-word keywords. A keyword of 5+ letters also matches a goal word within one edit
# (two for 9+ letters). Candidates come from a deletion index built once per list of qualifications, then the
# true distance (insert, delete, substitute, swap neighbours) is checked, so near-word pairs stay out.
_WORD = re.compile(r"[^\W\d_]+")
_MIN_LETTERS = 5


def _allowed_edits(keyword: str) -> int:
    return 2 if len(keyword) >= 9 else 1


def _deletions(word: str, depth: int) -> set[str]:
    found, layer = {word}, {word}
    for _ in range(depth):
        layer = {w[:i] + w[i + 1:] for w in layer for i in range(len(w))}
        found |= layer
    return found


def _edit_distance(a: str, b: str) -> int:
    """Optimal string alignment distance: insert, delete, substitute, swap two neighbours."""
    previous2, previous = None, list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            cost = min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (ca != cb))
            if previous2 is not None and i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                cost = min(cost, previous2[j - 2] + 1)
            row.append(cost)
        previous2, previous = previous, row
    return previous[-1]


class FuzzyKeywords:
    def __init__(self, qualifications: list[dict]):
        keywords = {k for q in qualifications for k in q["career_keywords"]}
        # A goal word that is itself a catalog keyword word is never treated as a typo of another keyword.
        self.known = {w for k in keywords for w in _WORD.findall(k)}
        self.index: dict[str, set[str]] = {}
        for keyword in keywords:
            if len(keyword) >= _MIN_LETTERS and keyword.isalpha():
                for variant in _deletions(keyword, _allowed_edits(keyword)):
                    self.index.setdefault(variant, set()).add(keyword)

    def matches(self, text: str) -> dict[str, str]:
        """Keyword -> the goal word that is a near-miss of it (exact matches are left to `contains`)."""
        found: dict[str, str] = {}
        for word in set(_WORD.findall(text)):
            if len(word) < _MIN_LETTERS - 1 or len(word) > 40 or word in self.known:
                continue
            for variant in _deletions(word, 2 if len(word) >= 7 else 1):
                for keyword in self.index.get(variant, ()):
                    # Short keywords keep their first letter: that is where pilot/hilot and looking/cooking differ.
                    if (keyword not in found and (word[0] == keyword[0] or len(keyword) >= 9)
                            and _edit_distance(word, keyword) <= _allowed_edits(keyword)):
                        found[keyword] = word
        return found


_cached: tuple[list, FuzzyKeywords] | None = None


def fuzzy_matches(text: str, qualifications: list[dict]) -> dict[str, str]:
    """Near-miss keyword hits for `text`. The index is rebuilt only when given a different list (a new catalog snapshot)."""
    global _cached
    cached = _cached
    if cached is None or cached[0] is not qualifications:
        cached = _cached = (qualifications, FuzzyKeywords(qualifications))
    return cached[1].matches(text)
