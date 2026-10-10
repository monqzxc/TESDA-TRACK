"""Small, escaped presentation components; interactive controls stay in Streamlit."""
from html import escape
from base64 import b64encode
from functools import cache
from io import BytesIO
from pathlib import Path
import re

from PIL import Image
import streamlit as st

ASSETS = Path(__file__).with_name("assets")
FAVICON = ASSETS / "tesda-track-favicon.png"


def html_with_vectors(markup: str) -> None:
    # st.html sanitizes inline SVG. Data images keep this local vector artwork
    # intact without JavaScript, external assets, or an icon-font dependency.
    def svg_image(match):
        svg = match.group(0)
        if 'xmlns=' not in svg:
            svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
        data = b64encode(svg.encode("utf-8")).decode("ascii")
        return f'<img src="data:image/svg+xml;base64,{data}" alt="" aria-hidden="true">'
    st.html(re.sub(r"<svg\b.*?</svg>", svg_image, markup, flags=re.DOTALL))


def icon(name: str, color: str = "#175CD3") -> str:
    paths = {
        "route": '<path d="M5 19h5a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h10m-4 0 4 0 0 4"/><circle cx="5" cy="19" r="2"/>',
        "learn": '<path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6m4-3v9"/>',
        "award": '<circle cx="12" cy="8" r="5"/><path d="m8 12-2 9 6-3 6 3-2-9"/>',
        "growth": '<path d="M4 19V5m0 14h16M7 14l5-5 4 3 5-7m-5 0h5v5"/>',
        "search": '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
        "cloud": '<path d="M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10h-1M12 13v4m0 3v1"/>',
        "target": '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 9-9m-4 0h4v4"/>',
        "person": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
        "compass": '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
        "bars": '<rect x="4" y="13" width="4" height="7" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/>'
                '<rect x="16" y="3" width="4" height="17" rx="1"/>',
        "document": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/>'
                    '<path d="M14 3v5h5M9 13h6M9 17h6"/>',
    }
    return ('<svg viewBox="0 0 24 24" width="24" height="24" fill="none" '
            f'stroke="{color}" stroke-width="1.7" stroke-linecap="round" '
            f'stroke-linejoin="round" aria-hidden="true">{paths.get(name, paths["route"])}</svg>')


@cache
def logo_data_uri(size: int = 96) -> str:
    # The brand is resent on every rerun, so embed a high-DPI copy of the
    # 320px logo (about 12 KB) rather than the 60 KB original.
    logo = Image.open(ASSETS / "TESDA-TRACK-logo.png")
    logo.thumbnail((size, size), Image.LANCZOS)
    png = BytesIO()
    logo.save(png, format="PNG", optimize=True)
    return "data:image/png;base64," + b64encode(png.getvalue()).decode("ascii")


def brand(sidebar: bool = False) -> None:
    st.html(f'<div class="{"sidebar-brand" if sidebar else "brand-bar"}">'
            f'<div class="brand"><span class="brand-icon"><img src="{logo_data_uri()}" alt=""></span>'
            'TESDA<span class="brand-light">TRACK</span></div>'
            + ('<div class="brand-tagline">Your skills. Your next chapter.</div>' if sidebar else
               '<span class="prototype-badge">LEARNER PORTAL · PILOT</span>') + '</div>')


def hero() -> None:
    html_with_vectors('''<section class="hero"><div class="hero-copy">
    <div class="eyebrow">BUILD SKILLS. OPEN POSSIBILITIES.</div>
    <h1>Your next step<br>starts <span>here.</span></h1>
    <p>A new skill. A recognized qualification. A clearer future.<br>Find a training or assessment pathway that starts with you.</p>
    <div class="hero-tags"><span>Explore your options</span><span>Build on your experience</span></div>
    </div><div class="hero-art" aria-hidden="true">
    <svg viewBox="0 0 350 250" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="200" cy="126" r="110" stroke="white" stroke-opacity=".10"/>
    <circle cx="200" cy="126" r="78" stroke="white" stroke-opacity=".10"/>
    <path d="M28 218H87C115 218 124 175 153 175H179C207 175 211 109 244 109H262C292 109 299 52 321 38" stroke="#55D5CF" stroke-opacity=".18" stroke-width="30"/>
    <path d="M28 218H87C115 218 124 175 153 175H179C207 175 211 109 244 109H262C292 109 299 52 321 38" stroke="#63E0CD" stroke-width="3"/>
    <path d="m302 40 20-4-1 21" stroke="#63E0CD" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="10" y="140" width="130" height="56" rx="12" fill="#FFFFFF"/>
    <circle cx="35" cy="168" r="14" fill="#E9F1FF"/><path d="m28 168 5 4 9-9" stroke="#175CD3" stroke-width="2"/>
    <text x="58" y="164" fill="#53637D" font-size="10" font-family="sans-serif">START WITH</text>
    <text x="58" y="180" fill="#102A56" font-size="13" font-weight="600" font-family="sans-serif">Your goal</text>
    <rect x="144" y="58" width="144" height="57" rx="12" fill="#FFFFFF"/>
    <circle cx="169" cy="86" r="14" fill="#E2F7F0"/><path d="m162 86 5 4 9-9" stroke="#087E69" stroke-width="2"/>
    <text x="192" y="82" fill="#53637D" font-size="10" font-family="sans-serif">MOVE TOWARD</text>
    <text x="192" y="98" fill="#102A56" font-size="13" font-weight="600" font-family="sans-serif">Your future</text>
    <circle cx="155" cy="175" r="6" fill="#63E0CD"/><circle cx="263" cy="109" r="6" fill="#63E0CD"/>
    </svg></div></section>''')


def features() -> None:
    items = [("learn", "Find your direction", "Training that fits your goals"),
             ("award", "Recognize your skills", "Explore assessment pathways"),
             ("growth", "See your progress", "Keep your next steps in view")]
    html_with_vectors('<div class="feature-strip">' + ''.join(
        f'<div class="feature-item">{icon(symbol)}<div class="feature-copy"><strong>{title}</strong>'
        f'<span>{copy}</span></div></div>' for symbol, title, copy in items) + '</div>')


def section_header(kicker: str, title: str, description: str, level: int = 1) -> None:
    heading = "h2" if level == 2 else "h1"
    html_with_vectors(f'<div class="section-heading"><div class="section-kicker">{escape(kicker)}</div>'
            f'<{heading}>{escape(title)}</{heading}><p>{escape(description)}</p></div>')


def empty_state(title: str, description: str, symbol: str = "route") -> None:
    html_with_vectors(f'<div class="empty-state"><span class="empty-icon">{icon(symbol)}</span>'
            f'<h3>{escape(title)}</h3><p>{escape(description)}</p></div>')


# The banner's four steps, one per Find my pathway tab, each with its own colour (styles.css tints the number).
JOURNEY_STEPS = [
    ("target", "#175CD3", "Tell us your goal", "Start with what you want to do, or what you already know."),
    ("person", "#7054BF", "A little thing about you", "Share your experience so we can find the right fit."),
    ("bars", "#0D9488", "Build your confidence", "Check your readiness and find skills to develop."),
    ("compass", "#B65B14", "Explore a pathway", "See whether training or an NC assessment comes next."),
]


def journey() -> None:
    """A banner above every Find my pathway step: the heading, then its four steps in a row."""
    steps = "".join(
        f'<div class="journey-step"><span class="journey-number">{number:02d}</span><div class="journey-step-body">'
        f'{icon(symbol, color)}<div><strong>{title}</strong><p>{text}</p></div></div></div>'
        for number, (symbol, color, title, text) in enumerate(JOURNEY_STEPS, start=1))
    html_with_vectors('<aside class="journey-card"><div class="journey-head"><div class="eyebrow">YOUR JOURNEY, SIMPLIFIED</div>'
                      '<h3>A little direction.<br><span>A world of possibilities.</span></h3>'
                      '<p class="journey-lead">Discover TESDA qualifications, find the right training, and take the next '
                      'step toward the career you want.</p></div>'
                      f'<div class="journey-steps">{steps}</div></aside>')


def step_heading(kicker: str, title: str, description: str, symbol: str) -> None:
    """A step's opening: its icon in a tile beside the kicker, title and description."""
    html_with_vectors(f'<div class="step-heading"><span class="step-heading-icon">{icon(symbol)}</span><div>'
                      f'<div class="section-kicker">{escape(kicker)}</div><h1>{escape(title)}</h1>'
                      f'<p>{escape(description)}</p></div></div>')


def last_goal(query: str) -> None:
    html_with_vectors(f'<div class="goal-last"><span class="goal-last-icon">{icon("document")}</span><div>'
                      f'<strong>Your last submitted goal</strong><p>{escape(query)}</p></div></div>')


def footer() -> None:
    html_with_vectors('<footer class="app-footer"><strong>TESDA TRACK</strong><span>Training · Assessment · Career pathways</span>'
            '<p>Pilot experience. Match scores are guidance; readiness checks are self-reported and do not replace an official competency assessment.</p></footer>')
