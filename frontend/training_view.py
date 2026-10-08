"""Training and assessment: find a center with filters, a selectable map, a result list and center details."""
from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterable
from datetime import date, datetime
from pathlib import Path

import streamlit as st

from api_client import ApiClient, ApiError
from centers import (ASSESSMENT, KIND_LABELS, PHILIPPINE_TIME, TRAINING, Filters, build_centers, filter_centers,
                     find_place, friendly_day, map_points, place_label, provinces, sort_centers, summary,
                     with_distances)
from directions import RouteClient, RouteError, travel_time
from presentation import section_header

DELIVERY_LABELS = {"institution_based": "In a training center", "enterprise_based": "At a workplace",
                   "community_based": "In the community", "online": "Online"}
AVAILABILITY = {30: "Starts within 30 days", 90: "Starts within 3 months"}
SORTS = {"nearest": "Nearest first", "soonest": "Soonest start", "name": "Name (A–Z)"}
KIND_COLORS = {TRAINING: "blue", ASSESSMENT: "green"}
# One glyph per center type (24-unit grid), drawn on the result tiles here and on the map pins in the browser.
GLYPHS = {TRAINING: '<path d="M12 6.5 4.5 10 12 13.5 19.5 10 12 6.5Z M7.5 11.6v3.1c2.6 1.7 6.4 1.7 9 0v-3.1 M19.5 10v4.2"/>',
          ASSESSMENT: '<circle cx="12" cy="9.6" r="3.7"/><path d="m9.5 12.6-1.3 4.9 3.8-1.8 3.8 1.8-1.3-4.9"/>'}
TILE_COLORS = {TRAINING: ("#eaf1fd", "#175cd3"), ASSESSMENT: ("#e3f5ee", "#0d9488")}
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
MAP_KEY = "center_map"
# The filter panel's widgets hold a draft; Search copies it here, and the results follow this copy.
APPLIED = "training_applied"
FILTER_KEYS = ("training_kinds", "training_use_location", "training_place", "training_region", "training_province",
               "training_qualifications", "training_mode", "training_availability", "training_scholarship")
_MARKDOWN = re.compile(r"([\\`*_{}\[\]()#+\-.!|>~:$<])")
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
        <span><i class="legend-pin training"></i>Training center</span>
        <span><i class="legend-pin assessment"></i>Assessment center</span>
      </div>
    </div>
    """,
    css="""
    :host { display: block; font-family: var(--st-font, "Segoe UI", Arial, sans-serif); }
    .map-shell { position: relative; height: 700px; overflow: hidden; border: 1px solid #dfe7f2; border-radius: 16px;
                 background: #aad3df; box-shadow: 0 2px 8px #102a5608;
                 scroll-margin-top: 72px; }  /* clear of the app's fixed header when a route scrolls it into view */
    #center-map { position: absolute; inset: 0; }
    .map-shell .leaflet-container { font-family: inherit; font-size: 12px; background: #aad3df; }
    .map-status { position: absolute; z-index: 800; top: 12px; left: 60px; right: 12px; padding: 9px 12px;
                  border-radius: 10px; background: #ffffffee; color: #52647e; font-size: 13px;
                  box-shadow: 0 2px 10px #102a5614; pointer-events: none; }
    .map-status[hidden] { display: none; }
    .map-legend { position: absolute; z-index: 800; left: 12px; bottom: 14px; display: flex; gap: 16px; flex-wrap: wrap;
                  padding: 10px 14px; border-radius: 10px; background: #fff; color: #52647e; font-size: 12px;
                  box-shadow: 0 2px 10px #102a5614; }
    .map-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend-pin { width: 11px; height: 11px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #175cd3; }
    .legend-pin.assessment { background: #0d9488; }
    .center-pin { width: 34px; height: 44px; transform-origin: 50% 100%; transition: transform .15s ease;
                  filter: drop-shadow(0 3px 3px #102a5644); }
    .center-pin svg { display: block; width: 100%; height: 100%; }
    .center-pin.selected { transform: scale(1.25); filter: drop-shadow(0 0 7px #175cd3aa); }
    .center-pin.assessment.selected { filter: drop-shadow(0 0 7px #0d9488aa); }
    .center-cluster { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 50%;
                      background: #175cd32e; }
    .center-cluster span { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%;
                           background: #175cd3; border: 2px solid #fff; color: #fff; font-size: 13px; font-weight: 700; }
    .reference-dot { width: 16px; height: 16px; border-radius: 50%; background: #175cd3; border: 3px solid #fff;
                     box-shadow: 0 0 0 6px #175cd333, 0 1px 4px #102a5666; box-sizing: border-box; }
    .reference-dot.place { background: #102a56; box-shadow: 0 0 0 6px #102a5622, 0 1px 4px #102a5666; }
    .map-shell .leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 8px 24px #102a562e; }
    .map-shell .leaflet-popup-content { margin: 12px 14px; width: 248px !important; line-height: 1.4; }
    .popup { display: grid; grid-template-columns: 52px 1fr; gap: 10px 12px; color: #52647e; font-size: 12px; }
    .popup-tile { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 12px; background: #eaf1fd; }
    .popup-tile.assessment { background: #e3f5ee; }
    .popup-tile svg { width: 26px; height: 26px; }
    .popup-name { color: #102a56; font-size: 13.5px; font-weight: 700; line-height: 1.3; }
    .popup-place { margin-top: 2px; }
    .popup-badge { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 999px; background: #eaf1fd;
                   color: #175cd3; font-size: 11px; font-weight: 600; }
    .popup-badge.assessment { background: #e3f5ee; color: #11664c; }
    .popup-meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px 12px; }
    .popup-actions { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 8px; padding-top: 8px;
                     border-top: 1px solid #eef2f8; }
    .popup-actions a, .popup-actions button { color: #175cd3; font: inherit; font-weight: 650; text-decoration: none;
                                              background: none; border: 0; padding: 0; cursor: pointer; }
    .map-shell .leaflet-bar { border: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px #102a5624; }
    .map-shell .leaflet-bar a { width: 36px; height: 36px; line-height: 36px; color: #102a56; }
    .map-shell .locate-control a { display: grid; place-items: center; }
    .map-shell .locate-control svg { width: 18px; height: 18px; }
    .map-shell .route-label { padding: 4px 10px; border: 0; border-radius: 999px; background: #102a56; color: #fff;
                              font-size: 12px; font-weight: 700; box-shadow: 0 2px 8px #102a5640; }
    @media (max-width: 640px) { .map-shell { height: 440px; } .map-legend { font-size: 11px; gap: 10px; } }
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
    let GLYPHS = { training: '', assessment: '' }  // sent by Python with the data, so pins match the result tiles
    const CROSSHAIR = '<svg viewBox="0 0 24 24" fill="none" stroke="#102a56" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="#102a56"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
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
    const tileSvg = kind => `<svg viewBox="0 0 24 24" fill="none" stroke="${COLORS[kind]}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[kind]}</svg>`

    function pinIcon(L, kind, selected) {
      return L.divIcon({ className: '', html: `<div class="center-pin ${kind}${selected ? ' selected' : ''}">${pinSvg(kind)}</div>`,
                         iconSize: [34, 44], iconAnchor: [17, 43], popupAnchor: [0, -38] })
    }

    function popupHtml(center, canRoute) {
      const kind = kindOf(center.kind)
      const destination = encodeURIComponent(`${center.latitude},${center.longitude}`)
      const distance = center.distance_km == null ? '' : `<span>${kilometres(center.distance_km)} away</span>`
      // From the learner's own location the route is drawn on this map; otherwise Google Maps finds one.
      const directions = canRoute
        ? `<button type="button" data-route="${escapeHtml(center.id)}">Directions</button>`
        : `<a href="https://www.google.com/maps/dir/?api=1&destination=${destination}" target="_blank" rel="noopener noreferrer">Directions ↗</a>`
      return `<div class="popup">
        <div class="popup-tile ${kind}">${tileSvg(kind)}</div>
        <div><div class="popup-name">${escapeHtml(center.name)}</div>
          <div class="popup-place">${escapeHtml(center.place)}</div>
          <span class="popup-badge ${kind}">${kind === 'assessment' ? 'Assessment center' : 'Training center'}</span></div>
        <div class="popup-meta">${distance}<span>${escapeHtml(center.summary)}</span></div>
        <div class="popup-actions">
          <button type="button" data-details>View details ›</button>
          ${directions}
        </div></div>`
    }

    function setStatus(view, message) {
      view.status.textContent = message || ''
      view.status.hidden = !message
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

    function createView(root, L) {
      const element = root.querySelector('#center-map')
      const map = L.map(element, { zoomSnap: 0.5, scrollWheelZoom: false, tap: true })
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>')
      map.fitBounds(PHILIPPINES)
      // The page scrolls past the map; wheel zoom only after the map is clicked into.
      map.on('focus click', () => map.scrollWheelZoom.enable())
      map.on('blur', () => map.scrollWheelZoom.disable())
      const view = { map, L, markers: new Map(), selected: null, fingerprint: null, framing: null, asked: false,
                     canRoute: false, routeKey: null, routeLayer: null, shell: root.querySelector('.map-shell'),
                     status: root.querySelector('.map-status'), emit: () => {} }
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map)
      tiles.once('load', () => { if (view.status.textContent === 'Loading the map…') setStatus(view, '') })
      tiles.on('tileerror', () => setStatus(view, 'Some map tiles could not load. The list of centers still works.'))
      view.group = L.markerClusterGroup
        ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, spiderfyOnMaxZoom: true,
            iconCreateFunction: cluster => L.divIcon({ className: '', iconSize: [46, 46],
              html: `<div class="center-cluster"><span>${cluster.getChildCount()}</span></div>` }) })
        : L.featureGroup()
      view.group.addTo(map)
      const Locate = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
        const box = L.DomUtil.create('div', 'leaflet-bar locate-control')
        const button = L.DomUtil.create('a', '', box)
        Object.assign(button, { href: '#', title: 'Show centers near me', innerHTML: CROSSHAIR })
        button.setAttribute('role', 'button')
        button.setAttribute('aria-label', 'Show centers near me')
        L.DomEvent.on(button, 'click', event => { L.DomEvent.stop(event); locate(view) })
        return box
      } })
      map.addControl(new Locate())
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
      })
      new ResizeObserver(() => map.invalidateSize()).observe(element)
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
        // Built as it opens, so Directions follow the learner's location being on or off.
        marker.bindPopup(() => popupHtml(center, view.canRoute), { maxWidth: 280, autoPanPadding: [24, 24] })
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
      const icon = L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8],
                               html: `<div class="reference-dot${reference.mine ? '' : ' place'}"></div>` })
      // Beneath the pins and cluster counts, which are what people click.
      view.referenceMarker = L.marker([reference.latitude, reference.longitude], { icon, keyboard: false, zIndexOffset: -1000 })
        .bindTooltip(reference.mine ? 'Your approximate location' : escapeHtml(reference.label), { direction: 'top', offset: [0, -8] })
        .addTo(view.map)
    }

    function frame(view, centers, reference) {
      const { L, map } = view
      if (!centers.length) {
        if (reference) map.setView([reference.latitude, reference.longitude], 9)
        else map.fitBounds(PHILIPPINES)
        return
      }
      let points = centers.map(center => [center.latitude, center.longitude])
      if (reference) {
        // Near a place: show it with its closest centers rather than the whole country.
        const nearest = [...centers].filter(center => center.distance_km != null)
          .sort((a, b) => a.distance_km - b.distance_km).slice(0, 6)
        points = [[reference.latitude, reference.longitude], ...nearest.map(center => [center.latitude, center.longitude])]
      }
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 13 })
    }

    function revealMap(view) {
      // Directions asked for below the map, as on phones, would otherwise be drawn out of sight.
      const box = view.shell.getBoundingClientRect()
      const onScreen = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
      if (onScreen < box.height * 0.75) view.shell.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }

    function drawRoute(view, route) {
      const { L, map } = view
      const key = route && JSON.stringify([route.center_id, route.origin, route.destination, route.path.length])
      if (key === view.routeKey) return
      view.routeKey = key
      if (view.routeLayer) {
        view.routeLayer.remove()
        map.attributionControl.removeAttribution(ROUTE_CREDIT)
        view.routeLayer = null
      }
      if (!route) return
      const still = { interactive: false, lineJoin: 'round' }
      // Dotted where there's no road: from the approximate location to the nearest road, and from the last road on.
      const dotted = { ...still, color: COLORS.training, weight: 3, opacity: 0.8, dashArray: '1 7', lineCap: 'round' }
      const line = L.polyline(route.path, { ...still, color: COLORS.training, weight: 6, opacity: 0.95 })
      view.routeLayer = L.layerGroup([
        L.polyline([route.origin, route.start], dotted),
        L.polyline([route.end, route.destination], dotted),
        L.polyline(route.path, { ...still, color: '#fff', weight: 10, opacity: 0.9 }),
        line,
        // The center's own pin can be folded into a cluster at this zoom; this copy always marks the end.
        L.marker(route.destination, { icon: pinIcon(L, kindOf(route.kind), true), interactive: false, keyboard: false,
                                      zIndexOffset: 2000 }),
      ]).addTo(map)
      line.bindTooltip(escapeHtml(route.label), { permanent: true, direction: 'center', className: 'route-label' })
      map.attributionControl.addAttribution(ROUTE_CREDIT)
      map.closePopup()
      map.fitBounds(L.latLngBounds([route.origin, route.destination, ...route.path]), { padding: [56, 56], maxZoom: 16 })
      revealMap(view)
    }

    export default function (component) {
      const { parentElement: root, data, setTriggerValue } = component
      let disposed = false
      libraries(root).then(L => {
        if (disposed || !root.querySelector('#center-map')) return
        let view = views.get(root)
        if (!view) {
          view = createView(root, L)
          views.set(root, view)
        }
        view.emit = setTriggerValue
        view.canRoute = Boolean(data?.can_route)
        if (data?.glyphs) GLYPHS = data.glyphs
        const centers = (data?.centers || []).filter(center =>
          Number.isFinite(center.latitude) && Number.isFinite(center.longitude))
        const reference = data?.reference || null
        const route = data?.route || null
        const fingerprint = JSON.stringify(centers.map(center => [center.id, center.latitude, center.longitude, center.distance_km, center.summary]))
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
        if (selected !== view.selected) {
          markSelected(view, selected)
          if (!selected) view.map.closePopup()
          else if (!route) showSelected(view, selected)
        }
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
            "training_selected": None, "training_route": None, "training_list_limit": LIST_STEP}


def _draft() -> dict:
    return {key: st.session_state[key] for key in FILTER_KEYS}


def _set_location_wanted(wanted: bool) -> None:
    """The toolbar toggle and the map apply at once, so the location choice skips the draft."""
    st.session_state["training_use_location"] = st.session_state["training_use_location_top"] = wanted
    st.session_state[APPLIED] = {**st.session_state.get(APPLIED, _draft()), "training_use_location": wanted}
    st.session_state.pop("training_location_error", None)
    if not wanted:
        st.session_state.pop("training_location", None)
        # Routes start at the learner's location, so they go with it.
        st.session_state["training_route"] = None
        st.session_state.pop("training_routes", None)


def _toggle_location_from_toolbar() -> None:
    _set_location_wanted(st.session_state["training_use_location_top"])


def _apply_filters() -> None:
    st.session_state[APPLIED] = _draft()
    _set_location_wanted(st.session_state["training_use_location"])
    st.session_state["training_selected"] = None
    st.session_state["training_list_limit"] = LIST_STEP


def _clear_filters() -> None:
    for key, value in _defaults([]).items():
        st.session_state[key] = value
    st.session_state[APPLIED] = _draft()
    _set_location_wanted(False)


def _select(center_id: str | None) -> None:
    st.session_state["training_selected"] = center_id


def _show_more() -> None:
    st.session_state["training_list_limit"] += LIST_STEP


def _map_event(name: str):
    return (st.session_state.get(MAP_KEY) or {}).get(name)


def _on_center_picked() -> None:
    picked = _map_event("picked")
    if isinstance(picked, str):
        st.session_state["training_selected"] = picked


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
    st.session_state["training_route"] = center_id


def _on_route_asked() -> None:
    """Directions in a pin's popup: open that center and draw the road route to it."""
    center_id = _map_event("route")
    if isinstance(center_id, str):
        st.session_state["training_selected"] = st.session_state["training_route"] = center_id


def _route(router: RouteClient, location: dict, center: dict) -> dict:
    """The road route from the learner's location to a center, kept for the session so the router is asked once."""
    origin = {"latitude": location["latitude"], "longitude": location["longitude"]}
    destination = {"latitude": center["latitude"], "longitude": center["longitude"]}
    memo = st.session_state.setdefault("training_routes", {})
    memo_key = json.dumps([origin, destination])
    if memo_key not in memo:
        memo[memo_key] = router.route(origin, destination)
        while len(memo) > 8:
            memo.pop(next(iter(memo)))
    return memo[memo_key]


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


def _tile(kind: str, size: int = 64) -> None:
    """The center type's glyph on a tinted tile, standing in for a photo (none are on file)."""
    background, ink = TILE_COLORS[kind]
    st.image(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64">'
             f'<rect width="64" height="64" rx="13" fill="{background}"/>'
             f'<g transform="translate(15 14) scale(1.42)" fill="none" stroke="{ink}" stroke-width="1.5" '
             f'stroke-linecap="round" stroke-linejoin="round">{GLYPHS[kind]}</g></svg>', width=size, alt="")


def _label(icon: str, title: str, note: str = "") -> None:
    st.markdown(f"{icon} **{title}**" + (f" {note}" if note else ""))


def _header() -> None:
    title, tools = st.columns([1.35, 1], vertical_alignment="bottom", gap="medium")
    with title:
        section_header("Training & assessment", "Find a training or assessment center",
                       "Discover TESDA-accredited training centers and assessment centers near you or in any location.")
    with tools, st.container(horizontal=True, horizontal_alignment="right", vertical_alignment="center",
                             key="training_toolbar"):
        st.toggle("Use my location", key="training_use_location_top", on_change=_toggle_location_from_toolbar,
                  help=LOCATION_HELP)
        st.text_input("Search centers", key="training_search", placeholder="Search by location, center name…",
                      icon=":material/search:", label_visibility="collapsed", width=320)


def _filters(names: dict[str, str], regions: dict, province_options: list[str], place_text: str,
             place: dict | None, waiting_for_location: bool) -> None:
    # Not a form: choosing a region has to rerun the page so the province list can follow it. The results
    # still wait for Search, because they're drawn from the applied copy of these filters.
    with st.container(key="training_filters_panel", border=True):
        with st.container(horizontal=True, horizontal_alignment="distribute", vertical_alignment="center"):
            st.markdown("**Filters**")
            st.button("Clear all", key="training_button_clear", type="tertiary", on_click=_clear_filters)
        _label(":material/layers:", "Type")
        st.segmented_control("Center type", [TRAINING, ASSESSMENT], selection_mode="multi",
                             format_func=KIND_LABELS.get, key="training_kinds", label_visibility="collapsed",
                             width="stretch")
        _label(":material/location_on:", "Location")
        st.toggle("Use my current location", key="training_use_location", help=LOCATION_HELP)
        error = st.session_state.get("training_location_error")
        if error:
            st.caption(f":material/location_off: {LOCATION_ERRORS.get(error, LOCATION_ERRORS['unavailable'])}")
        elif waiting_for_location:
            st.caption(":material/my_location: Waiting for your browser to share your location…")
        # Enter searches, as it did when the panel was a form.
        st.text_input("Search location", key="training_place", placeholder="Enter city, province, or region",
                      icon=":material/pin_drop:", on_change=_apply_filters,
                      help="Distances are measured from this place when your own location is off.")
        if place_text.strip() and not place:
            st.caption(f"We couldn't find “{plain(place_text.strip())}”. Try a city, province or region name.")
        st.selectbox("Region", list(regions), index=None, format_func=lambda code: regions[code]["name"],
                     key="training_region", placeholder="Select region")
        st.selectbox("Province", province_options, index=None, key="training_province",
                     placeholder="Select province" if province_options
                     else "No provinces listed for this region" if st.session_state["training_region"]
                     else "No provinces listed yet",
                     disabled=not province_options)
        _label(":material/work:", "Qualification / skills / job")
        st.multiselect("Qualification", list(names), format_func=names.get, key="training_qualifications",
                       placeholder="Search by qualification, skill or job title", label_visibility="collapsed")
        _label(":material/filter_alt:", "Additional filters", "(optional)")
        st.selectbox("Mode of delivery", list(DELIVERY_LABELS), index=None, format_func=DELIVERY_LABELS.get,
                     key="training_mode", placeholder="Select mode", help="Applies to training centers.")
        st.selectbox("Availability", list(AVAILABILITY), index=None, format_func=AVAILABILITY.get,
                     key="training_availability", placeholder="Select availability",
                     help="Programs with a flexible start count as available.")
        st.checkbox("Scholarship available", key="training_scholarship", help="Applies to training centers.")
        st.button("Search", key="training_button_search", type="primary", icon=":material/search:",
                  width="stretch", on_click=_apply_filters)


def _center_row(center: dict, today: date) -> None:
    with st.container(key=f"center_row_{center['id']}", horizontal=True, vertical_alignment="center", gap="small"):
        _tile(center["kind"])
        with st.container(gap=None):
            st.markdown(f"**{plain(center['name'])}**")
            st.caption(plain(place_label(center)))
            if center["distance_km"] is not None:
                st.markdown(f":blue[:material/location_on: {_kilometres(center['distance_km'])}]")
            st.badge(KIND_LABELS[center["kind"]], color=KIND_COLORS[center["kind"]])
            st.caption(summary(center, today))
        st.button("View details", key=f"center_open_{center['id']}", icon=":material/chevron_right:",
                  type="tertiary", on_click=_select, args=(center["id"],))


def _results(centers: list[dict], reference: dict | None, today: date, truncated: bool) -> None:
    count = len(centers)
    with st.container(horizontal=True, horizontal_alignment="distribute", vertical_alignment="center",
                      key="center_results_head"):
        st.markdown(f"Showing {count} result{'' if count == 1 else 's'}")
        st.selectbox("Sort results", list(SORTS), format_func=SORTS.get, key="training_sort",
                     label_visibility="collapsed", width=170)
    if reference:
        where = "your approximate location" if reference["mine"] else plain(reference["label"])
        st.caption(f":material/near_me: Distances from {where}")
    elif st.session_state["training_sort"] == "nearest":
        st.caption("Turn on your location or search a place to sort by distance.")
    if truncated:
        st.caption("Some listings aren't shown. Choose a qualification to narrow your search.")
    if not centers:
        st.markdown("**No centers match your search**")
        st.caption("Try another place or qualification, or select Clear all.")
        return
    limit = st.session_state["training_list_limit"]
    with st.container(height=560, border=False, key="center_list"):
        for center in centers[:limit]:
            _center_row(center, today)
        if count > limit:
            st.button(f"Show more ({count - limit} more)", key="training_button_more", type="tertiary",
                      icon=":material/expand_more:", width="stretch", on_click=_show_more)


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


def _program_cards(center: dict, fits: dict[int, dict], today: date) -> None:
    st.markdown(f"**Training programs** ({len(center['programs'])})")
    if not center["programs"]:
        st.caption("No programs are listed here for your search yet.")
    for program in sorted(center["programs"], key=lambda item: (item.get("start_date") or "9999", item["title"])):
        fit = fits.get(program["id"])
        with st.container(border=True, gap="xsmall", key=f"card_center_program_{program['id']}"):
            st.markdown(f"**{plain(program['title'])}**")
            qualification = program["qualification"]["name"]
            if qualification.casefold() not in program["title"].casefold():
                st.caption(plain(qualification))
            facts = [DELIVERY_LABELS.get(program["delivery_mode"], program["delivery_mode"])]
            if program.get("duration_hours"):
                facts.append(f"{program['duration_hours']} hours")
            start = date.fromisoformat(program["start_date"]) if program.get("start_date") else None
            facts.append("Flexible start" if start is None
                         else f"{'Starts' if start >= today else 'Started'} {friendly_day(start, today)}")
            if program.get("cost") is not None:
                facts.append("Free" if float(program["cost"]) == 0 else f"₱{float(program['cost']):,.2f}")
            st.caption(" · ".join(facts))
            with st.container(horizontal=True, gap="small"):
                if fit:
                    st.badge(f"{fit['score']}% fit", icon=":material/auto_awesome:", color="blue")
                if program.get("scholarship_available"):
                    st.badge("Scholarship available", icon=":material/volunteer_activism:", color="green")
            if fit and fit["explanation"]:
                with st.expander("Why this program?", icon=":material/info:"):
                    st.markdown("\n".join(f"- {plain(reason)}" for reason in fit["explanation"]))
                    st.caption("Fit considers your goal, location, start date and preferences.")


def _schedule_cards(center: dict, api_client: ApiClient, token: str | None,
                    on_sign_in: Callable[[], None] | None) -> None:
    st.markdown(f"**Upcoming assessments** ({len(center['schedules'])})")
    if not center["schedules"]:
        st.caption("No upcoming assessments are listed here for your search yet.")
        return
    st.caption("Times are in Philippine time.")
    if not token:
        if on_sign_in:
            st.button("Sign in to apply", key="apply_sign_in", icon=":material/login:", on_click=on_sign_in)
        else:
            st.caption("Sign in to apply for an assessment.")
    for schedule in sorted(center["schedules"], key=lambda item: item["scheduled_at"]):
        open_seats = schedule["seats_left"] > 0
        with st.container(border=True, gap="xsmall", key=f"card_center_schedule_{schedule['id']}"):
            st.markdown(f"**{_local_time(schedule['scheduled_at'])}**")
            st.caption(plain(schedule["qualification"]["name"]))
            facts = [f"{schedule['seats_left']} of {schedule['slots']} seats left"]
            if schedule.get("fee") is not None:
                facts.append("No fee" if float(schedule["fee"]) == 0 else f"₱{float(schedule['fee']):,.2f} fee")
            st.caption(" · ".join(facts))
            if not open_seats:
                st.badge("Fully booked", icon=":material/event_busy:", color="orange")
            elif token and st.button("Apply", key=f"apply_{schedule['id']}", type="primary", icon=":material/send:",
                                     width="stretch"):
                _apply(api_client, token, schedule["id"])


def _detail(center: dict, api_client: ApiClient, token: str | None, fits: dict[int, dict], today: date,
            on_sign_in: Callable[[], None] | None, can_route: bool = False, route: dict | None = None) -> None:
    with st.container(key="center_detail"):
        st.button("All results", key="training_button_back", icon=":material/arrow_back:", type="tertiary",
                  on_click=_select, args=(None,))
        with st.container(horizontal=True, vertical_alignment="center", gap="small"):
            _tile(center["kind"], size=56)
            with st.container(gap=None):
                st.markdown(f"**{plain(center['name'])}**")
                st.caption(plain(place_label(center)))
        with st.container(horizontal=True, gap="small"):
            st.badge(KIND_LABELS[center["kind"]], color=KIND_COLORS[center["kind"]])
            if center["distance_km"] is not None:
                st.badge(f"{_kilometres(center['distance_km'])} away", icon=":material/near_me:", color="gray")
        contact = [f":material/home_pin: {plain(center['address'])}" if center.get("address") else None,
                   f":material/mail: {plain(center['email'])}" if center.get("email") else None,
                   f":material/call: {plain(center['phone'])}" if center.get("phone") else None]
        for line in filter(None, contact):
            st.caption(line)
        with st.container(horizontal=True, gap="small"):
            if center["latitude"] is not None:
                google_maps = (f"https://www.google.com/maps/dir/?api=1&destination="
                               f"{center['latitude']},{center['longitude']}")
                if not can_route:
                    st.link_button("Directions", google_maps, icon=":material/directions:")
                elif route:
                    st.button("Hide route", key="training_button_hide_route", icon=":material/close:",
                              on_click=_show_route, args=(None,))
                else:
                    st.button("Directions", key="training_button_route", icon=":material/directions:",
                              on_click=_show_route, args=(center["id"],))
                if can_route:
                    st.link_button("Google Maps", google_maps, icon=":material/map:")
            website = center.get("website") or ""
            if website.startswith(("https://", "http://")):
                st.link_button("Website", website, icon=":material/open_in_new:")
        if route:
            st.markdown(f":material/route: **{_kilometres(route['distance_km'])} by road** · "
                        f"about {travel_time(route['duration_min'])} by car")
            st.caption("From your approximate location, without traffic. Google Maps has turn-by-turn directions.")
        st.divider()
        if center["kind"] == TRAINING:
            _program_cards(center, fits, today)
        else:
            _schedule_cards(center, api_client, token, on_sign_in)


def show_training(qualifications: list[dict], api_client: ApiClient, regions: list[dict] | dict,
                  token: str | None, goal: str | None = None, on_sign_in: Callable[[], None] | None = None,
                  default_qualifications: Iterable[str] = (), router: RouteClient | None = None) -> None:
    """The center finder: filters, a map whose pins can be selected, results, and the selected center's details.

    With a `router`, Directions draw the road route from the learner's own location; without one, or without a
    location, they open Google Maps.
    """
    regions = {region["code"]: region for region in regions} if isinstance(regions, list) else regions
    names = {qualification["code"]: qualification["name"] for qualification in qualifications}
    for key, value in _defaults([code for code in default_qualifications if code in names]).items():
        st.session_state.setdefault(key, value)
    st.session_state.setdefault(APPLIED, _draft())
    st.html(_STYLES)
    _header()
    state, applied = st.session_state, st.session_state[APPLIED]
    for values in (state, applied):
        values["training_qualifications"] = [code for code in values["training_qualifications"] if code in names]
        if values["training_region"] not in regions:
            values["training_region"] = None
    try:
        providers, assessment_centers, programs, schedules, truncated = _load(api_client,
                                                                              applied["training_qualifications"])
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
    for values in (state, applied):
        if values["training_province"] not in provinces(everything, values["training_region"]):
            values["training_province"] = None
    province_options = provinces(everything, state["training_region"])
    location = state.get("training_location") if applied["training_use_location"] else None
    place_text = applied["training_place"] or ""
    place = find_place(place_text, everything, regions) if place_text.strip() else None
    reference = ({**location, "label": "your location", "mine": True} if location
                 else {**place, "mine": False} if place else None)
    filters = Filters(kinds=tuple(applied["training_kinds"] or ()), region_code=applied["training_region"],
                      province=applied["training_province"], text=state["training_search"] or "",
                      qualification_codes=tuple(applied["training_qualifications"]),
                      delivery_mode=applied["training_mode"], within_days=applied["training_availability"],
                      scholarship=applied["training_scholarship"])
    order = state["training_sort"] if reference or state["training_sort"] != "nearest" else "name"
    centers = sort_centers(with_distances(filter_centers(everything, filters, today), reference), order, today)
    selected = next((center for center in centers if center["id"] == state["training_selected"]), None)
    state["training_selected"] = selected["id"] if selected else None
    # A route belongs to the center being viewed and starts at the learner's own location.
    can_route = bool(router and location)
    if not (can_route and selected and selected["latitude"] is not None
            and state["training_route"] == selected["id"]):
        state["training_route"] = None
    route = None
    if state["training_route"]:
        try:
            route = _route(router, location, selected)
        except RouteError as error:
            state["training_route"] = None
            state["training_notice"] = ("warning", error.message)

    with st.container(key="training_workspace"):
        filters_column, map_column, results_column = st.columns([1, 1.7, 1.28], gap="small")
    with filters_column:
        _filters(names, regions, province_options, place_text, place,
                 waiting_for_location=bool(applied["training_use_location"] and not location))
    with map_column:
        _CENTER_MAP(data={"centers": map_points(centers, today), "selected": state["training_selected"],
                          "reference": reference and {key: reference[key] for key in
                                                      ("latitude", "longitude", "label", "mine")},
                          "want_location": bool(applied["training_use_location"] and not location),
                          "can_route": can_route,
                          "route": route and {
                              "center_id": selected["id"], "kind": selected["kind"], "path": route["path"],
                              "origin": [location["latitude"], location["longitude"]],
                              "destination": [selected["latitude"], selected["longitude"]],
                              "start": route["start"], "end": route["end"],
                              "label": f"{travel_time(route['duration_min'])} · {_kilometres(route['distance_km'])}"},
                          "glyphs": GLYPHS},
                    key=MAP_KEY, on_picked_change=_on_center_picked, on_located_change=_on_located,
                    on_location_failed_change=_on_location_failed, on_route_change=_on_route_asked)
    with results_column, st.container(border=True, key="center_results"):
        notice = state.pop("training_notice", None)
        if notice:
            (st.success if notice[0] == "success" else st.warning)(notice[1])
        if selected:
            fits = {}
            if selected["kind"] == TRAINING:
                for code in sorted({program["qualification"]["code"] for program in selected["programs"]}
                                   & set(applied["training_qualifications"])):
                    try:
                        fits |= _fit(api_client, token, code, goal, None if location else place,
                                     applied["training_mode"], applied["training_scholarship"])
                    except ApiError as error:
                        if error.status_code == 401:
                            raise
            _detail(selected, api_client, token, fits, today, on_sign_in, can_route=can_route, route=route)
        else:
            _results(centers, reference, today, truncated)
