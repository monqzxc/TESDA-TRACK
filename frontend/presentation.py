"""Small, escaped presentation components; interactive controls stay in Streamlit."""
from html import escape
from base64 import b64encode
import re

import streamlit as st


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
    }
    return ('<svg viewBox="0 0 24 24" width="24" height="24" fill="none" '
            f'stroke="{color}" stroke-width="1.7" stroke-linecap="round" '
            f'stroke-linejoin="round" aria-hidden="true">{paths.get(name, paths["route"])}</svg>')


def brand(sidebar: bool = False) -> None:
    html_with_vectors(f'<div class="{"sidebar-brand" if sidebar else "brand-bar"}">'
            f'<div class="brand"><span class="brand-icon">{icon("route", "#FFFFFF")}</span>'
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


def journey(count: int) -> None:
    html_with_vectors(f'''<aside class="journey-card"><div class="eyebrow">YOUR JOURNEY, SIMPLIFIED</div>
    <h3>A little direction.<br>A world of possibilities.</h3>
    <div class="journey-step"><span>01</span><div><strong>Tell us your goal</strong><p>Start with what you want to do, or what you already know.</p></div></div>
    <div class="journey-step"><span>02</span><div><strong>Explore your pathway</strong><p>Discover qualifications and a suggested next step.</p></div></div>
    <div class="journey-step"><span>03</span><div><strong>Build your confidence</strong><p>Check your readiness and find skills to develop.</p></div></div>
    <div class="journey-note">{count} qualifications to explore · At your own pace</div></aside>''')


def footer() -> None:
    html_with_vectors('<footer class="app-footer"><strong>TESDA TRACK</strong><span>Training · Assessment · Career pathways</span>'
            '<p>Pilot experience. Match scores are guidance; readiness checks are self-reported and do not replace an official competency assessment.</p></footer>')
