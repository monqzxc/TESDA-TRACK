"""Training and assessment: find a center with filters, a selectable map, a result list and center details."""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from base64 import b64encode
from collections.abc import Callable, Iterable
from datetime import date, datetime
from functools import cache
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import streamlit as st
from PIL import Image

from api_client import ApiClient, ApiError
from centers import (ASSESSMENT, KIND_LABELS, PHILIPPINE_TIME, TRAINING, Filters, build_centers, filter_centers,
                     find_place, friendly_day, map_points, place_label, provinces, sort_centers, summary,
                     with_distances)
from directions import UNAVAILABLE, RouteClient, RouteError, travel_time
from flights import airport_label, flight
from presentation import section_header

DELIVERY_LABELS = {"institution_based": "In a training center", "enterprise_based": "At a workplace",
                   "community_based": "In the community", "online": "Online"}
DELIVERY_ICONS = {"institution_based": ":material/account_balance:", "enterprise_based": ":material/factory:",
                  "community_based": ":material/groups:", "online": ":material/computer:"}
AVAILABILITY = {30: "Starts within 30 days", 90: "Starts within 3 months"}
SORTS = {"nearest": "Nearest first", "soonest": "Soonest start", "name": "Name (A–Z)"}
KIND_COLORS = {TRAINING: "blue", ASSESSMENT: "green"}
KIND_ICONS = {TRAINING: ":material/account_balance:", ASSESSMENT: ":material/assignment:"}
# Travel modes for Directions: icon, then how the time reads ("about 16 min by car"). MODE_NAMES name a missing one.
TRAVEL = {"car": (":material/directions_car:", "by car"), "bike": (":material/directions_bike:", "by bike"),
          "foot": (":material/directions_walk:", "on foot"), "plane": (":material/flight:", "in the air")}
MODE_NAMES = {"car": "car", "bike": "bike", "foot": "walking"}
# One glyph per center type (24-unit grid), drawn on the map pins in the browser.
GLYPHS = {TRAINING: '<path d="M12 6.5 4.5 10 12 13.5 19.5 10 12 6.5Z M7.5 11.6v3.1c2.6 1.7 6.4 1.7 9 0v-3.1 M19.5 10v4.2"/>',
          ASSESSMENT: '<circle cx="12" cy="9.6" r="3.7"/><path d="m9.5 12.6-1.3 4.9 3.8-1.8 3.8 1.8-1.3-4.9"/>'}
# Illustrations, not photos of the actual sites: no site photos are on file.
_PHOTOS = Path(__file__).with_name("assets") / "training"
CENTER_PHOTO = _PHOTOS / "center.jpg"
# A program shows its trade when there is an illustration for it, and the center otherwise.
PROGRAM_PHOTOS = (("weld", _PHOTOS / "welding.jpg"), ("electric", _PHOTOS / "electrical.jpg"))
LOCATION_HELP = ("Your browser asks first. We round your location to about 1 km and never save it. We use it to "
                 "measure distances and, when you ask for directions, share it with an OpenStreetMap routing service "
                 "to plan the route.")
LOCATION_ERRORS = {
    "denied": "Location access was declined. Search a place or choose a region instead.",
    "unavailable": "Your location couldn't be found. Search a place or choose a region instead.",
    "unsupported": "This browser can't share a location. Search a place or choose a region instead.",
}
PAGE_SIZE = 100  # the largest page the listing endpoints return
MAX_PAGES = 10
LIST_STEP = 20
PREVIEW = 2  # programs or assessments shown under a center before View all
MAP_KEY = "center_map"
FILTER_KEYS = ("training_kinds", "training_use_location", "training_place", "training_region", "training_province",
               "training_qualifications", "training_mode", "training_availability", "training_scholarship")
_MARKDOWN = re.compile(r"([\\`*_{}\[\]()#+\-.!|>~:$<])")
_LEVEL = re.compile(r"\s*(\([^)]*\)|\bNC\s+[IV]+\b)", re.IGNORECASE)
_STYLES = Path(__file__).with_name("training.css")

# The map is the one element Streamlit has no native widget for. Everything else on the page is native.
# Leaflet renders inside the component's shadow root; clicks and browser geolocation come back as triggers.
_CENTER_MAP = st.components.v2.component(
    "tesda_track_center_finder_map",
    html="""
    <div class="map-shell" role="region" aria-label="Map of training and assessment centers">
      <div id="center-map"></div>
      <div class="map-status" role="status" aria-live="polite">Loading the map…</div>
      <div class="map-legend" aria-hidden="true">
        <span><i class="legend-dot training"></i>Training center</span>
        <span><i class="legend-dot assessment"></i>Assessment center</span>
      </div>
    </div>
    """,
    css="""
    :host { display: block; font-family: var(--st-font, "Segoe UI", Arial, sans-serif); }
    /* --map-overlay-inset is how far the page's filter panel reaches over the map's left edge (0 when it doesn't). */
    .map-shell { position: relative; height: 680px; overflow: hidden; border: 1px solid #dfe7f2; border-radius: 18px;
                 background: #cfe6f5; box-shadow: 0 6px 24px #102a560d; isolation: isolate;
                 scroll-margin-top: 72px; }  /* clear of the app's fixed header when a route scrolls it into view */
    #center-map { position: absolute; inset: 0; }
    .icon { flex: none; display: block; }
    .map-shell .leaflet-container { font-family: inherit; font-size: 12px; background: #cfe6f5; }
    .map-shell.soft .leaflet-tile-pane { filter: saturate(0.55) brightness(1.06) contrast(0.94); }
    .map-shell button:focus-visible, .map-shell a:focus-visible { outline: 3px solid #438bf5; outline-offset: 2px; }
    .map-status { position: absolute; z-index: 800; top: 14px; left: calc(var(--map-overlay-inset, 0px) + 14px);
                  right: 70px; padding: 10px 14px; border-radius: 12px; background: #ffffffee; color: #52647e;
                  font-size: 13px; box-shadow: 0 2px 10px #102a5614; pointer-events: none; }
    .map-status[hidden] { display: none; }
    .map-legend { position: absolute; z-index: 800; left: calc(var(--map-overlay-inset, 0px) + 4px); bottom: 14px;
                  display: flex; gap: 22px; flex-wrap: wrap; padding: 11px 18px; border-radius: 14px; background: #fff;
                  color: #102a56; font-size: 12.5px; box-shadow: 0 4px 14px #102a561a; }
    .map-legend span { display: inline-flex; align-items: center; gap: 8px; }
    .legend-dot { width: 12px; height: 12px; border-radius: 50%; background: #175cd3; }
    .legend-dot.assessment { background: #0d9488; }
    .center-pin { width: 34px; height: 44px; transform-origin: 50% 100%; transition: transform .15s ease;
                  filter: drop-shadow(0 3px 3px #102a5644); }
    .center-pin svg { display: block; width: 100%; height: 100%; }
    .center-pin.selected { transform: scale(1.3); filter: drop-shadow(0 0 7px #175cd3aa); }
    .center-pin.assessment.selected { filter: drop-shadow(0 0 7px #0d9488aa); }
    .center-cluster { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 50%;
                      background: #175cd32e; }
    .center-cluster span { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%;
                           background: #175cd3; border: 2px solid #fff; color: #fff; font-size: 13px; font-weight: 700; }
    .reference-dot { width: 18px; height: 18px; border-radius: 50%; background: #175cd3; border: 3px solid #fff;
                     box-shadow: 0 0 0 7px #175cd333, 0 1px 4px #102a5666; box-sizing: border-box; }
    .reference-dot.place { background: #102a56; box-shadow: 0 0 0 7px #102a5622, 0 1px 4px #102a5666; }

    /* Center popup */
    .map-shell .leaflet-popup-content-wrapper { border-radius: 16px; box-shadow: 0 12px 32px #102a5633; }
    .map-shell .leaflet-popup-content { margin: 16px; width: 360px !important; line-height: 1.4; }
    .map-shell .leaflet-popup-close-button { top: 12px; right: 12px; width: 26px; height: 26px; color: #52647e;
                                             font: 400 22px/24px Arial, sans-serif; border-radius: 8px; }
    .map-shell .leaflet-popup-close-button:hover { color: #102a56; background: #f2f6fd; }
    .popup { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px 14px; color: #52647e;
             font-size: 12px; }
    .popup-photo { width: 76px; height: 80px; object-fit: cover; border-radius: 10px; }
    .popup-head { min-width: 0; padding-right: 18px; }
    .popup-name { color: #102a56; font-size: 15px; font-weight: 700; line-height: 1.3; }
    .popup-place { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12.5px; }
    .popup-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid #dfe7f2;
            border-radius: 8px; background: #fff; color: #102a56; font-size: 11.5px; font-weight: 600; }
    .chip.training { border-color: #eaf1fd; background: #eaf1fd; color: #175cd3; }
    .chip.assessment { border-color: #e3f5ee; background: #e3f5ee; color: #11664c; }
    .popup-note, .popup-contacts, .popup-actions { grid-column: 1 / -1; margin: 0; }
    .popup-contacts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
    .popup-contacts a { display: inline-flex; align-items: center; gap: 6px; color: #52647e; text-decoration: none; }
    .popup-contacts a.mail { color: #175cd3; }
    .popup-contacts .divider { width: 1px; height: 14px; background: #dfe7f2; }
    .popup-actions { display: flex; align-items: center; gap: 10px; padding-top: 2px; }
    .popup-primary { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                     height: 42px; padding: 0 16px; border: 0; border-radius: 10px; background: #175cd3; color: #fff;
                     font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; }
    .popup-primary:hover { background: #134fb8; }
    .popup-icon { flex: 0 0 42px; height: 42px; display: grid; place-items: center; box-sizing: border-box;
                  border: 1px solid #dfe7f2; border-radius: 10px; background: #fff; color: #175cd3; cursor: pointer; }
    .popup-icon:hover { background: #f2f6fd; }
    .popup-icon.active { border-color: #b9d0f7; background: #eaf1fd; }
    .popup-icon.active svg { fill: currentColor; }

    /* Controls: locate above zoom on the right, layers at the bottom right */
    .map-shell .leaflet-top.leaflet-right .leaflet-control { margin: 14px 14px 0 0; }
    .map-shell .leaflet-bar { border: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px #102a561f; }
    .map-shell .leaflet-bar a { width: 42px; height: 42px; line-height: 42px; color: #102a56; font-size: 20px; }
    .map-shell .leaflet-bar a:hover { background: #f2f6fd; }
    .map-shell .locate-control a { display: grid; place-items: center; }
    .map-shell .leaflet-control-attribution { font-size: 10px; background: #ffffffcc; }
    .map-shell .leaflet-bottom.leaflet-right .layers-control { position: relative; margin: 0 14px 8px 0; }
    .layers-button { display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 18px; border: 0;
                     border-radius: 12px; background: #fff; color: #102a56; font: inherit; font-size: 13.5px;
                     font-weight: 600; box-shadow: 0 4px 14px #102a561f; cursor: pointer; }
    .layers-button:hover { background: #f8faff; }
    .layers-menu { position: absolute; right: 0; bottom: calc(100% + 8px); display: grid; min-width: 180px;
                   padding: 6px; border-radius: 12px; background: #fff; box-shadow: 0 10px 28px #102a5633; }
    .layers-menu[hidden] { display: none; }
    .layers-menu button { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-radius: 8px;
                          background: none; color: #102a56; font: inherit; font-size: 13px; text-align: left;
                          cursor: pointer; }
    .layers-menu button:hover { background: #f2f6fd; }
    .layers-menu button svg { visibility: hidden; color: #175cd3; }
    .layers-menu button[aria-checked="true"] { font-weight: 650; }
    .layers-menu button[aria-checked="true"] svg { visibility: visible; }

    /* Route */
    .map-shell .route-label { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px;
                              border: 1px solid #dfe7f2; border-radius: 10px; background: #fff; color: #102a56;
                              font-size: 12.5px; font-weight: 600; box-shadow: 0 3px 10px #102a5626;
                              white-space: nowrap; cursor: pointer; }
    .map-shell .route-label:hover { border-color: #175cd3; }
    .map-shell .route-label.selected { border-color: #175cd3; background: #175cd3; color: #fff; font-size: 13px;
                                       font-weight: 650; box-shadow: 0 4px 12px #175cd355; }
    .map-shell .route-label::before { display: none; }
    @media (max-width: 640px) {
      .map-shell { height: 460px; }
      .map-legend { font-size: 11.5px; gap: 12px; padding: 9px 12px; }
      .map-shell .leaflet-popup-content { width: 250px !important; }
      .popup { grid-template-columns: 56px minmax(0, 1fr); }
      .popup-photo { width: 56px; height: 60px; }
      .layers-button span { display: none; }
      .layers-button { padding: 0 12px; }
    }
    """,
    js="""
    const LEAFLET = { js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
                      jsHash: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
                      css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
                      cssHash: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=' }
    const CLUSTERS = { js: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
                       jsHash: 'sha256-Hk4dIpcqOSb0hZjgyvFOP+cEmDXUKKNE/tT542ZbNQg=' }
    const PHILIPPINES = [[4.5, 116.8], [21.2, 126.7]]
    const COLORS = { training: '#175cd3', assessment: '#0d9488' }
    let GLYPHS = { training: '', assessment: '' }  // sent by Python with the data
    const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    const CARTO_CREDIT = `${OSM_CREDIT} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>`
    const OSM = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options: { maxZoom: 19, attribution: OSM_CREDIT } }
    // The Layers menu; the first is the default. CARTO's styles need the deployment's key. Without one, the
    // default is OpenStreetMap with muted colors ("soft").
    function basemaps(key) {
      const carto = style => ({ url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
                                options: { subdomains: 'abcd', maxZoom: 20, attribution: CARTO_CREDIT } })
      return key
        ? [{ id: 'map', label: 'Map', ...carto('rastertiles/voyager') }, { id: 'light', label: 'Light', ...carto('light_all') },
           { id: 'standard', label: 'OpenStreetMap', ...OSM }]
        : [{ id: 'map', label: 'Map', ...OSM, soft: true }, { id: 'standard', label: 'OpenStreetMap', ...OSM }]
    }
    const BASEMAP_MEMORY = 'tesda-track-basemap'
    // Line icons on a 24-unit grid for the popup, the controls and the route label.
    const ICONS = {
      pin: '<path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/>',
      training: '<path d="M3.5 9.5 12 4.5l8.5 5M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3.5 19.5h17"/>',
      assessment: '<rect x="5.5" y="5" width="13" height="15.5" rx="2"/><path d="M9.5 3.5h5v3h-5zM9 11h6M9 15h4"/>',
      distance: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16"/>',
      phone: '<path d="M5.2 4h3.3l1.6 4.2-2.1 1.3a11 11 0 0 0 6.5 6.5l1.3-2.1 4.2 1.6v3.3a1.6 1.6 0 0 1-1.7 1.6C10.4 19.8 4.2 13.6 3.6 5.7A1.6 1.6 0 0 1 5.2 4Z"/>',
      mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
      arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
      directions: '<path d="M20.5 3.5 3.5 10.6l7.2 2.7 2.7 7.2 7.1-17Z"/>',
      bookmark: '<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4.2-6 4.2v-16a1 1 0 0 1 1-1Z"/>',
      link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
      car: '<path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5M5 12h14M5 16.5h14M7 16.5V19M17 16.5V19"/>',
      bike: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16 9 9h7l2.5 7M9 9l3.5 7h-7M14.5 6H17"/>',
      foot: '<circle cx="13.5" cy="4.5" r="2"/><path d="m8.5 21 3-6.5 2.5 2.5V21M10.5 14.5 11 9l3 .2 2 3.3 2.5.8M11 9l-3 1.5-1 3"/>',
      plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z"/>',
      layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
      locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    }
    const icon = (name, size = 16) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
    // The routing service asks to be credited, with a way to report mistakes in the map it routes on.
    const ROUTE_CREDIT = 'Route by <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Fix the map</a>'
    const views = new WeakMap()

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
    const kindOf = kind => kind === 'assessment' ? 'assessment' : 'training'
    const kilometres = value => `${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`

    function loadScript({ js, jsHash }) {
      window.__tesdaMapScripts = window.__tesdaMapScripts || {}
      if (!window.__tesdaMapScripts[js]) {
        window.__tesdaMapScripts[js] = new Promise((resolve, reject) => {
          const script = document.createElement('script')
          Object.assign(script, { src: js, integrity: jsHash, crossOrigin: 'anonymous', onload: resolve })
          script.onerror = () => {
            delete window.__tesdaMapScripts[js]
            reject(new Error('The map could not load. The list of centers still works.'))
          }
          document.head.append(script)
        })
      }
      return window.__tesdaMapScripts[js]
    }

    async function libraries(root) {
      if (!root.querySelector('link[data-leaflet]')) {
        const link = Object.assign(document.createElement('link'), {
          rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssHash, crossOrigin: 'anonymous' })
        link.dataset.leaflet = 'true'
        root.prepend(link)
      }
      if (!window.L) await loadScript(LEAFLET)
      // Clusters are a nicety: without the plugin every center is still pinned.
      if (!window.L.markerClusterGroup) await loadScript(CLUSTERS).catch(() => null)
      return window.L
    }

    const pinSvg = kind => `<svg viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.9 1.5 28.4 17 42.5 17 42.5s15.5-14.1 15.5-25.6C32.5 8.3 25.6 1.5 17 1.5Z" fill="${COLORS[kind]}" stroke="#fff" stroke-width="2"/><g transform="translate(5 4.5)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g></svg>`

    function pinIcon(L, kind, selected) {
      return L.divIcon({ className: '', html: `<div class="center-pin ${kind}${selected ? ' selected' : ''}">${pinSvg(kind)}</div>`,
                         iconSize: [34, 44], iconAnchor: [17, 43], popupAnchor: [0, -40] })
    }

    function popupHtml(view, center) {
      const kind = kindOf(center.kind)
      const point = `${center.latitude},${center.longitude}`
      // From the learner's own location the route is drawn on this map; otherwise Google Maps finds one.
      const directions = view.canRoute
        ? `<button type="button" class="popup-icon" data-route="${escapeHtml(center.id)}" title="Directions" aria-label="Directions">${icon('directions', 18)}</button>`
        : `<a class="popup-icon" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}" target="_blank" rel="noopener noreferrer" title="Directions in Google Maps" aria-label="Directions in Google Maps">${icon('directions', 18)}</a>`
      const saved = view.saved.has(center.id)
      const distance = center.distance_km == null ? '' : `<span class="chip">${icon('distance', 14)}${kilometres(center.distance_km)} away</span>`
      const contacts = [
        center.phone ? `<a href="tel:${escapeHtml(String(center.phone).replace(/[^+\\d]/g, ''))}">${icon('phone', 14)}${escapeHtml(center.phone)}</a>` : '',
        center.email ? `<a class="mail" href="mailto:${encodeURIComponent(center.email).replace('%40', '@')}">${icon('mail', 14)}${escapeHtml(center.email)}</a>` : '',
      ].filter(Boolean).join('<span class="divider"></span>')
      return `<div class="popup">
        ${view.photo ? `<img class="popup-photo" src="${view.photo}" alt="">` : ''}
        <div class="popup-head">
          <div class="popup-name">${escapeHtml(center.name)}</div>
          <div class="popup-place">${icon('pin', 15)}${escapeHtml(center.place)}</div>
          <div class="popup-chips"><span class="chip ${kind}">${icon(kind, 14)}${kind === 'assessment' ? 'Assessment center' : 'Training center'}</span>${distance}</div>
        </div>
        <p class="popup-note">${escapeHtml(center.address || center.summary)}</p>
        ${contacts ? `<div class="popup-contacts">${contacts}</div>` : ''}
        <div class="popup-actions">
          <button type="button" class="popup-primary" data-details>View details ${icon('arrow', 16)}</button>
          ${directions}
          <button type="button" class="popup-icon${saved ? ' active' : ''}" data-save="${escapeHtml(center.id)}" aria-pressed="${saved}" title="${saved ? 'Saved' : 'Save'}" aria-label="Save this center">${icon('bookmark', 18)}</button>
          <button type="button" class="popup-icon" data-copy="${escapeHtml(point)}" title="Copy a link to this location" aria-label="Copy a link to this location">${icon('link', 18)}</button>
        </div></div>`
    }

    function setStatus(view, message) {
      view.status.textContent = message || ''
      view.status.hidden = !message
    }

    function flash(view, message) {
      setStatus(view, message)
      clearTimeout(view.flashTimer)
      view.flashTimer = setTimeout(() => { if (view.status.textContent === message) setStatus(view, '') }, 2600)
    }

    function copyLink(view, point) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`
      const copied = () => flash(view, 'Link to this location copied.')
      // The clipboard API needs a secure page; plain-http deployments fall back to a hidden field.
      const fallback = () => {
        const field = Object.assign(document.createElement('textarea'), { value: url, readOnly: true })
        Object.assign(field.style, { position: 'fixed', opacity: '0' })
        document.body.append(field)
        field.select()
        const done = document.execCommand('copy')
        field.remove()
        done ? copied() : flash(view, `Couldn't copy. The link is ${url}`)
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(copied, fallback)
      else fallback()
    }

    function locate(view) {
      if (!navigator.geolocation) return view.emit('location_failed', 'unsupported')
      setStatus(view, 'Finding your approximate location…')
      navigator.geolocation.getCurrentPosition(position => {
        setStatus(view, '')
        const round = value => Math.round(value * 100) / 100
        view.emit('located', { latitude: round(position.coords.latitude), longitude: round(position.coords.longitude) })
      }, error => {
        setStatus(view, '')
        view.emit('location_failed', error.code === 1 ? 'denied' : 'unavailable')
      }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 })
    }

    // The filter panel can float over the map's left edge. Framing and popups keep clear of it; the popups share
    // one padding array, which Leaflet reads each time a popup opens, so a resize moves them all.
    function syncInset(view) {
      view.inset = parseFloat(getComputedStyle(view.shell).getPropertyValue('--map-overlay-inset')) || 0
      view.popupPadding[0] = view.inset + 24
    }

    const padded = (view, padding) => ({ paddingTopLeft: [view.inset + padding, padding],
                                         paddingBottomRight: [padding, padding] })

    function useBasemap(view, id) {
      const base = view.basemaps.find(item => item.id === id) || view.basemaps[0]
      if (view.tiles) view.tiles.remove()
      view.basemap = base.id
      view.shell.classList.toggle('soft', Boolean(base.soft))
      view.tiles = view.L.tileLayer(base.url, base.options).addTo(view.map)
      view.tiles.once('load', () => { if (view.status.textContent === 'Loading the map…') setStatus(view, '') })
      view.tiles.on('tileerror', () => setStatus(view, 'Some map tiles could not load. The list of centers still works.'))
      try { localStorage.setItem(BASEMAP_MEMORY, base.id) } catch { /* private windows can refuse storage */ }
    }

    function savedBasemap() {
      try { return localStorage.getItem(BASEMAP_MEMORY) } catch { return null }
    }

    function createView(root, L, key) {
      const element = root.querySelector('#center-map')
      const map = L.map(element, { zoomSnap: 0.5, scrollWheelZoom: false, tap: true, zoomControl: false })
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>')
      map.fitBounds(PHILIPPINES)
      // The page scrolls past the map; wheel zoom only after the map is clicked into.
      map.on('focus click', () => map.scrollWheelZoom.enable())
      map.on('blur', () => map.scrollWheelZoom.disable())
      const view = { map, L, markers: new Map(), selected: null, fingerprint: null, framing: null, asked: false,
                     canRoute: false, routeKey: null, routeLayer: null, shell: root.querySelector('.map-shell'),
                     status: root.querySelector('.map-status'), inset: 0, popupPadding: [24, 24], emit: () => {},
                     saved: new Set(), photo: '', focus: null, shown: undefined, tiles: null, basemap: null,
                     basemaps: basemaps(key) }
      useBasemap(view, savedBasemap())
      view.group = L.markerClusterGroup
        ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, spiderfyOnMaxZoom: true,
            iconCreateFunction: cluster => L.divIcon({ className: '', iconSize: [46, 46],
              html: `<div class="center-cluster"><span>${cluster.getChildCount()}</span></div>` }) })
        : L.featureGroup()
      view.group.addTo(map)
      // Top right, away from the filter panel: locate on its own, then zoom.
      const Locate = L.Control.extend({ options: { position: 'topright' }, onAdd() {
        const box = L.DomUtil.create('div', 'leaflet-bar locate-control')
        const button = L.DomUtil.create('a', '', box)
        Object.assign(button, { href: '#', title: 'Show centers near me', innerHTML: icon('locate', 20) })
        button.setAttribute('role', 'button')
        button.setAttribute('aria-label', 'Show centers near me')
        L.DomEvent.on(button, 'click', event => { L.DomEvent.stop(event); locate(view) })
        return box
      } })
      map.addControl(new Locate())
      L.control.zoom({ position: 'topright' }).addTo(map)
      const Layers = L.Control.extend({ options: { position: 'bottomright' }, onAdd() {
        const box = L.DomUtil.create('div', 'layers-control')
        L.DomEvent.disableClickPropagation(box)
        L.DomEvent.disableScrollPropagation(box)
        const menu = L.DomUtil.create('div', 'layers-menu', box)
        Object.assign(menu, { hidden: true, id: 'map-layers-menu' })
        menu.setAttribute('role', 'menu')
        const button = L.DomUtil.create('button', 'layers-button', box)
        Object.assign(button, { type: 'button', innerHTML: `${icon('layers', 18)}<span>Layers</span>` })
        button.setAttribute('aria-label', 'Map layers')
        button.setAttribute('aria-controls', 'map-layers-menu')
        button.setAttribute('aria-expanded', 'false')
        const show = open => {
          menu.hidden = !open
          button.setAttribute('aria-expanded', String(open))
          if (open) menu.innerHTML = view.basemaps.map(base => `<button type="button" role="menuitemradio" aria-checked="${base.id === view.basemap}" data-base="${base.id}">${icon('check', 16)}${base.label}</button>`).join('')
        }
        button.onclick = () => show(menu.hidden)
        menu.onclick = event => {
          const choice = event.target.closest('[data-base]')
          if (!choice) return
          useBasemap(view, choice.dataset.base)
          show(false)
          button.focus()
        }
        box.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { show(false); button.focus() } })
        return box
      } })
      map.addControl(new Layers())
      map.on('popupopen', event => {
        const popup = event.popup.getElement()
        const details = popup?.querySelector('[data-details]')
        if (details) details.onclick = () => {
          // Beside the map on wide screens, below it on phones.
          document.querySelector('.st-key-center_detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
        const directions = popup?.querySelector('[data-route]')
        if (directions) directions.onclick = () => {
          setStatus(view, 'Finding a route…')
          view.emit('route', directions.dataset.route)
        }
        const save = popup?.querySelector('[data-save]')
        if (save) save.onclick = () => {
          const saved = save.getAttribute('aria-pressed') !== 'true'
          save.setAttribute('aria-pressed', String(saved))
          save.classList.toggle('active', saved)
          save.title = saved ? 'Saved' : 'Save'
          view.emit('saved', save.dataset.save)
        }
        const copy = popup?.querySelector('[data-copy]')
        if (copy) copy.onclick = () => copyLink(view, copy.dataset.copy)
      })
      new ResizeObserver(() => {
        map.invalidateSize()
        syncInset(view)
      }).observe(element)
      return view
    }

    function markSelected(view, id) {
      if (view.selected === id) return
      for (const [markerId, entry] of view.markers) {
        if (markerId === view.selected || markerId === id) {
          entry.marker.setIcon(pinIcon(view.L, entry.kind, markerId === id))
          entry.marker.setZIndexOffset(markerId === id ? 1000 : 0)
        }
      }
      view.selected = id
    }

    function showSelected(view, id) {
      const entry = view.markers.get(id)
      if (!entry) return view.map.closePopup()
      const open = () => entry.marker.openPopup()
      if (view.group.zoomToShowLayer) view.group.zoomToShowLayer(entry.marker, open)
      else { view.map.setView(entry.marker.getLatLng(), Math.max(view.map.getZoom(), 12)); open() }
    }

    function drawMarkers(view, centers) {
      const { L } = view
      view.group.clearLayers()
      view.markers.clear()
      view.selected = null
      const layers = centers.map(center => {
        const kind = kindOf(center.kind)
        const marker = L.marker([center.latitude, center.longitude], { icon: pinIcon(L, kind, false),
          title: center.name, alt: `${center.name}, ${kind === 'assessment' ? 'assessment center' : 'training center'}` })
        // Built as it opens, so its buttons follow the learner's location and saved centers.
        marker.bindPopup(() => popupHtml(view, center), { maxWidth: 380, minWidth: 250, autoPanPadding: [24, 24],
                                                         autoPanPaddingTopLeft: view.popupPadding })
        marker.on('click', () => {
          markSelected(view, center.id)
          view.emit('picked', center.id)
        })
        view.markers.set(center.id, { marker, kind })
        return marker
      })
      if (view.group.addLayers) view.group.addLayers(layers)
      else layers.forEach(layer => view.group.addLayer(layer))
    }

    function drawReference(view, reference) {
      const { L } = view
      if (view.referenceMarker) view.referenceMarker.remove()
      view.referenceMarker = null
      if (!reference) return
      const icon = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
                               html: `<div class="reference-dot${reference.mine ? '' : ' place'}"></div>` })
      // Beneath the pins and cluster counts, which are what people click.
      view.referenceMarker = L.marker([reference.latitude, reference.longitude], { icon, keyboard: false, zIndexOffset: -1000 })
        .bindTooltip(reference.mine ? 'Your approximate location' : escapeHtml(reference.label), { direction: 'top', offset: [0, -8] })
        .addTo(view.map)
    }

    function frame(view, centers, reference) {
      const { L, map } = view
      if (!centers.length) {
        if (reference) {
          map.setView([reference.latitude, reference.longitude], 9)
          map.panBy([-view.inset / 2, 0], { animate: false })  // centered in the part the filter panel leaves open
        } else map.fitBounds(PHILIPPINES, padded(view, 0))
        return
      }
      let points = centers.map(center => [center.latitude, center.longitude])
      if (reference) {
        // Near a place: show it with its closest centers rather than the whole country.
        const nearest = [...centers].filter(center => center.distance_km != null)
          .sort((a, b) => a.distance_km - b.distance_km).slice(0, 6)
        points = [[reference.latitude, reference.longitude], ...nearest.map(center => [center.latitude, center.longitude])]
      }
      map.fitBounds(L.latLngBounds(points), { ...padded(view, 48), maxZoom: 13 })
    }

    function revealMap(view) {
      // Directions or View on map asked for below the map, as on phones, would otherwise happen out of sight.
      const box = view.shell.getBoundingClientRect()
      const onScreen = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
      if (onScreen < box.height * 0.75) view.shell.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }

    // Where along its path each mode's label sits, so labels on shared roads don't cover each other.
    const LABEL_AT = { car: 0.5, bike: 0.3, foot: 0.7, plane: 0.65 }

    function styleRoutes(view, selected) {
      for (const [mode, part] of view.routeParts) {
        const chosen = mode === selected
        part.casing.setStyle({ weight: chosen ? 10 : 7, opacity: chosen ? 0.95 : 0.85 })
        part.line.setStyle({ color: chosen ? COLORS.training : '#8db2ee', weight: chosen ? 6 : 4, opacity: chosen ? 0.95 : 0.9 })
        part.dotted.forEach(line => line.setStyle({ opacity: chosen ? 0.8 : 0 }))
        part.label.getElement()?.classList.toggle('selected', chosen)
      }
      // The chosen route on top, its label above the others.
      const chosen = view.routeParts.get(selected)
      if (chosen) {
        chosen.casing.bringToFront()
        chosen.line.bringToFront()
        const element = chosen.label.getElement()
        if (element) element.parentNode.append(element)
      }
    }

    function drawRoute(view, route) {
      const { L, map } = view
      // One route per travel mode; picking another mode restyles them without moving the map.
      const key = route && JSON.stringify([route.center_id, route.origin, route.destination,
                                           route.options.map(option => [option.mode, option.path.length])])
      if (key === view.routeKey) {
        if (route) styleRoutes(view, route.selected)
        return
      }
      view.routeKey = key
      if (view.routeLayer) {
        view.routeLayer.remove()
        map.attributionControl.removeAttribution(ROUTE_CREDIT)
        view.routeLayer = null
      }
      view.routeParts = new Map()
      if (!route) return
      view.routeLayer = L.layerGroup().addTo(map)
      const pick = mode => event => {
        L.DomEvent.stop(event)
        if (mode !== view.routeSelected) view.emit('travel_mode', mode)
      }
      for (const option of route.options) {
        // Dotted where there's no road: from the approximate location to the nearest road, and from the last road on.
        const dotted = [[route.origin, option.start], [option.end, route.destination]].map(points =>
          L.polyline(points, { interactive: false, color: COLORS.training, weight: 3, dashArray: '1 7', lineCap: 'round' }))
        const casing = L.polyline(option.path, { color: '#fff', lineJoin: 'round', bubblingMouseEvents: false })
        // A flight is an estimate between airports, not a road: dashed, as flight paths are drawn.
        const line = L.polyline(option.path, { lineJoin: 'round', bubblingMouseEvents: false,
                                               dashArray: option.mode === 'plane' ? '10 9' : null })
        const at = option.path[Math.floor((option.path.length - 1) * (LABEL_AT[option.mode] ?? 0.5))]
        const label = L.tooltip({ permanent: true, direction: 'center', className: 'route-label', interactive: true,
                                  opacity: 1 })
          .setLatLng(at).setContent(`${icon(option.mode, 16)}<span>${escapeHtml(option.label)}</span>`)
        for (const layer of [...dotted, casing, line, label]) view.routeLayer.addLayer(layer)
        casing.on('click', pick(option.mode))
        line.on('click', pick(option.mode))
        const element = label.getElement()
        if (element) {
          element.title = 'Show this route'
          L.DomEvent.on(element, 'click', pick(option.mode))
        }
        view.routeParts.set(option.mode, { casing, line, dotted, label })
      }
      // The center's own pin can be folded into a cluster at this zoom; this copy always marks the end.
      view.routeLayer.addLayer(L.marker(route.destination, { icon: pinIcon(L, kindOf(route.kind), true),
                                                             interactive: false, keyboard: false, zIndexOffset: 2000 }))
      styleRoutes(view, route.selected)
      map.attributionControl.addAttribution(ROUTE_CREDIT)
      map.closePopup()
      const points = route.options.flatMap(option => option.path)
      map.fitBounds(L.latLngBounds([route.origin, route.destination, ...points]), { ...padded(view, 56), maxZoom: 16 })
      revealMap(view)
    }

    export default function (component) {
      const { parentElement: root, data, setTriggerValue } = component
      let disposed = false
      libraries(root).then(L => {
        if (disposed || !root.querySelector('#center-map')) return
        let view = views.get(root)
        if (!view) {
          view = createView(root, L, data?.basemap_key || '')
          views.set(root, view)
        }
        view.emit = setTriggerValue
        syncInset(view)
        view.canRoute = Boolean(data?.can_route)
        view.saved = new Set(data?.saved || [])
        view.photo = data?.photo || ''
        if (data?.glyphs) GLYPHS = data.glyphs
        const centers = (data?.centers || []).filter(center =>
          Number.isFinite(center.latitude) && Number.isFinite(center.longitude))
        const reference = data?.reference || null
        const route = data?.route || null
        const fingerprint = JSON.stringify(centers)
        if (fingerprint !== view.fingerprint) {
          drawMarkers(view, centers)
          view.fingerprint = fingerprint
        }
        const framing = JSON.stringify([centers.map(center => center.id), reference])
        drawReference(view, reference)
        if (framing !== view.framing) {
          if (!route) frame(view, centers, reference)  // a drawn route keeps the view on itself
          view.framing = framing
        }
        const selected = data?.selected || null
        // View on map counts up, so asking again reopens a center that is already selected.
        const focus = data?.focus ?? 0
        const refocus = view.focus !== null && focus !== view.focus
        view.focus = focus
        if (selected !== view.selected || (refocus && selected)) {
          markSelected(view, selected)
          if (!selected) view.map.closePopup()
          else if (!route) showSelected(view, selected)
        }
        if (refocus && selected && !route) revealMap(view)
        if (selected && selected !== view.shown) {
          // The selected center heads the results; bring the top of the list back into view.
          document.querySelector('.st-key-center_list')?.scrollTo?.({ top: 0, behavior: 'smooth' })
        }
        view.shown = selected
        view.routeSelected = route?.selected
        drawRoute(view, route)
        if (view.status.textContent === 'Finding a route…') setStatus(view, '')
        if (!centers.length) setStatus(view, 'No centers match this search yet.')
        else if (view.status.textContent === 'No centers match this search yet.') setStatus(view, '')
        if (!data?.want_location) view.asked = false
        else if (!view.asked) {
          view.asked = true
          locate(view)
        }
      }).catch(error => {
        const status = root.querySelector('.map-status')
        if (status) Object.assign(status, { textContent: error.message, hidden: false })
      })
      return () => { disposed = true }
    }
    """,
)


def plain(text: str) -> str:
    """Show API or learner text as written, without Markdown formatting."""
    return _MARKDOWN.sub(r"\\\1", text or "")


def _kilometres(distance: float) -> str:
    return f"{distance:,.1f} km"


def _local_time(timestamp: str) -> str:
    when = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(PHILIPPINE_TIME)
    return f"{when:%a}, {when:%b} {when.day} · {when:%I:%M %p}".replace(" 0", " ")


def _peso(amount) -> str:
    return f"₱{float(amount):,.2f}"


def _short_name(name: str) -> str:
    """A qualification without its level or abbreviation, for one-line summaries."""
    return _LEVEL.sub("", name).strip() or name


@cache
def _photo_uri(path: Path, size: int = 160) -> str:
    """A small copy for the map popup, which is HTML built in the browser. Sent with every run, so kept to a few KB."""
    image = Image.open(path)
    image.thumbnail((size, size), Image.LANCZOS)
    jpeg = BytesIO()
    image.save(jpeg, format="JPEG", quality=76, optimize=True)
    return "data:image/jpeg;base64," + b64encode(jpeg.getvalue()).decode("ascii")


def _listing_photo(listing: dict) -> Path:
    text = f"{listing.get('title', '')} {listing['qualification']['name']}".casefold()
    return next((photo for word, photo in PROGRAM_PHOTOS if word in text), CENTER_PHOTO)


@st.cache_data(ttl="5m", show_spinner=False, max_entries=8)
def _sites(base_url: str, _api: ApiClient) -> tuple[list[dict], list[dict]]:
    return _api.training_providers(), _api.assessment_centers()


def _all_pages(fetch: Callable[..., list[dict]], **params) -> tuple[list[dict], bool]:
    """Every page of a listing, up to MAX_PAGES. The flag says whether more were left unread."""
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        batch = fetch(limit=PAGE_SIZE, offset=page * PAGE_SIZE, **params)
        rows += batch
        if len(batch) < PAGE_SIZE:
            return rows, False
    return rows, True


@st.cache_data(ttl="2m", show_spinner=False, max_entries=64)
def _listings(base_url: str, _api: ApiClient, qualification_code: str | None) -> tuple[list[dict], list[dict], bool]:
    params = {"qualification_code": qualification_code} if qualification_code else {}
    programs, more_programs = _all_pages(_api.training_programs, **params)
    schedules, more_schedules = _all_pages(_api.schedules, **params)
    return programs, schedules, more_programs or more_schedules


def _load(api_client: ApiClient, codes: Iterable[str]) -> tuple[list[dict], list[dict], list[dict], list[dict], bool]:
    providers, assessment_centers = _sites(api_client.base_url, api_client)
    programs, schedules, truncated = [], [], False
    for code in list(codes) or [None]:
        more_programs, more_schedules, more_left = _listings(api_client.base_url, api_client, code)
        programs += more_programs
        schedules += more_schedules
        truncated = truncated or more_left
    return providers, assessment_centers, programs, schedules, truncated


def _defaults(qualification_codes: list[str]) -> dict:
    return {"training_kinds": [TRAINING, ASSESSMENT], "training_use_location": False, "training_place": "",
            "training_region": None, "training_province": None, "training_qualifications": qualification_codes,
            "training_mode": None, "training_availability": None, "training_scholarship": False,
            "training_use_location_top": False, "training_search": "", "training_sort": "nearest",
            "training_selected": None, "training_route": None, "training_list_limit": LIST_STEP,
            "training_filters_open": True, "training_all_listings": False, "training_saved": [],
            "training_focus": 0, "training_program": None, "training_travel_mode": "car",
            # Which filter sections are open. Type and location start open, as in the design.
            "training_section_type": True, "training_section_location": True, "training_section_region": False,
            "training_section_province": False, "training_section_qualification": False}


def _set_location_wanted(wanted: bool) -> None:
    """The toolbar's location switch and the filter panel's are one setting."""
    st.session_state["training_use_location"] = st.session_state["training_use_location_top"] = wanted
    st.session_state.pop("training_location_error", None)
    if not wanted:
        st.session_state.pop("training_location", None)
        # Routes start at the learner's location, so they go with it.
        st.session_state["training_route"] = None
        st.session_state.pop("training_routes", None)


def _toggle_location_from_toolbar() -> None:
    _set_location_wanted(st.session_state["training_use_location_top"])


def _toggle_location_from_panel() -> None:
    _set_location_wanted(st.session_state["training_use_location"])


def _locate_me() -> None:
    """Ask the browser for the learner's location again, as the map's locate button does."""
    _set_location_wanted(True)
    st.session_state.pop("training_location", None)


def _clear_filters() -> None:
    defaults = _defaults([])
    for key in (*FILTER_KEYS, "training_search", "training_selected", "training_list_limit"):
        st.session_state[key] = defaults[key]
    _set_location_wanted(False)


def _toggle_filters() -> None:
    st.session_state["training_filters_open"] = not st.session_state["training_filters_open"]


def _open_section(name: str) -> None:
    st.session_state[f"training_section_{name}"] = True


def _select(center_id: str | None) -> None:
    if center_id != st.session_state["training_selected"]:
        st.session_state["training_all_listings"] = False
    st.session_state["training_selected"] = center_id


def _focus(center_id: str) -> None:
    """Select a center and show it on the map, even when it is already selected."""
    _select(center_id)
    st.session_state["training_focus"] += 1


def _toggle_all_listings() -> None:
    st.session_state["training_all_listings"] = not st.session_state["training_all_listings"]


def _show_more() -> None:
    st.session_state["training_list_limit"] += LIST_STEP


def _open_program(program_id: int) -> None:
    st.session_state["training_program"] = program_id


def _close_program() -> None:
    st.session_state["training_program"] = None


def _map_event(name: str):
    return (st.session_state.get(MAP_KEY) or {}).get(name)


def _on_center_picked() -> None:
    picked = _map_event("picked")
    if isinstance(picked, str):
        _select(picked)


def _on_located() -> None:
    point = _map_event("located")
    try:
        latitude, longitude = round(float(point["latitude"]), 2), round(float(point["longitude"]), 2)
    except (KeyError, TypeError, ValueError):
        return
    if -90 <= latitude <= 90 and -180 <= longitude <= 180:
        _set_location_wanted(True)
        st.session_state["training_location"] = {"latitude": latitude, "longitude": longitude}


def _on_location_failed() -> None:
    code = _map_event("location_failed")
    _set_location_wanted(False)
    st.session_state["training_location_error"] = code if code in LOCATION_ERRORS else "unavailable"


def _show_route(center_id: str | None) -> None:
    """Directions for a center select it too: a route belongs to the selected center.

    Asking again retries the travel modes that had no route last time; the public router is sometimes just slow.
    """
    if center_id:
        _select(center_id)
        memo = st.session_state.get("training_routes", {})
        for memo_key in [memo_key for memo_key, route in memo.items() if route is None]:
            memo.pop(memo_key)
    st.session_state["training_route"] = center_id


def _on_route_asked() -> None:
    """Directions in a pin's popup: open that center and draw the road route to it."""
    center_id = _map_event("route")
    if isinstance(center_id, str):
        _show_route(center_id)


def _on_travel_mode() -> None:
    """A route's label or line on the map picks that travel mode."""
    mode = _map_event("travel_mode")
    if mode in TRAVEL:
        st.session_state["training_travel_mode"] = mode


def _on_saved() -> None:
    """The popup's bookmark: saved centers are marked in the results for the rest of the visit."""
    center_id = _map_event("saved")
    if isinstance(center_id, str):
        saved = st.session_state["training_saved"]
        st.session_state["training_saved"] = ([item for item in saved if item != center_id] if center_id in saved
                                              else [*saved, center_id])


def _routes(router: RouteClient, location: dict, center: dict) -> tuple[dict[str, dict], str | None]:
    """Routes from the learner's location to a center for every travel mode the router has, car first, then an
    estimated flight when the trip is long enough to fly.

    Kept for the session so the router is asked once per trip and mode. A mode without a route is left out and not
    asked again; the error comes back only when no mode has a route, and then the next request tries again.
    """
    origin = {"latitude": location["latitude"], "longitude": location["longitude"]}
    destination = {"latitude": center["latitude"], "longitude": center["longitude"]}
    memo = st.session_state.setdefault("training_routes", {})
    keys = {mode: json.dumps([origin, destination, mode]) for mode in router.modes}

    def attempt(mode: str) -> tuple[dict | None, str | None]:
        try:
            return router.route(origin, destination, mode), None
        except RouteError as failure:
            return None, failure.message

    missing = [mode for mode, memo_key in keys.items() if memo_key not in memo]
    # Side by side: the router may take many seconds each, and the client still starts one request a second.
    with ThreadPoolExecutor(max_workers=max(1, len(missing))) as pool:
        outcomes = dict(zip(missing, pool.map(attempt, missing)))
    error = None
    for mode, (route, failure) in outcomes.items():
        memo[keys[mode]] = route
        error = error or failure
    found = {mode: memo[memo_key] for mode, memo_key in keys.items() if memo[memo_key]}
    plane = flight(origin, destination)
    if plane:
        found["plane"] = plane
    if not found:
        for memo_key in keys.values():
            memo.pop(memo_key, None)
    while len(memo) > 24:
        memo.pop(next(iter(memo)))
    return found, None if found else error or UNAVAILABLE


def _fit(api_client: ApiClient, token: str | None, code: str, goal: str | None, place: dict | None,
         mode: str | None, scholarship: bool) -> dict[int, dict]:
    """Fit scores for a qualification's programs. Kept for the session: each ranking is logged by the API.

    `place` is a place the learner searched for. Their own location is never passed: the API keeps an audit of
    every ranking, and the page promises that location isn't saved.
    """
    body = {"qualification_code": code, "goal": goal, "preferred_delivery_mode": mode,
            "needs_scholarship": scholarship, "limit": 50}
    if place:
        body.update(near_lat=round(place["latitude"], 1), near_lon=round(place["longitude"], 1))
    memo = st.session_state.setdefault("training_fit", {})
    memo_key = json.dumps(body, sort_keys=True)
    if memo_key not in memo:
        ranking = api_client.rank_training(token, **body)
        memo[memo_key] = {item["program"]["id"]: {"score": item["score"], "explanation": item["explanation"]}
                          for item in ranking["results"]}
        while len(memo) > 16:
            memo.pop(next(iter(memo)))
    return memo[memo_key]


def _header() -> None:
    title, tools = st.columns([1, 1.15], vertical_alignment="bottom", gap="medium")
    with title:
        section_header("Training & assessment", "Find a training or assessment center",
                       "Discover TESDA-accredited training centers and assessment centers near you or in any location.")
    with tools, st.container(horizontal=True, horizontal_alignment="right", vertical_alignment="center",
                             key="training_toolbar"):
        st.toggle(":material/location_on: Use my location", key="training_use_location_top",
                  on_change=_toggle_location_from_toolbar)
        st.text_input("Search centers", key="training_search", type="search",
                      placeholder="Search by location, center name, or program…", label_visibility="collapsed")


def _filter_counts(state) -> dict[str, int]:
    """How many filters each section sets. Both center types together filter nothing."""
    kinds = state["training_kinds"] or []
    return {"type": len(kinds) if len(kinds) == 1 else 0,
            "location": int(bool(state["training_use_location"])) + int(bool((state["training_place"] or "").strip())),
            "region": int(bool(state["training_region"])), "province": int(bool(state["training_province"])),
            "qualification": len(state["training_qualifications"]),
            "more": (int(bool(state["training_mode"])) + int(bool(state["training_availability"]))
                     + int(bool(state["training_scholarship"])))}


def _badge(count: int) -> str:
    return f" :blue-badge[{count}]" if count else ""


def _section(name: str, icon: str, title: str, count: int):
    """A filter section. Whether it is open lives in Session State (see _defaults), so its summary can follow it."""
    return st.expander(f"**{title}**{_badge(count)}", key=f"training_section_{name}", icon=icon, on_change="rerun")


def _section_summary(name: str, text: str, empty: bool = False) -> None:
    """What a collapsed section holds. Selecting it opens the section."""
    with st.container(key=f"training_summary_{name}{'_empty' if empty else ''}"):
        st.button(plain(text), key=f"training_button_open_{name}", type="tertiary", width="stretch",
                  on_click=_open_section, args=(name,))


def _filters(names: dict[str, str], regions: dict, province_options: list[str], place_text: str,
             place: dict | None, waiting_for_location: bool) -> None:
    """The filter panel. Filters apply as soon as they change; the panel folds away to free the map."""
    state = st.session_state
    counts = _filter_counts(state)
    is_open = state["training_filters_open"]
    with st.container(key="training_filters_panel" if is_open else "training_filters_panel_folded", border=True):
        with st.container(horizontal=True, vertical_alignment="center", gap="small", key="training_filters_head"):
            st.markdown(f":material/tune: **Filters**{_badge(sum(counts.values()))}")
            st.space("stretch")
            st.button("Clear all", key="training_button_clear", type="tertiary", on_click=_clear_filters)
            st.button("Hide filters" if is_open else "Show filters", key="training_button_fold",
                      icon=":material/expand_less:" if is_open else ":material/expand_more:", on_click=_toggle_filters)
        if not is_open:
            return

        with _section("type", ":material/school:", "Type", counts["type"]) as section:
            st.segmented_control("Center type", [TRAINING, ASSESSMENT], selection_mode="multi",
                                 format_func=lambda kind: f"{KIND_ICONS[kind]} {KIND_LABELS[kind]}",
                                 key="training_kinds", label_visibility="collapsed", width="stretch")
        if not section.open:
            kinds = state["training_kinds"] or []
            _section_summary("type", KIND_LABELS[kinds[0]] if len(kinds) == 1 else "Training and assessment centers")

        with _section("location", ":material/location_on:", "Location", counts["location"]) as section:
            st.toggle("Use my current location", key="training_use_location", on_change=_toggle_location_from_panel,
                      help=LOCATION_HELP)
            error = state.get("training_location_error")
            if error:
                st.caption(f":material/location_off: {LOCATION_ERRORS.get(error, LOCATION_ERRORS['unavailable'])}")
            elif waiting_for_location:
                st.caption(":material/my_location: Waiting for your browser to share your location…")
            with st.container(horizontal=True, vertical_alignment="center", gap=None, key="training_place_box"):
                st.text_input("Search location", key="training_place", type="search",
                              placeholder="Enter city, province, or region", icon=":material/location_on:",
                              label_visibility="collapsed",
                              help="Distances are measured from this place when your own location is off.")
                st.button("Use my current location", key="training_button_locate", icon=":material/my_location:",
                          type="tertiary", on_click=_locate_me)
            if place_text.strip() and not place:
                st.caption(f"We couldn't find “{plain(place_text.strip())}”. Try a city, province or region name.")
        if not section.open:
            where = [*(["Your location"] if state["training_use_location"] else []),
                     *([place_text.strip()] if place_text.strip() else [])]
            _section_summary("location", " · ".join(where) or "Anywhere", empty=not where)

        with _section("region", ":material/shield:", "Region", counts["region"]) as section:
            st.selectbox("Region", list(regions), index=None, format_func=lambda code: regions[code]["name"],
                         key="training_region", placeholder="Select region", label_visibility="collapsed")
        if not section.open:
            region = state["training_region"]
            _section_summary("region", regions[region]["name"] if region else "Select region", empty=not region)

        with _section("province", ":material/location_city:", "Province", counts["province"]) as section:
            st.selectbox("Province", province_options, index=None, key="training_province",
                         placeholder="Select province" if province_options
                         else "No provinces listed for this region" if state["training_region"]
                         else "No provinces listed yet",
                         disabled=not province_options, label_visibility="collapsed")
        if not section.open:
            _section_summary("province", state["training_province"] or "Select province",
                             empty=not state["training_province"])

        with _section("qualification", ":material/work:", "Qualification / skills / job",
                      counts["qualification"]) as section:
            st.multiselect("Qualification", list(names), format_func=names.get, key="training_qualifications",
                           placeholder="Search by qualification, skill or job title", label_visibility="collapsed")
        if not section.open:
            chosen = [_short_name(names[code]) for code in state["training_qualifications"]]
            _section_summary("qualification", ", ".join(chosen) or "Any qualification", empty=not chosen)

        with st.popover(f"More filters{_badge(counts['more'])}", icon=":material/tune:", width="stretch",
                        key="training_more_filters"):
            st.selectbox("Mode of delivery", list(DELIVERY_LABELS), index=None, format_func=DELIVERY_LABELS.get,
                         key="training_mode", placeholder="Select mode", help="Applies to training centers.")
            st.selectbox("Availability", list(AVAILABILITY), index=None, format_func=AVAILABILITY.get,
                         key="training_availability", placeholder="Select availability",
                         help="Programs with a flexible start count as available.")
            st.checkbox("Scholarship available", key="training_scholarship", help="Applies to training centers.")


def _kind_badges(center: dict, saved: bool) -> None:
    with st.container(horizontal=True, gap="xsmall", key=f"center_badges_{center['id']}"):
        st.badge(KIND_LABELS[center["kind"]], icon=KIND_ICONS[center["kind"]], color=KIND_COLORS[center["kind"]])
        if center["distance_km"] is not None:
            st.badge(f"{_kilometres(center['distance_km'])} away", icon=":material/distance:", color="gray")
        if saved:
            st.badge("Saved", icon=":material/bookmark:", color="violet")


def _center_row(center: dict, today: date, saved: bool) -> None:
    with st.container(key=f"center_row_{center['id']}", horizontal=True, vertical_alignment="center", gap="small"):
        st.image(str(CENTER_PHOTO), width=72, alt="")
        with st.container(gap=None):
            st.markdown(f"**{plain(center['name'])}**")
            st.caption(f":material/location_on: {plain(place_label(center))}")
            _kind_badges(center, saved)
            st.caption(summary(center, today))
        st.button("View details", key=f"center_open_{center['id']}", icon=":material/chevron_right:",
                  type="tertiary", on_click=_select, args=(center["id"],))


def _apply(api_client: ApiClient, token: str, schedule_id: int) -> None:
    try:
        api_client.apply_for_assessment(token, schedule_id)
    except ApiError as error:
        if error.status_code not in (409, 422):
            raise
        st.session_state["training_notice"] = ("warning", error.message)
    else:
        st.session_state["training_notice"] = ("success", "Application sent. Track it under My progress.")
        _listings.clear()  # seats changed
    st.rerun()


def _listings_head(title: str, count: int) -> bool:
    """The heading over a center's programs or assessments. Says whether to show them all."""
    showing_all = st.session_state["training_all_listings"]
    with st.container(horizontal=True, horizontal_alignment="distribute", vertical_alignment="center",
                      key="center_listings_head"):
        st.subheader(f"{title} ({count})", anchor=False)
        if count > PREVIEW:
            st.button("Show fewer" if showing_all else "View all", key="training_button_all", type="tertiary",
                      on_click=_toggle_all_listings)
    return showing_all


def _program_facts(program: dict, today: date) -> list[str]:
    facts = [DELIVERY_LABELS.get(program["delivery_mode"], program["delivery_mode"])]
    if program.get("duration_hours"):
        facts.append(f"{program['duration_hours']} hours")
    start = date.fromisoformat(program["start_date"]) if program.get("start_date") else None
    facts.append("Flexible start" if start is None
                 else f"{'Starts' if start >= today else 'Started'} {friendly_day(start, today)}")
    if program.get("cost") is not None:
        facts.append("Free" if float(program["cost"]) == 0 else _peso(program["cost"]))
    return facts


def _program_cards(center: dict, fits: dict[int, dict], today: date) -> None:
    programs = sorted(center["programs"], key=lambda item: (item.get("start_date") or "9999", item["title"]))
    showing_all = _listings_head("Training programs", len(programs))
    if not programs:
        st.caption("No programs are listed here for your search yet.")
    for program in programs if showing_all else programs[:PREVIEW]:
        fit = fits.get(program["id"])
        with st.container(border=True, horizontal=True, vertical_alignment="center", gap="small",
                          key=f"card_center_program_{program['id']}"):
            st.image(str(_listing_photo(program)), width=108, alt="")
            with st.container(gap="xsmall"):
                st.markdown(f"**{plain(program['title'])}**")
                qualification = program["qualification"]["name"]
                if qualification.casefold() not in program["title"].casefold():
                    st.caption(plain(qualification))
                st.caption(f"{DELIVERY_ICONS.get(program['delivery_mode'], ':material/school:')} "
                           + " • ".join(_program_facts(program, today)))
                if fit or program.get("scholarship_available"):
                    with st.container(horizontal=True, gap="xsmall"):
                        if fit:
                            st.badge(f"{fit['score']}% fit", icon=":material/auto_awesome:", color="blue")
                        if program.get("scholarship_available"):
                            st.badge("Scholarship available", icon=":material/check_circle:", color="green")
                if fit and fit["explanation"]:
                    with st.expander("Why this program?", icon=":material/info:"):
                        st.markdown("\n".join(f"- {plain(reason)}" for reason in fit["explanation"]))
                        st.caption("Fit considers your goal, location, start date and preferences.")
            st.button("Program details", key=f"program_open_{program['id']}", icon=":material/chevron_right:",
                      type="tertiary", on_click=_open_program, args=(program["id"],))


def _schedule_cards(center: dict, api_client: ApiClient, token: str | None,
                    on_sign_in: Callable[[], None] | None) -> None:
    schedules = sorted(center["schedules"], key=lambda item: item["scheduled_at"])
    showing_all = _listings_head("Upcoming assessments", len(schedules))
    if not schedules:
        st.caption("No upcoming assessments are listed here for your search yet.")
        return
    st.caption("Times are in Philippine time.")
    if not token:
        if on_sign_in:
            st.button("Sign in to apply", key="apply_sign_in", icon=":material/login:", on_click=on_sign_in)
        else:
            st.caption("Sign in to apply for an assessment.")
    for schedule in schedules if showing_all else schedules[:PREVIEW]:
        open_seats = schedule["seats_left"] > 0
        with st.container(border=True, horizontal=True, vertical_alignment="center", gap="small",
                          key=f"card_center_schedule_{schedule['id']}"):
            st.image(str(_listing_photo(schedule)), width=108, alt="")
            with st.container(gap="xsmall"):
                st.markdown(f"**{_local_time(schedule['scheduled_at'])}**")
                st.caption(plain(schedule["qualification"]["name"]))
                facts = [f"{schedule['seats_left']} of {schedule['slots']} seats left"]
                if schedule.get("fee") is not None:
                    facts.append("No fee" if float(schedule["fee"]) == 0 else f"{_peso(schedule['fee'])} fee")
                st.caption(":material/event_seat: " + " • ".join(facts))
                if not open_seats:
                    st.badge("Fully booked", icon=":material/event_busy:", color="orange")
                elif token and st.button("Apply", key=f"apply_{schedule['id']}", type="primary",
                                         icon=":material/send:"):
                    _apply(api_client, token, schedule["id"])


def _detail(center: dict, api_client: ApiClient, token: str | None, fits: dict[int, dict], today: date,
            on_sign_in: Callable[[], None] | None, can_route: bool = False, routes: dict[str, dict] | None = None,
            nearest: bool = False, saved: bool = False, missing_modes: Iterable[str] = ()) -> None:
    """The selected center, or the first result until one is selected, with its programs or assessments."""
    with st.container(key="center_detail"):
        with st.container(border=True, key="center_feature"):
            if nearest:
                st.badge("Nearest to you", icon=":material/near_me:", color="blue")
            st.button("Show on map", key=f"center_open_{center['id']}", icon=":material/chevron_right:",
                      type="tertiary", on_click=_focus, args=(center["id"],))
            with st.container(horizontal=True, gap="small", key="center_feature_body"):
                st.image(str(CENTER_PHOTO), width=108, alt="")
                with st.container(gap="xsmall"):
                    st.markdown(f"**{plain(center['name'])}**")
                    st.caption(f":material/location_on: {plain(place_label(center))}")
                    _kind_badges(center, saved)
                    if center.get("address"):
                        st.caption(plain(center["address"]))
                    contact = [f":material/call: {plain(center['phone'])}" if center.get("phone") else None,
                               f":material/mail: [{plain(center['email'])}](mailto:{quote(center['email'], safe='@')})"
                               if center.get("email") else None]
                    if any(contact):
                        st.caption(" &nbsp;|&nbsp; ".join(filter(None, contact)))
            google_maps = (f"https://www.google.com/maps/dir/?api=1&destination={center['latitude']},"
                           f"{center['longitude']}" if center["latitude"] is not None else None)
            with st.container(horizontal=True, gap="small", key="center_actions"):
                if google_maps:
                    if not can_route:
                        st.link_button("Get directions", google_maps, icon=":material/near_me:", type="primary")
                    elif routes:
                        st.button("Hide route", key="training_button_hide_route", icon=":material/close:",
                                  type="primary", on_click=_show_route, args=(None,))
                    else:
                        st.button("Get directions", key="training_button_route", icon=":material/near_me:",
                                  type="primary", on_click=_show_route, args=(center["id"],))
                    st.button("View on map", key="training_button_focus", icon=":material/map:", on_click=_focus,
                              args=(center["id"],))
                website = center.get("website") or ""
                if website.startswith(("https://", "http://")):
                    st.link_button("Website", website, icon=":material/open_in_new:")
            if routes:
                st.segmented_control("Travel mode", list(routes), key="training_travel_mode", required=True,
                                     format_func=lambda mode: f"{TRAVEL[mode][0]} {'~' if mode == 'plane' else ''}"
                                                              f"{travel_time(routes[mode]['duration_min'])}",
                                     label_visibility="collapsed", width="stretch")
                mode = st.session_state["training_travel_mode"]
                route = routes[mode]
                if mode == "plane":
                    st.markdown(f":material/flight: **{plain(airport_label(route['departure']))}** to "
                                f"**{plain(airport_label(route['arrival']))}** · about "
                                f"{travel_time(route['duration_min'])} in the air")
                    st.caption(f"An estimate from the {_kilometres(route['distance_km'])} between the airports, not "
                               f"an airline schedule: check airlines for flights and fares. Allow time to reach the "
                               f"airport ({_kilometres(route['to_departure_km'])} from you), check in, and travel "
                               f"{_kilometres(route['from_arrival_km'])} on to the center.")
                else:
                    st.markdown(f":material/route: **{_kilometres(route['distance_km'])}** · "
                                f"about {travel_time(route['duration_min'])} {TRAVEL[mode][1]}")
                    st.caption("From your approximate location, without traffic.")
                missing = [MODE_NAMES[mode] for mode in missing_modes]
                if missing:
                    with st.container(horizontal=True, vertical_alignment="center", gap="small"):
                        st.caption(f"No {' or '.join(missing)} route could be loaded right now.")
                        st.button("Try again", key="training_button_retry_routes", type="tertiary",
                                  icon=":material/refresh:", on_click=_show_route, args=(center["id"],))
            if can_route and google_maps:
                st.link_button("Google Maps", google_maps, icon=":material/open_in_new:", type="tertiary",
                               help="Turn-by-turn directions")
        if center["kind"] == TRAINING:
            _program_cards(center, fits, today)
        else:
            _schedule_cards(center, api_client, token, on_sign_in)


@st.dialog("Program details", width="medium", on_dismiss=_close_program)
def _program_dialog(program: dict, center: dict, fit: dict | None, today: date) -> None:
    with st.container(horizontal=True, gap="medium", vertical_alignment="center"):
        st.image(str(_listing_photo(program)), width=150, alt="")
        with st.container(gap="xsmall"):
            st.markdown(f"**{plain(program['title'])}**")
            qualification = program["qualification"]
            st.caption(plain(f"{qualification['name']} · {qualification['sector']}" if qualification.get("sector")
                             else qualification["name"]))
            with st.container(horizontal=True, gap="xsmall"):
                if fit:
                    st.badge(f"{fit['score']}% fit", icon=":material/auto_awesome:", color="blue")
                if program.get("scholarship_available"):
                    st.badge("Scholarship available", icon=":material/check_circle:", color="green")
    start = date.fromisoformat(program["start_date"]) if program.get("start_date") else None
    end = date.fromisoformat(program["end_date"]) if program.get("end_date") else None
    rows = [(":material/account_balance:", "Where", f"{center['name']}, {place_label(center)}"),
            (DELIVERY_ICONS.get(program["delivery_mode"], ":material/school:"), "How",
             DELIVERY_LABELS.get(program["delivery_mode"], program["delivery_mode"])),
            (":material/schedule:", "Duration", f"{program['duration_hours']} hours"
             if program.get("duration_hours") else None),
            (":material/event:", "Starts", friendly_day(start, today) if start else "Flexible start"),
            (":material/event_available:", "Ends", friendly_day(end, today) if end else None),
            (":material/payments:", "Cost", None if program.get("cost") is None
             else "Free" if float(program["cost"]) == 0 else _peso(program["cost"])),
            (":material/group:", "Slots", f"{program['slots']} learners" if program.get("slots") else None)]
    st.markdown("\n".join(f"- {icon} **{label}:** {plain(value)}" for icon, label, value in rows if value))
    if program.get("description"):
        st.markdown(plain(program["description"]))
    if fit and fit["explanation"]:
        st.markdown("**Why this program?**")
        st.markdown("\n".join(f"- {plain(reason)}" for reason in fit["explanation"]))
    st.caption("Confirm the schedule, fees and requirements with the training center before you enroll.")


def _results(centers: list[dict], featured: dict | None, reference: dict | None, today: date, truncated: bool,
             detail: Callable[[dict], None]) -> None:
    with st.container(border=True, key="center_results"):
        notice = st.session_state.pop("training_notice", None)
        if notice:
            (st.success if notice[0] == "success" else st.warning)(notice[1])
        with st.container(horizontal=True, horizontal_alignment="distribute", vertical_alignment="center",
                          key="center_results_head"):
            st.subheader(f"All results ({len(centers)})", anchor=False)
            st.selectbox("Sort results", list(SORTS), format_func=SORTS.get, key="training_sort",
                         label_visibility="collapsed", width=180)
        if reference and not reference["mine"]:
            st.caption(f":material/near_me: Distances from {plain(reference['label'])}")
        elif not reference and st.session_state["training_sort"] == "nearest":
            st.caption("Turn on your location or search a place to sort by distance.")
        if truncated:
            st.caption("Some listings aren't shown. Choose a qualification to narrow your search.")
        if not featured:
            st.markdown("**No centers match your search**")
            st.caption("Try another place or qualification, or select Clear all.")
            return
        saved = set(st.session_state["training_saved"])
        others = [center for center in centers if center["id"] != featured["id"]]
        limit = st.session_state["training_list_limit"]
        with st.container(height=600, border=False, key="center_list"):
            detail(featured)
            if others:
                st.subheader(f"Other centers ({len(others)})", anchor=False)
            for center in others[:limit]:
                _center_row(center, today, center["id"] in saved)
            if len(others) > limit:
                st.button(f"Show more ({len(others) - limit} more)", key="training_button_more", type="tertiary",
                          icon=":material/expand_more:", width="stretch", on_click=_show_more)


def show_training(qualifications: list[dict], api_client: ApiClient, regions: list[dict] | dict,
                  token: str | None, goal: str | None = None, on_sign_in: Callable[[], None] | None = None,
                  default_qualifications: Iterable[str] = (), router: RouteClient | None = None,
                  basemap_key: str = "") -> None:
    """The center finder: filters, a map whose pins can be selected, results, and the featured center's details.

    With a `router`, Directions draw the road route from the learner's own location; without one, or without a
    location, they open Google Maps. `basemap_key` is a CARTO basemaps key; without it the map uses OpenStreetMap.
    """
    regions = {region["code"]: region for region in regions} if isinstance(regions, list) else regions
    names = {qualification["code"]: qualification["name"] for qualification in qualifications}
    for key, value in _defaults([code for code in default_qualifications if code in names]).items():
        st.session_state.setdefault(key, value)
    st.html(_STYLES)
    _header()
    state = st.session_state
    state["training_qualifications"] = [code for code in state["training_qualifications"] if code in names]
    if state["training_region"] not in regions:
        state["training_region"] = None
    try:
        providers, assessment_centers, programs, schedules, truncated = _load(api_client,
                                                                              state["training_qualifications"])
    except ApiError as error:
        if error.status_code == 401:
            raise
        st.error(error.message, icon=":material/cloud_off:")
        if st.button("Try again", key="training_button_retry", icon=":material/refresh:"):
            _sites.clear()
            _listings.clear()
            st.rerun()
        return
    today = datetime.now(PHILIPPINE_TIME).date()
    everything = build_centers(providers, assessment_centers, programs, schedules, regions)
    province_options = provinces(everything, state["training_region"])
    if state["training_province"] not in province_options:
        state["training_province"] = None
    location = state.get("training_location") if state["training_use_location"] else None
    place_text = state["training_place"] or ""
    place = find_place(place_text, everything, regions) if place_text.strip() else None
    reference = ({**location, "label": "your location", "mine": True} if location
                 else {**place, "mine": False} if place else None)
    filters = Filters(kinds=tuple(state["training_kinds"] or ()), region_code=state["training_region"],
                      province=state["training_province"], text=state["training_search"] or "",
                      qualification_codes=tuple(state["training_qualifications"]),
                      delivery_mode=state["training_mode"], within_days=state["training_availability"],
                      scholarship=state["training_scholarship"])
    order = state["training_sort"] if reference or state["training_sort"] != "nearest" else "name"
    centers = sort_centers(with_distances(filter_centers(everything, filters, today), reference), order, today)
    selected = next((center for center in centers if center["id"] == state["training_selected"]), None)
    state["training_selected"] = selected["id"] if selected else None
    # Until a center is selected, the first result is the one shown in full.
    featured = selected or (centers[0] if centers else None)
    measured = [center for center in centers if center["distance_km"] is not None]
    nearest_id = min(measured, key=lambda center: center["distance_km"])["id"] if measured else None
    # A route belongs to the selected center and starts at the learner's own location.
    can_route = bool(router and location)
    if not (can_route and selected and selected["latitude"] is not None
            and state["training_route"] == selected["id"]):
        state["training_route"] = None
    fits: dict[int, dict] = {}
    if featured and featured["kind"] == TRAINING:
        for code in sorted({program["qualification"]["code"] for program in featured["programs"]}
                           & set(state["training_qualifications"])):
            try:
                fits |= _fit(api_client, token, code, goal, None if location else place, state["training_mode"],
                             state["training_scholarship"])
            except ApiError as error:
                if error.status_code == 401:
                    raise

    with st.container(key="training_workspace"):
        map_column, results_column = st.columns([3, 1], gap="small")
    # The results come first: the wait for routes shows there, and the map needs the routes.
    routes: dict[str, dict] = {}
    with results_column:
        if state["training_route"]:
            with st.spinner("Finding routes…", show_time=True):
                routes, error = _routes(router, location, selected)
            if error:
                state["training_route"] = None
                state["training_notice"] = ("warning", error)
        if routes and state["training_travel_mode"] not in routes:
            state["training_travel_mode"] = next(iter(routes))
        missing = [mode for mode in router.modes if mode not in routes] if routes else []
        _results(centers, featured, reference, today, truncated,
                 lambda center: _detail(center, api_client, token, fits, today, on_sign_in, can_route=can_route,
                                        routes=routes, nearest=center["id"] == nearest_id,
                                        saved=center["id"] in state["training_saved"], missing_modes=missing))
    # The filters float over the map's left edge, or drop below the map when it is narrow (training.css).
    with map_column, st.container(key="training_map_stage"):
        _filters(names, regions, province_options, place_text, place,
                 waiting_for_location=bool(state["training_use_location"] and not location))
        _CENTER_MAP(data={"centers": map_points(centers, today), "selected": state["training_selected"],
                          "reference": reference and {key: reference[key] for key in
                                                      ("latitude", "longitude", "label", "mine")},
                          "want_location": bool(state["training_use_location"] and not location),
                          "can_route": can_route, "saved": state["training_saved"], "focus": state["training_focus"],
                          "photo": _photo_uri(CENTER_PHOTO), "basemap_key": basemap_key,
                          "route": None if not routes else {
                              "center_id": selected["id"], "kind": selected["kind"],
                              "origin": [location["latitude"], location["longitude"]],
                              "destination": [selected["latitude"], selected["longitude"]],
                              "selected": state["training_travel_mode"],
                              "options": [{"mode": mode, "path": route["path"], "start": route["start"],
                                           "end": route["end"],
                                           "label": f"{'~' if mode == 'plane' else ''}"
                                                    f"{travel_time(route['duration_min'])} · "
                                                    f"{_kilometres(route['distance_km'])}"}
                                          for mode, route in routes.items()]},
                          "glyphs": GLYPHS},
                    key=MAP_KEY, on_picked_change=_on_center_picked, on_located_change=_on_located,
                    on_location_failed_change=_on_location_failed, on_route_change=_on_route_asked,
                    on_saved_change=_on_saved, on_travel_mode_change=_on_travel_mode)
    program = next((item for item in (featured or {}).get("programs", []) if item["id"] == state["training_program"]),
                   None)
    # One dialog at a time: the account dialog, opened from Sign in to apply, comes first.
    if program and not state.get("account_dialog_open"):
        _program_dialog(program, featured, fits.get(program["id"]), today)
    else:
        state["training_program"] = None
