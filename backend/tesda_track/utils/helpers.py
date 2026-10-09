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
