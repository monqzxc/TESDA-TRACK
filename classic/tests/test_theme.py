"""Light and dark stay in step: a color added to one theme needs a value in the other. No app, no network.

Run with:
    .venv/Scripts/python -m pytest --confcutdir=classic/tests classic/tests/test_theme.py
"""
import re
import tomllib
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]


def css_block(css: str, selector: str) -> str:
    start = css.index(selector + " {")
    return css[start:css.index("\n}", start)]


def tokens(block: str) -> set[str]:
    return set(re.findall(r"(--track-[a-z0-9-]+):", block))


def test_streamlit_has_the_same_colors_in_light_and_dark():
    theme = tomllib.loads((FRONTEND / ".streamlit" / "config.toml").read_text(encoding="utf-8"))["theme"]
    light, dark = theme["light"], theme["dark"]
    assert set(light) == set(dark)
    assert set(light["sidebar"]) == set(dark["sidebar"])


def test_every_app_color_has_a_dark_value():
    css = (FRONTEND / "styles.css").read_text(encoding="utf-8")
    light, dark = tokens(css_block(css, ":root")), tokens(css_block(css, ':root[data-theme="dark"]'))
    assert light, "styles.css defines its colors on :root"
    assert light == dark
