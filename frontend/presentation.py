"""Small, escaped presentation components; interactive controls stay in Streamlit."""
from html import escape
from base64 import b64encode
from functools import cache
from io import BytesIO
from pathlib import Path
import re

from PIL import Image, ImageOps
import streamlit as st

ASSETS = Path(__file__).with_name("assets")
FAVICON = ASSETS / "tesda-track-favicon.png"
# A qualification shows its trade when there is a photo for it, and its sector's tile otherwise.
TRADE_PHOTOS = (("weld", ASSETS / "training" / "welding-training-illustration.png"),
                ("electric", ASSETS / "training" / "electrical-training-illustration.png"))
# Sector tiles: (words in the sector name, icon, gradient start, gradient end). The first family that matches wins,
# so "Automotive and Land Transportation" is a car before "transport" makes it a truck.
SECTOR_ART = (
    (("construction",), "helmet", "#e3912f", "#b4621a"),
    (("agri", "fish"), "sprout", "#4caf6e", "#2b7a48"),
    (("metal",), "wrench", "#5b7aa3", "#33507a"),
    (("health", "social"), "heart", "#e0607a", "#ac3651"),
    (("touris",), "cloche", "#7b61d6", "#5038a3"),
    (("information", "communication"), "monitor", "#2f6fe0", "#1a4aa8"),
    (("automotive",), "car", "#4f6fa0", "#2c4772"),
    (("electric",), "bolt", "#e0a12f", "#b0701a"),
    (("utilit",), "drop", "#17a2a0", "#0c6f6c"),
    (("maritime",), "anchor", "#2f7fd0", "#1a5296"),
    (("heating", "refrigeration"), "fan", "#22a3b5", "#13707e"),
    (("food", "beverage"), "cup", "#d9822f", "#a85a18"),
    (("creative", "visual", "media", "decorative"), "palette", "#9a5fd0", "#6a3aa0"),
    (("garment", "furniture"), "shirt", "#d0607f", "#9e3a58"),
    (("logistic", "transport", "trading"), "truck", "#3c79c9", "#24528f"),
)
DEFAULT_SECTOR_ART = ("learn", "#2f6fe0", "#1a4aa8")


def svg_uri(svg: str) -> str:
    if 'xmlns=' not in svg:
        svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    return "data:image/svg+xml;base64," + b64encode(svg.encode("utf-8")).decode("ascii")


def html_with_vectors(markup: str, **options) -> None:
    # st.html sanitizes inline SVG. Data images keep this local vector artwork
    # intact without JavaScript, external assets, or an icon-font dependency.
    def svg_image(match):
        return f'<img src="{svg_uri(match.group(0))}" alt="" aria-hidden="true">'
    st.html(re.sub(r"<svg\b.*?</svg>", svg_image, markup, flags=re.DOTALL), **options)


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
        "clipboard": '<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>'
                     '<rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M8.5 11h7M8.5 15h7"/>',
        "briefcase": '<rect x="3" y="7" width="18" height="13" rx="2"/>'
                     '<path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18M10.5 12.5v1.5h3v-1.5"/>',
        "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        "sparkle": '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" '
                   'fill="currentColor"/><path d="M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5'
                   ' 1.5-.2 2.2-.9 2.5-2.5Z" fill="currentColor"/>',
        "check": '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.5"/>',
        "lightbulb": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
        "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
        "checklist": '<path d="m4 6 1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9"/>',
        "pin": '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
        "network": '<circle cx="12" cy="12" r="2.6"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/>'
                   '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/>'
                   '<path d="m6.6 7.3 3.3 3.1M17.4 7.3l-3.3 3.1M6.6 16.7l3.3-3.1M17.4 16.7l-3.3-3.1"/>',
        # Sector tiles.
        "helmet": '<path d="M3 18h18M5 18v-2.5a7 7 0 0 1 14 0V18M10 8.8V6h4v2.8"/>',
        "sprout": '<path d="M12 21v-9M12 12c0-4.2 3-7 8-7 0 5-3 7.6-8 7.6M12 14.5c0-3-2.2-5-6.2-5 0 3.2 2.3 5 6.2 5"/>',
        "wrench": '<path d="M14.7 6.3a4 4 0 0 0 5 5L11.5 19.5a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 1-2-2Z"/>',
        "heart": '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'
                 '<path d="M8 12h2l1-2 2 4 1-2h2"/>',
        "cloche": '<path d="M3.5 17.5h17M5.5 17.5a6.5 6.5 0 0 1 13 0M12 9V7M10.5 7h3"/>',
        "monitor": '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
        "car": '<path d="M3.5 16v-3l2-5.5h13l2 5.5v3Z"/><path d="M3.5 13h17"/>'
               '<circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
        "bolt": '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
        "drop": '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
        "anchor": '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8.5 10h7"/>',
        "fan": '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2c0-4.2 1-7.2 3.2-7.2 3 0 2.6 4.6-1.4 7.6'
               'M13.6 13c3.6 2.1 5.6 4.5 4.5 6.4-1.5 2.6-5.5.6-6-4.4M10.4 13c-3.6 2.1-6.6 2.6-7.7.7-1.5-2.6 2.3-5.2'
               ' 6.8-3.2"/>',
        "cup": '<path d="M5 8h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8ZM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8.5 3v2M12 3v2"/>',
        "palette": '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.6-.8 1.3-1.7-.4-1.2.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4'
                   'c0-5.5-4-10-9-10Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/>'
                   '<circle cx="15" cy="7.5" r="1"/>',
        "shirt": '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z"/>',
        "truck": '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
    }
    return ('<svg viewBox="0 0 24 24" width="24" height="24" fill="none" '
            f'color="{color}" stroke="{color}" stroke-width="1.7" stroke-linecap="round" '
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


@cache
def photo_uri(path: Path, width: int = 480, height: int = 300) -> str:
    """A cropped, compressed copy of a photo for a card. Sent with every run, so kept to a few dozen KB."""
    image = ImageOps.fit(Image.open(path).convert("RGB"), (width, height), Image.LANCZOS)
    jpeg = BytesIO()
    image.save(jpeg, format="JPEG", quality=78, optimize=True)
    return "data:image/jpeg;base64," + b64encode(jpeg.getvalue()).decode("ascii")


# A learner in a hoodie, for avatars (80-unit grid). Each SVG becomes its own image, so the clip id can't clash.
PERSON = ('<clipPath id="face"><circle cx="40" cy="40" r="40"/></clipPath><circle cx="40" cy="40" r="40" fill="#dce8fd"/>'
          '<g clip-path="url(#face)"><path d="M12 84c1-17 13-26 28-26s27 9 28 26Z" fill="#3a6ad4"/>'
          '<path d="M30 60c3 6 17 6 20 0" stroke="#2a52ad" stroke-width="3"/>'
          '<rect x="34" y="47" width="12" height="12" rx="5" fill="#eebd98"/>'
          '<ellipse cx="40" cy="37" rx="12.5" ry="14" fill="#f6cfae"/>'
          '<path d="M27 36c-2-12 5-19 14-19 10 0 15 7 13 18-2-4-6-8-11-8-4 3-10 5-16 9Z" fill="#1f2b55"/>'
          '<circle cx="35.5" cy="39" r="1.5" fill="#1f2b55"/><circle cx="44.5" cy="39" r="1.5" fill="#1f2b55"/>'
          '<path d="M36.5 45c2 1.6 5 1.6 7 0" stroke="#c0604f" stroke-width="1.5" stroke-linecap="round"/></g>')
LEAVES = ('<path d="M70 120C44 86 46 44 74 16c19 32 17 72-4 104Z" fill="#5bb8a6"/>'
          '<path d="M78 124c4-42 30-72 70-80-5 38-30 68-70 80Z" fill="#8fd0b5"/>'
          '<path d="M62 126C25 112 4 82 4 44c35 10 57 42 58 82Z" fill="#a8c8f6"/>'
          '<path d="M70 120c0-30 3-62 4-104" stroke="#3f9887" stroke-width="2"/>')
# The banner's scene, drawn to sit behind the three journey cards at its bottom left (1000 x 300 units).
JOURNEY_SCENE = (
    '<svg viewBox="0 0 1000 300" fill="none" stroke-linecap="round" stroke-linejoin="round">'
    '<ellipse cx="860" cy="150" rx="210" ry="190" fill="#dbe7ff" opacity=".7"/>'
    '<circle cx="470" cy="80" r="100" fill="#e6efff" opacity=".9"/>'
    '<g fill="#d2e0f8"><rect x="600" y="168" width="46" height="132" rx="4"/><rect x="652" y="128" width="38" height="172" rx="4"/>'
    '<rect x="696" y="186" width="54" height="114" rx="4"/><rect x="760" y="150" width="34" height="150" rx="4"/>'
    '<rect x="946" y="160" width="40" height="140" rx="4"/></g>'
    '<g fill="#e6eefb"><rect x="566" y="206" width="40" height="94" rx="4"/><rect x="904" y="196" width="44" height="104" rx="4"/></g>'
    '<g fill="#fff" opacity=".7"><rect x="662" y="142" width="7" height="9" rx="1.5"/><rect x="675" y="142" width="7" height="9" rx="1.5"/>'
    '<rect x="662" y="160" width="7" height="9" rx="1.5"/><rect x="675" y="160" width="7" height="9" rx="1.5"/>'
    '<rect x="770" y="164" width="6" height="8" rx="1.5"/><rect x="780" y="164" width="6" height="8" rx="1.5"/></g>'
    f'<g transform="translate(170 18)">{LEAVES}</g>'
    # The graduation cap.
    '<g transform="translate(372 30)"><path d="M0 40 66 14l66 26-66 26Z" fill="#2f63d8"/>'
    '<path d="M26 51v22c0 13 80 13 80 0V51L66 66Z" fill="#1d47a8"/>'
    '<path d="M66 40h46v32" stroke="#f5b83d" stroke-width="3.5"/><circle cx="112" cy="76" r="5.5" fill="#f5b83d"/></g>'
    # A route card with its pin.
    '<g transform="rotate(-6 614 82)"><rect x="548" y="30" width="132" height="104" rx="16" fill="#cfe0fc" stroke="#fff" stroke-width="3"/>'
    '<path d="M572 112c16-4 20-28 38-28s20 20 42-8" stroke="#2f63d8" stroke-width="3.5" stroke-dasharray="1 8"/>'
    '<circle cx="572" cy="112" r="6" fill="#2f63d8"/></g>'
    '<path d="M658 86c-14-14-22-26-22-38a22 22 0 0 1 44 0c0 12-8 24-22 38Z" fill="#ef5b5b"/><circle cx="658" cy="48" r="8" fill="#fff"/>'
    # A progress chart card.
    '<g transform="rotate(7 760 66)"><rect x="712" y="24" width="100" height="84" rx="14" fill="#dbe7fd" stroke="#fff" stroke-width="3"/>'
    '<rect x="728" y="74" width="13" height="20" rx="3" fill="#a9c5f7"/><rect x="746" y="60" width="13" height="34" rx="3" fill="#7fa7f2"/>'
    '<rect x="764" y="50" width="13" height="44" rx="3" fill="#5a8cec"/><rect x="782" y="38" width="13" height="56" rx="3" fill="#2f63d8"/></g>'
    # A learner's profile card, ticking off steps.
    '<g transform="rotate(-4 906 158)"><rect x="826" y="66" width="160" height="182" rx="18" fill="#fff"/>'
    f'<g transform="translate(842 84) scale(.675)">{PERSON}</g>'
    '<rect x="906" y="96" width="62" height="10" rx="5" fill="#c7d7f4"/><rect x="906" y="114" width="40" height="8" rx="4" fill="#e1e9f8"/>'
    '<circle cx="852" cy="166" r="9" fill="#2fb37f"/><path d="m847.5 166 3 3 5.5-6" stroke="#fff" stroke-width="2.2"/>'
    '<rect x="870" y="161" width="96" height="9" rx="4.5" fill="#e6edf9"/>'
    '<circle cx="852" cy="194" r="9" fill="#2fb37f"/><path d="m847.5 194 3 3 5.5-6" stroke="#fff" stroke-width="2.2"/>'
    '<rect x="870" y="189" width="78" height="9" rx="4.5" fill="#e6edf9"/>'
    '<circle cx="852" cy="222" r="8" stroke="#c7d7f4" stroke-width="2.4"/><rect x="870" y="217" width="88" height="9" rx="4.5" fill="#eef2f9"/></g>'
    # A medal.
    '<g transform="translate(822 226)"><path d="M-12 8-18 42l18-9 18 9-6-34Z" fill="#2f63d8"/><circle r="22" fill="#f5b83d"/>'
    '<circle r="15" fill="#ffd36b"/><path d="m0-8 2.6 5.3 5.8.8-4.2 4.1 1 5.8L0 5.2-5.2 8l1-5.8-4.2-4.1 5.8-.8Z" fill="#e08f12"/></g>'
    '<path d="M1004 304c-42-8-66-44-62-92 36 14 58 48 62 92Z" fill="#5bb8a6"/>'
    '<path d="M998 304c-8-40 4-76 34-100" stroke="#3f9887" stroke-width="2"/>'
    '</svg>')
# Three soft illustrations for the other pages' banners (260 x 150 units).
PAGE_ART = {
    "books": (
        '<svg viewBox="0 0 260 150" fill="none" stroke-linecap="round" stroke-linejoin="round">'
        '<ellipse cx="150" cy="92" rx="112" ry="54" fill="#e3edff"/>'
        f'<g transform="translate(0 22) scale(.82)">{LEAVES}</g>'
        '<rect x="62" y="104" width="172" height="28" rx="5" fill="#24418f"/><rect x="216" y="108" width="14" height="20" rx="2" fill="#f3f6fc"/>'
        '<rect x="76" y="78" width="150" height="26" rx="5" fill="#f39b3a"/><rect x="208" y="82" width="14" height="18" rx="2" fill="#fff6ea"/>'
        '<rect x="68" y="54" width="160" height="24" rx="5" fill="#3b7be6"/><rect x="210" y="58" width="14" height="16" rx="2" fill="#eef4ff"/>'
        '<rect x="84" y="64" width="54" height="4" rx="2" fill="#a9c8fb"/><rect x="94" y="89" width="44" height="4" rx="2" fill="#fbd3a2"/>'
        '<path d="M88 34 148 12l60 22-60 22Z" fill="#1f3f8f"/><path d="M114 44v12c0 10 68 10 68 0V44l-34 12Z" fill="#17327a"/>'
        '<path d="M148 34h42v24" stroke="#f5b83d" stroke-width="3"/><circle cx="190" cy="61" r="4.5" fill="#f5b83d"/>'
        '</svg>'),
    "chart": (
        '<svg viewBox="0 0 260 150" fill="none" stroke-linecap="round" stroke-linejoin="round">'
        '<ellipse cx="150" cy="88" rx="112" ry="56" fill="#e3edff"/>'
        f'<g transform="translate(-6 24) scale(.8)">{LEAVES}</g>'
        '<rect x="80" y="30" width="150" height="104" rx="14" fill="#d6e3fa"/><rect x="74" y="24" width="150" height="104" rx="14" fill="#fff"/>'
        '<rect x="96" y="84" width="16" height="28" rx="3" fill="#bcd2fb"/><rect x="122" y="70" width="16" height="42" rx="3" fill="#8fb3f6"/>'
        '<rect x="148" y="56" width="16" height="56" rx="3" fill="#5d8ff0"/><rect x="174" y="40" width="16" height="72" rx="3" fill="#2f6fe0"/>'
        '<path d="M98 72 128 58l26-12 30-12" stroke="#0d9488" stroke-width="3"/><path d="M174 32h11v11" stroke="#0d9488" stroke-width="3"/>'
        '<g transform="translate(226 112)"><path d="M-9 6-13 30l13-7 13 7-4-24Z" fill="#2f63d8"/><circle r="16" fill="#f5b83d"/>'
        '<circle r="11" fill="#ffd36b"/><path d="m0-6 2 4 4.4.6-3.2 3.1.8 4.4L0 4-4 6.1l.8-4.4L-6.4-1.4l4.4-.6Z" fill="#e08f12"/></g>'
        '</svg>'),
    "network": (
        '<svg viewBox="0 0 260 150" fill="none" stroke-linecap="round" stroke-linejoin="round">'
        '<ellipse cx="140" cy="84" rx="116" ry="58" fill="#e3edff"/>'
        '<g stroke="#a9c3f3" stroke-width="2.5" stroke-dasharray="2 7"><path d="M138 76 66 40M138 76l74-44M138 76l80 40M138 76l-78 42M138 76V20"/></g>'
        '<circle cx="66" cy="40" r="15" fill="#7b61d6"/><circle cx="212" cy="32" r="17" fill="#0d9488"/>'
        '<circle cx="218" cy="116" r="14" fill="#f5b83d"/><circle cx="60" cy="118" r="16" fill="#e0607a"/><circle cx="138" cy="20" r="11" fill="#5d8ff0"/>'
        '<circle cx="138" cy="76" r="30" fill="#2f63d8"/><circle cx="138" cy="76" r="20" stroke="#fff" stroke-width="3"/>'
        '<path d="m147 67-5 13-13 5 5-13Z" fill="#fff"/>'
        '<path d="m60 40 4 4 7-8M206 32l4 4 7-8M212 116l4 4 7-8M54 118l4 4 7-8" stroke="#fff" stroke-width="2.6"/>'
        '</svg>'),
}
# The banner's three cards: (icon, icon colour, tint class, title, text).
JOURNEY_CARDS = [
    ("target", "#175CD3", "blue", "Tell us your goal", "Share what you want to do, or what you already know."),
    ("compass", "#6248B3", "violet", "Explore your pathway", "Discover qualifications and suggested next steps."),
    ("bars", "#0D9488", "green", "Build your confidence", "Check your readiness and find skills to develop."),
]


def journey() -> None:
    """The banner above every Find my pathway step: the heading on the left, the scene and three cards on the right."""
    cards = "".join(f'<div class="journey-tile journey-tile-{tint}"><span class="journey-tile-icon">{icon(symbol, color)}</span>'
                    f'<div><strong>{title}</strong><p>{text}</p></div></div>'
                    for symbol, color, tint, title, text in JOURNEY_CARDS)
    html_with_vectors('<section class="journey-hero"><div class="journey-scene">' + JOURNEY_SCENE + '</div>'
                      '<div class="journey-copy"><div class="eyebrow">YOUR JOURNEY, SIMPLIFIED</div>'
                      '<h1>A little direction.<br><span>A world of possibilities.</span></h1>'
                      '<p>Discover in-demand skills, find the right TESDA programs, and get closer to the career you '
                      'want.</p></div>'
                      f'<div class="journey-tiles">{cards}</div></section>')


def page_hero(kicker: str, title: str, accent: str, description: str, art: str) -> None:
    """A page's banner, in the same style as Find my pathway's: kicker, a two-tone headline, a lead and a picture."""
    html_with_vectors(f'<section class="page-hero"><div class="page-hero-copy"><div class="eyebrow">{escape(kicker)}</div>'
                      f'<h1>{escape(title)}<br><span>{escape(accent)}</span></h1><p>{escape(description)}</p></div>'
                      f'<div class="page-hero-art">{PAGE_ART[art]}</div></section>')


def card_heading(symbol: str, title: str, description: str = "", kicker: str = "") -> str:
    """A card's opening: its icon in a tinted tile beside an optional kicker, the title and a description."""
    return (f'<div class="card-heading"><span class="card-heading-icon">{icon(symbol)}</span><div>'
            + (f'<div class="card-kicker">{escape(kicker)}</div>' if kicker else '')
            + f'<h3>{escape(title)}</h3>' + (f'<p>{escape(description)}</p>' if description else '') + '</div></div>')


def show_card_heading(symbol: str, title: str, description: str = "", kicker: str = "") -> None:
    html_with_vectors(card_heading(symbol, title, description, kicker))


def goal_summary(query: str) -> None:
    html_with_vectors(f'<div class="goal-summary"><span class="goal-avatar"><svg viewBox="0 0 80 80">{PERSON}</svg></span>'
                      f'<div><span>YOUR GOAL</span><p>{escape(query)}</p></div></div>', width="stretch")


def starting_point(facts: list[tuple[str, str, str]], skills: list[str]) -> None:
    """What we understood from the goal: (icon, label, value) facts in a row, beside a stack of books."""
    cells = "".join(f'<div class="start-fact">{icon(symbol)}<div><span>{escape(label)}</span><strong>{escape(value)}'
                    '</strong></div></div>' for symbol, label, value in facts)
    mentioned = (f'<p class="start-skills">Skills you mentioned: {escape(", ".join(skills))}</p>' if skills else '')
    html_with_vectors('<div class="start-point">'
                      + card_heading("clipboard", "Your starting point",
                                     "Based on your submitted goal and the details you've shared.")
                      + f'<div class="start-facts">{cells}</div>{mentioned}'
                      f'<div class="start-art">{PAGE_ART["books"]}</div></div>')


@cache
def media_styles(thumbnails: bool = False) -> str:
    """Every sector tile (and, for the library, every trade thumbnail) as a class. A page sends these once, and its
    cards only name a class: the library can list hundreds of cards, and each rerun resends them all."""
    tiles = [(symbol, start, end) for _, symbol, start, end in SECTOR_ART] + [DEFAULT_SECTOR_ART]
    rules = [f'.qual-tile-{symbol} {{ --tile-fill: linear-gradient(135deg, {start}, {end}); '
             f'--tile-icon: url("{svg_uri(icon(symbol, "#ffffff"))}"); }}' for symbol, start, end in tiles]
    if thumbnails:
        rules += [f'.qual-thumb-{word} {{ background-image: url("{photo_uri(path, 128, 128)}"); }}'
                  for word, path in TRADE_PHOTOS]
    return "<style>" + "".join(rules) + "</style>"


def qualification_media(name: str, sector: str, small: bool = False) -> str:
    """The trade's photo when there is one, otherwise a tile in the sector's colours with its icon. Tiles and small
    photos need the page's media_styles()."""
    word = next((word for word, _ in TRADE_PHOTOS if word in name.casefold()), None)
    if word and small:
        return f'<span class="qual-photo qual-thumb-{word}"></span>'
    if word:
        return f'<img class="qual-photo" src="{photo_uri(dict(TRADE_PHOTOS)[word])}" alt="">'
    sector_name = sector.casefold()
    symbol = next((symbol for words, symbol, _, _ in SECTOR_ART if any(part in sector_name for part in words)),
                  DEFAULT_SECTOR_ART[0])
    return f'<span class="qual-tile qual-tile-{symbol}"></span>'


def tag_chips(tags: list[tuple[str | None, str]]) -> str:
    """Small chips: (icon or None, text). A ticked one is green, like a verified mark."""
    return '<div class="qual-tags">' + "".join(
        f'<span class="qual-tag{" qual-tag-green" if symbol == "check" else ""}">'
        f'{icon(symbol, "#11664C" if symbol == "check" else "#3E5272") if symbol else ""}{escape(text)}</span>'
        for symbol, text in tags) + '</div>'


def library_top(qualification: dict) -> None:
    """A library card's opening: a small picture beside the sector."""
    html_with_vectors(f'<div class="library-top"><span class="library-media">'
                      f'{qualification_media(qualification["name"], qualification["sector"], small=True)}</span>'
                      f'<div class="card-kicker">{escape(qualification["sector"])}</div></div>')


def library_details(jobs: list[str], tags: list[tuple[str | None, str]]) -> None:
    html_with_vectors(f'<div class="library-details"><div class="card-kicker">Possible careers</div>'
                      f'<p>{escape(", ".join(jobs)) or "Not listed yet"}</p>{tag_chips(tags)}</div>')


def match_summary(qualification: dict, blurb: str, tags: list[tuple[str | None, str]], top: bool) -> None:
    """A match card's left side: the picture, then its sector, name, a sentence about it and its tags."""
    badge = f'<span class="top-match">{icon("check", "#11664C")}Top match</span>' if top else ''
    html_with_vectors(f'<div class="match-summary"><div class="match-media">'
                      f'{qualification_media(qualification["name"], qualification["sector"])}</div><div class="match-body">'
                      f'<div class="card-kicker">{escape(qualification["sector"])}</div>'
                      f'<div class="match-title"><h4>{escape(qualification["name"])}</h4>{badge}</div>'
                      f'<p>{escape(blurb)}</p>{tag_chips(tags)}</div></div>', width="stretch")


def score_ring(score: float, label: str = "") -> None:
    """A score out of 100 as a ring, drawn with a conic gradient."""
    score = min(max(score, 0), 100)
    html_with_vectors(f'<div class="score-ring" style="--score: {score:g}" role="img" '
                      f'aria-label="{escape(label or "Score")}: {score:g}%"><span>{score:g}%</span></div>', width=116)


def skill_bars(rows: list[tuple[str, int, int, str]]) -> str:
    """Labelled bars: (label, count, total, colour class), e.g. 5 of 8 relevant skills."""
    return '<div class="skill-bars">' + "".join(
        f'<div class="skill-bar skill-bar-{tone}"><span>{escape(label)}</span>'
        f'<div class="skill-track"><i style="width: {100 * count / total if total else 0:.0f}%"></i></div>'
        f'<b>{count}/{total}</b></div>' for label, count, total, tone in rows) + '</div>'


def match_fit(title: str, hint: str, bars: list[tuple[str, int, int, str]] | None = None,
              notes: list[str] = ()) -> None:
    """A match card's score panel text: the title with its explanation on hover, then skill bars or short notes."""
    details = skill_bars(bars) if bars else "".join(f'<p class="match-note">{escape(note)}</p>' for note in notes)
    html_with_vectors(f'<div class="match-fit"><div class="match-fit-title">{escape(title)}'
                      f'<span class="match-fit-hint" title="{escape(hint)}">{icon("info", "#52647E")}</span></div>'
                      f'{details}</div>', width="stretch")


def section_title(symbol: str, title: str, description: str) -> None:
    html_with_vectors(f'<div class="section-title">{icon(symbol, "#F5A524")}<div><h3>{escape(title)}</h3>'
                      f'<p>{escape(description)}</p></div></div>', width="stretch")


def pathway_steps(steps: list[dict]) -> None:
    """A curated pathway's steps as a numbered timeline."""
    html_with_vectors('<ol class="pathway-steps">' + "".join(
        f'<li><span>{step["position"]}</span><p>{escape(step["title"])}</p></li>' for step in steps) + '</ol>')


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
