"""Provinces from posting localities, in the names the Skill Passport uses.

Posting records have no province column. Every PhilJobNet record's `locality` is "CITY, PROVINCE" (NCR ones are
"CITY, NCR, FIRST DISTRICT" and so on), so the province is the part after the last comma. Names are compared without
case, punctuation or a "PROVINCE OF" prefix, and old or variant names map to today's (`ALIASES`). All of NCR is one
province, "Metro Manila", which is also what the Skill Passport stores.

`normalize` returns the display name ("Davao del Sur", "Metro Manila"): the canonical one for the 82 provinces and
Metro Manila, otherwise the name as written in title case, so an unlisted province still compares with itself.
"""
import re
from functools import lru_cache

METRO_MANILA = "Metro Manila"

# Today's provinces by region, as the PSGC names them (BARMM's Maguindanao split in 2022).
PROVINCES = (
    METRO_MANILA,
    "Abra", "Apayao", "Benguet", "Ifugao", "Kalinga", "Mountain Province",  # CAR
    "Ilocos Norte", "Ilocos Sur", "La Union", "Pangasinan",  # I
    "Batanes", "Cagayan", "Isabela", "Nueva Vizcaya", "Quirino",  # II
    "Aurora", "Bataan", "Bulacan", "Nueva Ecija", "Pampanga", "Tarlac", "Zambales",  # III
    "Batangas", "Cavite", "Laguna", "Quezon", "Rizal",  # IV-A
    "Marinduque", "Occidental Mindoro", "Oriental Mindoro", "Palawan", "Romblon",  # MIMAROPA
    "Albay", "Camarines Norte", "Camarines Sur", "Catanduanes", "Masbate", "Sorsogon",  # V
    "Aklan", "Antique", "Capiz", "Guimaras", "Iloilo",  # VI
    "Negros Occidental", "Negros Oriental", "Siquijor",  # NIR
    "Bohol", "Cebu",  # VII
    "Biliran", "Eastern Samar", "Leyte", "Northern Samar", "Samar", "Southern Leyte",  # VIII
    "Zamboanga del Norte", "Zamboanga del Sur", "Zamboanga Sibugay",  # IX
    "Bukidnon", "Camiguin", "Lanao del Norte", "Misamis Occidental", "Misamis Oriental",  # X
    "Davao de Oro", "Davao del Norte", "Davao del Sur", "Davao Occidental", "Davao Oriental",  # XI
    "Cotabato", "Sarangani", "South Cotabato", "Sultan Kudarat",  # XII
    "Agusan del Norte", "Agusan del Sur", "Dinagat Islands", "Surigao del Norte", "Surigao del Sur",  # XIII
    "Basilan", "Lanao del Sur", "Maguindanao del Norte", "Maguindanao del Sur", "Sulu", "Tawi-Tawi",  # BARMM
)

# Old or variant names (already in key form, see `key`) -> today's name.
ALIASES = {
    # NCR has no provinces: PhilJobNet gives its district, the Skill Passport "Metro Manila".
    "first district": METRO_MANILA,
    "second district": METRO_MANILA,
    "third district": METRO_MANILA,
    "fourth district": METRO_MANILA,
    "ncr": METRO_MANILA,
    "national capital region": METRO_MANILA,
    "metropolitan manila": METRO_MANILA,
    "manila": METRO_MANILA,
    "compostela valley": "Davao de Oro",
    "western samar": "Samar",  # "SAMAR (WESTERN SAMAR)" loses its brackets in `key`
    "north cotabato": "Cotabato",
    "mt province": "Mountain Province",
}

_SMALL_WORDS = frozenset({"de", "del", "y"})
_BRACKETS = re.compile(r"\(.*$")  # "SAMAR (WESTERN SAMAR)", and a cut-off "SAMAR (WESTERN SAMAR"
_PUNCTUATION = re.compile(r"[.\-_/]+")


def key(name: str) -> str:
    """The form names are compared in: no case, brackets, punctuation, "province of" or extra spaces."""
    text = _PUNCTUATION.sub(" ", _BRACKETS.sub("", name.casefold()))
    text = " ".join(text.split())
    return text.removeprefix("province of ").strip()


_CANONICAL = {key(name): name for name in PROVINCES}


@lru_cache(maxsize=4096)
def normalize(name: str | None) -> str | None:
    """The display name of a province as written anywhere (Skill Passport, center, posting), or None for blank."""
    if not name:
        return None
    found = key(name)
    if not found:
        return None
    if found in ALIASES:
        return ALIASES[found]
    if found in _CANONICAL:
        return _CANONICAL[found]
    words = found.split()
    return " ".join(w if i and w in _SMALL_WORDS else w.capitalize() for i, w in enumerate(words))


def of_locality(locality: str | None) -> str | None:
    """The province of a posting's "CITY, PROVINCE" locality: its part after the last comma."""
    if not locality:
        return None
    return normalize(locality.rsplit(",", 1)[-1])


def same(a: str | None, b: str | None) -> bool:
    found = normalize(a)
    return found is not None and found == normalize(b)
