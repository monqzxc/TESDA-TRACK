"""The province of a posting's locality, in the Skill Passport's names (services/provinces)."""
import pytest

from tesda_track.services import provinces


@pytest.mark.parametrize("locality, expected", [
    ("ANGELES CITY, PAMPANGA", "Pampanga"),
    ("CITY OF SAN PEDRO, LAGUNA", "Laguna"),
    ("CITY OF DAVAO, DAVAO DEL SUR", "Davao del Sur"),
    ("CAGAYAN DE ORO CITY, MISAMIS ORIENTAL", "Misamis Oriental"),
    ("LA TRINIDAD, BENGUET", "Benguet"),
    ("SAN FERNANDO, LA UNION", "La Union"),
    # The part after the last comma, whatever comes before it.
    ("CITY OF MAKATI, NCR, FOURTH DISTRICT", "Metro Manila"),
    ("CITY OF MANILA, NCR, FIRST DISTRICT", "Metro Manila"),
    ("QUEZON CITY, NCR, SECOND DISTRICT", "Metro Manila"),
    ("CALOOCAN CITY, NCR, THIRD DISTRICT", "Metro Manila"),
    # Old and variant names.
    ("NABUNTURAN, COMPOSTELA VALLEY", "Davao de Oro"),
    ("CATBALOGAN CITY, SAMAR (WESTERN SAMAR)", "Samar"),
    ("CALBAYOG CITY, SAMAR (WESTERN SAMAR", "Samar"),  # cut off in the snapshot
    ("KIDAPAWAN CITY, NORTH COTABATO", "Cotabato"),
    ("BONTOC, MT. PROVINCE", "Mountain Province"),
    ("JOLO, PROVINCE OF SULU", "Sulu"),
    ("BONGAO, TAWI TAWI", "Tawi-Tawi"),
])
def test_locality_gives_the_display_name(locality, expected):
    assert provinces.of_locality(locality) == expected


@pytest.mark.parametrize("name", ["laguna", "LAGUNA", "  Laguna ", "Province of Laguna", "PROVINCE OF LAGUNA"])
def test_names_compare_without_case_or_prefix(name):
    assert provinces.normalize(name) == "Laguna"
    assert provinces.same(name, "LAGUNA")


def test_skill_passport_names_are_already_display_names():
    for name in ("Metro Manila", "Benguet", "Cebu", "Davao del Sur", "Iloilo", "Laguna", "Maguindanao del Norte",
                 "Pampanga"):
        assert provinces.normalize(name) == name


def test_ncr_spellings_are_metro_manila():
    for name in ("NCR", "National Capital Region", "METRO MANILA", "Metropolitan Manila"):
        assert provinces.normalize(name) == provinces.METRO_MANILA


def test_blank_and_unlisted_names():
    assert provinces.of_locality(None) is None and provinces.of_locality("") is None
    assert provinces.normalize("  ") is None and provinces.normalize(None) is None
    assert not provinces.same(None, None)
    # Not a province we know: title case, so it still matches itself and nothing else.
    assert provinces.normalize("ATLANTIS DEL MAR") == "Atlantis del Mar"
    assert provinces.of_locality("SOMEWHERE") == "Somewhere"
    assert not provinces.same("Atlantis", "Laguna")


def test_every_listed_province_and_alias_is_its_own_display_name():
    assert len(provinces.PROVINCES) == 83  # 82 provinces and Metro Manila
    for name in provinces.PROVINCES:
        assert provinces.normalize(name.upper()) == name
    assert set(provinces.ALIASES.values()) <= set(provinces.PROVINCES)
