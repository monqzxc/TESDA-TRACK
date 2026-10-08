"""Skills Bridge exploration UI; all external requests go through our API."""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
import re

import streamlit as st

from api_client import ApiClient, ApiError
from presentation import empty_state, section_header


_LEADING_REQUEST = re.compile(
    r"^\s*(?:please\s+)?(?:i\s+(?:want|would\s+like|need|plan|hope|am\s+looking)\s+to\s+|"
    r"i(?:'m|\s+am)\s+(?:currently\s+)?|i\s+(?:have|know)\s+(?:some\s+|the\s+)?|"
    r"my\s+(?:skills?|experience)\s+(?:include|are)\s+|"
    r"skills?\s*:\s*|what\s+(?:jobs?|occupations?|careers?)\s+(?:can\s+i\s+get\s+with|fit\s+my\s+skills?\s+in)\s*)",
    re.IGNORECASE,
)
_ROLE_PREFIX = re.compile(r"^(?:to\s+)?(?:become|be|work\s+as|learn|study|pursue)\s+", re.IGNORECASE)
_OCCUPATION_WORDS = {
    "welder", "programmer", "developer", "engineer", "technician", "mechanic", "electrician", "carpenter",
    "plumber", "mason", "chef", "cook", "baker", "barista", "bartender", "caregiver", "driver", "nurse",
    "teacher", "accountant", "designer", "analyst", "farmer", "tailor", "machinist", "waiter", "waitress",
    "hairdresser", "housekeeper", "architect", "operator", "fabricator", "welder", "stylist", "manager",
}


# This is an inline Streamlit Custom Component v2 rather than the deprecated
# components.v1 HTML helper. Leaflet renders inside the component's shadow root,
# while browser geolocation is returned as component state for the Python side to
# use in the existing near_lat/near_lon API filters.
_DELIVERY_MAP = st.components.v2.component(
    "tesda_track_delivery_map",
    html="""
    <style>
      :host { display: block; font-family: inherit; }
      .delivery-map-shell { position: relative; overflow: hidden; border: 1px solid rgba(100, 116, 139, .28); border-radius: 16px; background: #eef4f8; }
      .delivery-map { min-height: 430px; width: 100%; }
      .delivery-map-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: rgba(255, 255, 255, .94); border-bottom: 1px solid rgba(100, 116, 139, .18); color: #19324d; font-size: 13px; }
      .delivery-map-status { min-height: 18px; color: #526579; }
      .delivery-map-location { border: 1px solid #0b6bcb; border-radius: 999px; padding: 7px 12px; background: #fff; color: #0b5cad; cursor: pointer; font: inherit; font-weight: 650; white-space: nowrap; }
      .delivery-map-location:hover { background: #eaf4ff; }
      .delivery-map-location:disabled { opacity: .6; cursor: wait; }
      .delivery-map-legend { display: flex; gap: 12px; flex-wrap: wrap; padding: 8px 12px; background: rgba(255, 255, 255, .94); border-top: 1px solid rgba(100, 116, 139, .18); color: #526579; font-size: 12px; }
      .delivery-map-legend span::before { content: ''; display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 50%; background: currentColor; }
      .delivery-map-legend .provider { color: #0b6bcb; }
      .delivery-map-legend .assessment { color: #b46b00; }
      .delivery-map-legend .learner { color: #14804a; }
      .leaflet-container { font: inherit; }
      .leaflet-popup-content { line-height: 1.45; }
      .delivery-popup-title { margin-bottom: 4px; font-weight: 750; color: #19324d; }
      .delivery-popup-meta { color: #526579; font-size: 12px; }
      .delivery-popup-link { display: inline-block; margin-top: 8px; color: #0b5cad; font-weight: 650; text-decoration: none; }
    </style>
    <div class="delivery-map-shell">
      <div class="delivery-map-toolbar">
        <div class="delivery-map-status" id="delivery-map-status">Choose a marker to see a route.</div>
        <button class="delivery-map-location" id="delivery-map-location" type="button">Use my location</button>
      </div>
      <div class="delivery-map" id="delivery-map" aria-label="Training and assessment center map"></div>
      <div class="delivery-map-legend">
        <span class="provider">Training provider</span>
        <span class="assessment">Assessment center</span>
        <span class="learner">Your location</span>
      </div>
    </div>
    """,
    js="""
    const instances = new WeakMap()

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>'\"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;'
      }[character]))
    }

    function leafletFor(parentElement) {
      if (window.L) return Promise.resolve(window.L)
      if (parentElement.__tesdaLeafletPromise) return parentElement.__tesdaLeafletPromise
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      parentElement.append(css, script)
      parentElement.__tesdaLeafletPromise = new Promise((resolve, reject) => {
        script.onload = () => resolve(window.L)
        script.onerror = () => reject(new Error('Leaflet could not be loaded.'))
      })
      return parentElement.__tesdaLeafletPromise
    }

    function mapInstance(parentElement, L) {
      let instance = instances.get(parentElement)
      if (instance) return instance
      const mapElement = parentElement.querySelector('#delivery-map')
      const map = L.map(mapElement, { scrollWheelZoom: true, zoomControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map)
      instance = {
        map,
        markers: L.layerGroup().addTo(map),
        route: null,
        renderVersion: 0,
        selectedId: null,
        location: null,
      }
      instances.set(parentElement, instance)
      return instance
    }

    function drawRoute(instance, L, site, location, statusElement) {
      if (instance.route) instance.map.removeLayer(instance.route)
      if (!location) {
        statusElement.textContent = 'Allow location access to draw a route from you to this site.'
        return
      }
      const start = [Number(location.latitude), Number(location.longitude)]
      const end = [Number(site.latitude), Number(site.longitude)]
      const fallback = () => {
        instance.route = L.polyline([start, end], { color: '#0b6bcb', weight: 4, dashArray: '8 8', opacity: .85 }).addTo(instance.map)
        instance.map.fitBounds(L.latLngBounds([start, end]), { padding: [36, 36] })
        statusElement.textContent = 'Showing a direct path. Turn-by-turn routing is unavailable right now.'
      }
      instance.route = L.polyline([start, end], { color: '#0b6bcb', weight: 3, dashArray: '5 7', opacity: .5 }).addTo(instance.map)
      statusElement.textContent = `Building directions to ${site.name}…`
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`
      fetch(routeUrl)
        .then(response => response.ok ? response.json() : Promise.reject(new Error('Route request failed.')))
        .then(payload => {
          const geometry = payload?.routes?.[0]?.geometry
          if (!geometry) return fallback()
          if (instance.route) instance.map.removeLayer(instance.route)
          instance.route = L.geoJSON(geometry, { style: { color: '#0b6bcb', weight: 5, opacity: .9 } }).addTo(instance.map)
          instance.map.fitBounds(instance.route.getBounds(), { padding: [36, 36] })
          const minutes = payload.routes[0].duration ? Math.round(payload.routes[0].duration / 60) : null
          const distance = payload.routes[0].distance ? (payload.routes[0].distance / 1000).toFixed(1) : null
          statusElement.textContent = `Route to ${site.name}${distance ? ` · ${distance} km` : ''}${minutes ? ` · about ${minutes} min` : ''}`
        })
        .catch(fallback)
    }

    function render(component, L) {
      const { parentElement, data, setStateValue } = component
      const instance = mapInstance(parentElement, L)
      const map = instance.map
      const state = data || {}
      const sites = (state.sites || []).filter(site => Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude)))
      const statusElement = parentElement.querySelector('#delivery-map-status')
      const locationButton = parentElement.querySelector('#delivery-map-location')
      const selectedId = state.selected_site_id || instance.selectedId || (sites[0] && sites[0].id)
      instance.selectedId = selectedId || null
      instance.location = state.location || instance.location
      instance.renderVersion += 1
      const renderVersion = instance.renderVersion
      instance.markers.clearLayers()
      if (instance.route) {
        map.removeLayer(instance.route)
        instance.route = null
      }

      const points = []
      if (instance.location && Number.isFinite(Number(instance.location.latitude)) && Number.isFinite(Number(instance.location.longitude))) {
        const learnerPoint = [Number(instance.location.latitude), Number(instance.location.longitude)]
        points.push(learnerPoint)
        L.circleMarker(learnerPoint, { radius: 9, color: '#14804a', fillColor: '#35b978', fillOpacity: .95, weight: 3 })
          .bindPopup('<strong>Your approximate location</strong><br><span class="delivery-popup-meta">Used only for this site search.</span>')
          .addTo(instance.markers)
      }

      sites.forEach(site => {
        const point = [Number(site.latitude), Number(site.longitude)]
        points.push(point)
        const isAssessment = site.kind === 'assessment'
        const color = isAssessment ? '#b46b00' : '#0b6bcb'
        const distance = site.distance_km != null ? `<br><span class="delivery-popup-meta">${Number(site.distance_km).toFixed(1)} km away</span>` : ''
        const directions = instance.location
          ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${instance.location.latitude},${instance.location.longitude}`)}&destination=${encodeURIComponent(`${site.latitude},${site.longitude}`)}&travelmode=driving`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.latitude},${site.longitude}`)}`
        const popup = `<div class="delivery-popup-title">${escapeHtml(site.name)}</div><span class="delivery-popup-meta">${isAssessment ? 'Assessment center' : 'Training provider'} · ${escapeHtml(site.city || site.region || 'Location supplied')}${distance}</span><br><a class="delivery-popup-link" href="${directions}" target="_blank" rel="noopener">Open directions ↗</a>`
        const marker = L.circleMarker(point, { radius: site.id === selectedId ? 11 : 8, color, fillColor: color, fillOpacity: .88, weight: site.id === selectedId ? 4 : 2 })
          .bindPopup(popup)
          .on('click', () => {
            instance.selectedId = site.id
            setStateValue('selected_site_id', site.id)
            drawRoute(instance, L, site, instance.location, statusElement)
          })
          .addTo(instance.markers)
        if (site.id === selectedId) marker.openPopup()
      })

      if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 13 })
      if (selectedId && instance.location) {
        const selected = sites.find(site => site.id === selectedId)
        if (selected) drawRoute(instance, L, selected, instance.location, statusElement)
      } else if (!sites.length) {
        statusElement.textContent = 'No mapped sites are available for this qualification.'
      } else {
        statusElement.textContent = 'Choose a marker to see a route, or use your location first.'
      }

      locationButton.disabled = false
      locationButton.onclick = () => {
        if (!navigator.geolocation) {
          statusElement.textContent = 'This browser does not provide location access.'
          return
        }
        locationButton.disabled = true
        statusElement.textContent = 'Requesting your approximate location…'
        navigator.geolocation.getCurrentPosition(
          position => {
            const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
            instance.location = location
            setStateValue('location', location)
            locationButton.disabled = false
            // Draw immediately; the following Streamlit rerun will refresh the API results with near_lat/near_lon.
            render({ ...component, data: { ...state, location } }, L)
          },
          error => {
            locationButton.disabled = false
            statusElement.textContent = error.code === 1 ? 'Location permission was denied. You can still view all mapped sites.' : 'Location could not be determined. You can still view all mapped sites.'
          },
          { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
        )
      }
      if (renderVersion !== instance.renderVersion) return
    }

    export default function (component) {
      const { parentElement } = component
      if (!parentElement.querySelector('#delivery-map')) return
      leafletFor(parentElement)
        .then(L => render(component, L))
        .catch(error => {
          const statusElement = parentElement.querySelector('#delivery-map-status')
          if (statusElement) statusElement.textContent = error.message
        })
    }
    """,
)


def _extract_skill_terms(text: str) -> list[str]:
    """Turn a short natural-language skills request into provider search terms.

    Explicit comma/newline separated phrases remain intact so terms such as
    ``network configuration`` are not broken apart. In a sentence, only the
    common request filler and a final ``and`` joiner are removed. This keeps
    the transformation deterministic and visible to the learner.
    """
    terms: list[str] = []
    for chunk in re.split(r"[,;\n]+", text or ""):
        chunk = re.sub(r"[?.!]+$", "", chunk.strip())
        if not chunk:
            continue
        chunk = _LEADING_REQUEST.sub("", chunk, count=1).strip()
        chunk = _ROLE_PREFIX.sub("", chunk, count=1).strip()
        # Articles are request grammar, not taxonomy terms. Remove them only
        # at phrase boundaries; keep all words inside a multi-word skill.
        chunk = re.sub(r"^(?:a|an|the)\s+", "", chunk, flags=re.IGNORECASE)
        parts = re.split(r"\s+(?:and|&)\s+", chunk, flags=re.IGNORECASE)
        for part in parts:
            part = re.sub(r"^(?:and|&)\s+", "", part.strip(), flags=re.IGNORECASE)
            part = _ROLE_PREFIX.sub("", part.strip(), count=1).strip()
            part = re.sub(r"^(?:a|an|the)\s+", "", part, flags=re.IGNORECASE).strip()
            if part:
                terms.append(part)
    return list(dict.fromkeys(terms))


def _classify_terms(terms: list[str]) -> tuple[list[str], list[str]]:
    """Split target job titles from capability terms before selecting an MCP tool."""
    occupations, skills = [], []
    for term in terms:
        words = set(_normalise(term).split())
        if words & _OCCUPATION_WORDS:
            occupations.append(term)
        else:
            skills.append(term)
    return occupations, skills


def _lookup_bridge(api: ApiClient, terms: list[str]) -> dict:
    """Use occupation search for jobs and match_skills only for actual capabilities."""
    occupation_terms, skill_terms = _classify_terms(terms)
    client_ip = st.context.ip_address
    occupation_response = api.bridge_occupations(occupation_terms, client_ip) if occupation_terms else None
    skill_response = api.bridge_matches(skill_terms, client_ip) if skill_terms else None
    occupation_data = (occupation_response or {}).get("data", {})
    skill_data = (skill_response or {}).get("data", {})
    occupations = []
    seen_ids = set()
    for item in [{**item, "match_kind": "occupation"} for item in occupation_data.get("occupations", [])] + \
                [{**item, "match_kind": "skill"} for item in skill_data.get("occupations", [])]:
        key = item.get("occupation_id")
        if key in seen_ids:
            continue
        seen_ids.add(key)
        occupations.append(item)
    unmatched = []
    for term in [*occupation_data.get("unmatched", []), *skill_data.get("unmatched", [])]:
        if term not in unmatched:
            unmatched.append(term)
    resolution = [*occupation_data.get("resolution", []), *skill_data.get("resolution", [])]
    return {
        "source": "Skills Bridge",
        "retrieved_at": (occupation_response or skill_response or {}).get("retrieved_at", ""),
        "data": {
            "input": {"skills": terms, "occupation_terms": occupation_terms, "skill_terms": skill_terms},
            "unmatched": unmatched,
            "resolution": resolution,
            "occupations": occupations,
            "qualifications": skill_data.get("qualifications", []),
        },
    }


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _local_qualification(item: dict, qualifications: list[dict]) -> dict | None:
    """Find the closest local catalog record for a Skills Bridge standard.

    Skills Bridge and TESDA use different identifiers in some graphs, so an exact code match is preferred
    and a conservative title-token match is used as a fallback. The UI labels this as a local match rather
    than presenting it as an official equivalency.
    """
    code = str(item.get("code") or "").strip().lower()
    if code:
        for qualification in qualifications:
            if str(qualification.get("code") or "").strip().lower() == code:
                return qualification
    title_tokens = {token for token in _normalise(item.get("title") or item.get("name")).split()
                    if token not in {"nc", "i", "ii", "iii", "iv", "v", "vi", "programming"}}
    if not title_tokens:
        return None
    candidates = []
    for qualification in qualifications:
        local_tokens = set(_normalise(qualification.get("name")).split())
        overlap = len(title_tokens & local_tokens)
        if overlap:
            candidates.append((overlap / len(title_tokens), overlap, qualification))
    if not candidates:
        return None
    score, overlap, match = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
    return match if overlap >= 2 or score >= 0.75 else None


def _location_from_state(state: object) -> dict | None:
    """Validate the browser-provided point before using it in a server query."""
    if not isinstance(state, dict):
        return None
    try:
        latitude = float(state.get("latitude"))
        longitude = float(state.get("longitude"))
    except (TypeError, ValueError):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    location = {"latitude": latitude, "longitude": longitude}
    try:
        accuracy = float(state.get("accuracy"))
    except (TypeError, ValueError):
        accuracy = None
    if accuracy is not None and accuracy >= 0:
        location["accuracy"] = accuracy
    return location


def _distance_km(latitude: float, longitude: float, location: dict | None) -> float | None:
    if not location:
        return None
    earth_radius_km = 6371.0088
    lat1, lat2 = radians(float(location["latitude"])), radians(latitude)
    delta_lat = lat2 - lat1
    delta_lon = radians(longitude) - radians(float(location["longitude"]))
    haversine = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    return earth_radius_km * 2 * asin(sqrt(haversine))


def _delivery_sites(programs: list[dict], schedules: list[dict], location: dict | None) -> list[dict]:
    """Flatten provider and assessment responses into the map's small, safe data contract."""
    sites: dict[tuple[str, object, float, float], dict] = {}

    def add_site(kind: str, site: dict, detail: str, distance: object = None) -> None:
        try:
            latitude, longitude = float(site.get("latitude")), float(site.get("longitude"))
        except (TypeError, ValueError):
            return
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            return
        site_id = site.get("id") or f"{site.get('name', 'site')}:{latitude:.5f}:{longitude:.5f}"
        identity = (kind, site_id, round(latitude, 5), round(longitude, 5))
        if identity not in sites:
            try:
                distance_km = float(distance) if distance is not None else None
            except (TypeError, ValueError):
                distance_km = None
            if distance_km is None:
                distance_km = _distance_km(latitude, longitude, location)
            sites[identity] = {
                "id": f"{kind}-{site_id}",
                "kind": kind,
                "name": str(site.get("name") or ("Training provider" if kind == "training" else "Assessment center")),
                "city": site.get("city"),
                "region": site.get("region_code"),
                "latitude": latitude,
                "longitude": longitude,
                "distance_km": round(distance_km, 1) if distance_km is not None else None,
                "details": [],
            }
        if detail and detail not in sites[identity]["details"]:
            sites[identity]["details"].append(detail)

    for program in programs:
        provider = program.get("provider") or {}
        detail = " · ".join(filter(None, [
            str(program.get("title") or ""),
            f"{program.get('duration_hours')} hours" if program.get("duration_hours") else None,
            "Scholarship listed" if program.get("scholarship_available") else None,
        ]))
        add_site("training", provider, detail, program.get("distance_km"))
    for schedule in schedules:
        center = schedule.get("center") or {}
        when = str(schedule.get("scheduled_at") or "")[:16].replace("T", " ")
        detail = " · ".join(filter(None, [
            f"Assessment {when} UTC" if when else None,
            f"{schedule.get('seats_left')} seats left" if schedule.get("seats_left") is not None else None,
        ]))
        add_site("assessment", center, detail, schedule.get("distance_km"))
    return sorted(sites.values(), key=lambda site: (
        site["distance_km"] is None,
        site["distance_km"] if site["distance_km"] is not None else 0,
        site["kind"],
        site["name"],
    ))


def _delivery_query_signature(code: str, mode: str, radius_km: int, location: dict | None) -> tuple:
    return (
        code,
        mode,
        radius_km,
        round(location["latitude"], 4) if location else None,
        round(location["longitude"], 4) if location else None,
    )


def _delivery_query_params(code: str, mode: str, radius_km: int, location: dict | None) -> dict:
    params = {"qualification_code": code, "limit": 20}
    if location:
        params.update({"near_lat": location["latitude"], "near_lon": location["longitude"]})
        if mode == "Near me":
            params["radius_km"] = radius_km
    return params


def _show_delivery_options(api: ApiClient, item: dict, qualifications: list[dict], key: str) -> None:
    """Render an opt-in bridge from an external qualification to local site listings."""
    with st.expander("Find TESDA training & assessment options", icon=":material/pin_drop:"):
        local = _local_qualification(item, qualifications)
        if local is None:
            st.info("This Skills Bridge standard is not mapped to a local TESDA catalog code yet. "
                    "You can search the Qualification library or Training & assessment tab by title.")
            return
        code = local["code"]
        st.caption(f"Local catalog match: {local['name']} · {code}. This is a title/code mapping for discovery, not an equivalency decision.")
        result_key = f"bridge_delivery_{key}"
        map_key = f"bridge_delivery_map_{key}"
        component_state = st.session_state.get(map_key, {})
        location = _location_from_state(component_state.get("location"))
        if location:
            accuracy = f" (±{location['accuracy']:.0f} m)" if location.get("accuracy") is not None else ""
            st.caption(f"Using your approximate location: {location['latitude']:.5f}, {location['longitude']:.5f}{accuracy}. It is used only for this search and route preview.")
        else:
            st.caption("Use your browser location to sort nearby sites and draw a route. You can also browse all mapped sites without sharing it.")
        mode = st.segmented_control("Map view", ["Near me", "Show all"], default="Show all", key=f"bridge_delivery_mode_{key}") or "Show all"
        radius_km = st.selectbox("Nearby radius", [25, 50, 100, 200], index=1,
                                 format_func=lambda value: f"Within {value} km", key=f"bridge_delivery_radius_{key}")
        with st.form(f"bridge_delivery_form_{key}", border=False):
            show_sites = st.form_submit_button("Show available sites", icon=":material/search:")
        if mode == "Near me" and not location:
            st.info("Choose Show all to browse the catalog, or use the map's Use my location button first to filter nearby sites.", icon=":material/location_searching:")
        if show_sites:
            try:
                with st.spinner("Finding training and assessment sites…"):
                    query_params = _delivery_query_params(code, mode, radius_km, location)
                    st.session_state[result_key] = {
                        "programs": api.training_programs(**query_params),
                        "schedules": api.schedules(**query_params),
                        "signature": _delivery_query_signature(code, mode, radius_km, location),
                    }
            except ApiError as error:
                st.error(error.message)
        result = st.session_state.get(result_key)
        if result is None:
            st.caption("Select Show available sites to check the latest local listings.")
            return
        signature = _delivery_query_signature(code, mode, radius_km, location)
        if result.get("signature") != signature:
            try:
                with st.spinner("Updating site proximity…"):
                    query_params = _delivery_query_params(code, mode, radius_km, location)
                    result = {
                        "programs": api.training_programs(**query_params),
                        "schedules": api.schedules(**query_params),
                        "signature": signature,
                    }
                    st.session_state[result_key] = result
            except ApiError as error:
                st.error(error.message)
                return
        programs, schedules = result.get("programs", []), result.get("schedules", [])
        mapped_sites = _delivery_sites(programs, schedules, location)
        st.subheader("Map and directions", icon=":material/map:")
        if mapped_sites:
            _DELIVERY_MAP(
                key=map_key,
                data={
                    "sites": mapped_sites,
                    "location": location,
                    "selected_site_id": component_state.get("selected_site_id"),
                },
            )
            if location:
                st.caption("Select a marker to draw a route. The popup also opens turn-by-turn directions in Google Maps.")
            else:
                st.caption("Select Use my location on the map to capture your approximate coordinates and draw a route.")
        else:
            st.info("No mapped coordinates are available for these listings yet.")
        if programs:
            st.markdown("**Training providers**")
            for program in programs:
                provider = program.get("provider", {})
                location_label = ", ".join(str(value) for value in (provider.get("city"), provider.get("region_code")) if value)
                coordinates = ", ".join(str(value) for value in (provider.get("latitude"), provider.get("longitude")) if value)
                st.write(f"**{provider.get('name', 'Training provider')}** · {location_label or 'Location not supplied'}")
                st.caption(" · ".join(filter(None, [program.get("title"),
                                                       f"{program.get('duration_hours')} hours" if program.get("duration_hours") else None,
                                                       "Scholarship listed" if program.get("scholarship_available") else None,
                                                       f"Coordinates: {coordinates}" if coordinates else None])))
        else:
            st.info("No active training listing is mapped to this qualification yet.")
        if schedules:
            st.markdown("**Upcoming assessment schedules**")
            for schedule in schedules:
                center = schedule.get("center", {})
                when = str(schedule.get("scheduled_at", ""))[:16].replace("T", " ")
                location_label = ", ".join(str(value) for value in (center.get("city"), center.get("region_code")) if value)
                st.write(f"**{center.get('name', 'Assessment center')}** · {location_label or 'Location not supplied'}")
                st.caption(" · ".join(filter(None, [f"{when} UTC" if when else None,
                                                       f"{schedule.get('seats_left')} seats left" if schedule.get('seats_left') is not None else None,
                                                       f"Coordinates: {center.get('latitude')}, {center.get('longitude')}" if center.get('latitude') is not None else None])))
        else:
            st.info("No upcoming assessment schedule is mapped to this qualification yet.")


def _qualification(item: dict, key: str, api: ApiClient | None = None, qualifications: list[dict] | None = None) -> None:
    with st.container(border=True, key=key):
        st.badge(item.get("level_label") or "Qualification", color="blue", icon=":material/school:")
        st.subheader(item.get("title", "Qualification"))
        st.caption(f"{item.get('code', '')} · {str(item.get('status', 'Status unavailable')).replace('_', ' ').title()}")
        if item.get("terms_matched"):
            st.write("Linked input skills: " + ", ".join(item["terms_matched"]))
        if item.get("skill_share") is not None:
            st.caption(f"Your inputs account for {item['skill_share']:.0%} of this qualification's linked skill content.")
        if item.get("review_due_at"):
            st.caption(f"Review due: {item['review_due_at']}")
        if item.get("evidence"):
            with st.expander("See matching skills", icon=":material/fact_check:"):
                for evidence in item["evidence"]:
                    st.write(evidence.get("term", ""))
                    for skill in evidence.get("skills", []):
                        st.write(f"• {skill}")
        if api is not None and qualifications is not None:
            _show_delivery_options(api, item, qualifications, key)


def show_skills_bridge(api: ApiClient, qualifications: list[dict] | None = None) -> None:
    section_header("POWERED BY SKILLS BRIDGE", "See where your skills can take you.",
                   "Explore occupations, related qualifications, and skills to develop using Skills Bridge's live taxonomy.")
    with st.container(border=True, key="card_bridge_search"):
        with st.form("bridge_search", border=False):
            terms_text = st.text_area("What skills or roles are you exploring?", key="bridge_terms", height=105,
                                      placeholder="I want to be a welder and programmer",
                                      help="You can write a short sentence, or separate skills with commas or new lines. Use up to 25 short terms.")
            st.caption("Describe your skills or target roles in a short sentence. We extract the meaningful terms before sending them. Your name, email, account, and saved records are not sent.")
            submitted = st.form_submit_button("Find career matches", type="primary", icon=":material/travel_explore:")
        if submitted:
            terms = _extract_skill_terms(terms_text)
            if not terms or len(terms) > 25 or any(len(term) > 80 for term in terms):
                st.warning("We couldn't find usable skill or role terms. Try a short sentence or separate terms with commas, with no more than 25 terms of 80 characters each.")
            else:
                st.session_state.pop("bridge_matches", None)
                st.session_state.pop("bridge_details", None)
                st.session_state.pop("bridge_known_skills", None)
                st.session_state.pop("bridge_occupation", None)
                for key in list(st.session_state):
                    # Button widget keys are managed by Streamlit and are read-only during a rerun.
                    if str(key).startswith("bridge_delivery_") and "_button_" not in str(key):
                        st.session_state.pop(key, None)
                try:
                    with st.spinner("Looking up skills and career connections…"):
                        st.session_state["bridge_submitted_terms"] = terms
                        st.session_state["bridge_matches"] = _lookup_bridge(api, terms)
                except ApiError as error:
                    st.error(error.message)
                    st.caption("Your TESDA Track pathways and qualification library remain available.")
    response = st.session_state.get("bridge_matches")
    if not response:
        empty_state("Start with what you know", "Skills Bridge connects your input skills with occupations and qualifications. You can then review a role's skills and international mappings.", "growth")
        return
    data = response["data"]
    local_catalog = qualifications or []
    submitted_terms = data.get("input", {}).get("skills", [])
    st.caption("Searching Skills Bridge for: " + ", ".join(submitted_terms))
    st.caption(f"Source: Skills Bridge · Retrieved {response['retrieved_at'][:16].replace('T', ' ')} UTC")
    if data.get("unmatched"):
        st.info("Skills Bridge did not resolve some terms: " + ", ".join(str(term) for term in data["unmatched"]) + ". Try more specific skill names.")
    occupation_terms = data.get("input", {}).get("occupation_terms", [])
    skill_terms = data.get("input", {}).get("skill_terms", [])
    if occupation_terms and skill_terms:
        st.caption("We treated " + ", ".join(occupation_terms) + " as target occupations and " +
                   ", ".join(skill_terms) + " as capabilities.")
    elif occupation_terms:
        st.caption("We treated " + ", ".join(occupation_terms) + " as target occupations and searched occupation titles.")
    with st.expander("How your skills were understood", icon=":material/search:"):
        for resolution in data.get("resolution", []):
            if resolution.get("matched_occupations") is not None:
                count_label = f"{resolution.get('matched_occupations', 0)} occupation titles"
            else:
                count_label = f"{resolution.get('matched_skills', 0)} related skills"
            st.write(f"{resolution.get('term', '')} — {count_label}; {resolution.get('strength', 'unknown')} match")
    st.subheader("Occupations to explore")
    occupation_terms = data.get("input", {}).get("occupation_terms", [])
    if occupation_terms and data.get("input", {}).get("skill_terms"):
        caption = "Title matches and capability matches are shown together. "
    elif occupation_terms:
        caption = "Occupation title match shows how closely a target role name matched the graph. "
    else:
        caption = "Input skill match measures how strongly your submitted capabilities connect to a role. "
    st.caption(caption + "It is not a readiness score or a guarantee of eligibility.")
    occupations = data.get("occupations", [])
    if not occupations:
        empty_state("No occupation matches yet", "Try other skill terms or explore TESDA Track's qualification library.", "search")
    for start in range(0, len(occupations), 2):
        for column, occupation in zip(st.columns(2), occupations[start:start + 2]):
            with column, st.container(border=True, key=f"card_bridge_role_{occupation['occupation_id']}"):
                st.caption(occupation.get("sector") or "CAREER OPTION")
                st.subheader(occupation["title"])
                st.metric("Occupation title match" if occupation.get("match_kind") == "occupation" else "Input skill match",
                          f"{occupation.get('score', 0):.0%}")
                st.write("Matched input terms: " + (", ".join(occupation.get("terms_matched", [])) or "Not specified"))
                # Title matches carry no count, and few job posts are recorded yet, so only a real count shows.
                if open_posts := occupation.get("open_posts"):
                    st.caption(f"{open_posts} open post{'s' if open_posts != 1 else ''} recorded in Skills Bridge")
    if occupations:
        names = {item["occupation_id"]: item["title"] for item in occupations}
        with st.form("bridge_role", border=False):
            occupation_id = st.selectbox("Explore an occupation", list(names), format_func=names.get, key="bridge_occupation")
            explore = st.form_submit_button("Explore skills & qualifications", icon=":material/arrow_forward:", type="primary")
        if explore:
            st.session_state.pop("bridge_details", None)
            st.session_state.pop("bridge_known_skills", None)
            try:
                with st.spinner("Loading occupation skills and qualifications…"):
                    st.session_state["bridge_details"] = api.bridge_occupation(occupation_id, st.context.ip_address)
            except ApiError as error:
                st.error(error.message)
    details = st.session_state.get("bridge_details")
    if details:
        show_occupation_details(details, api, local_catalog)
    else:
        st.subheader("Qualifications linked to your skills")
        bridge_qualifications = data.get("qualifications", [])
        for index, qualification in enumerate(bridge_qualifications):
            _qualification(qualification, f"card_bridge_qualification_{index}", api, local_catalog)
        if not bridge_qualifications:
            st.caption("No promulgated qualifications matched these terms.")
    st.caption("Skills Bridge data is external to your saved TESDA Track records. Local site listings are shown only when a safe catalog code mapping is available.")
    st.link_button("About Skills Bridge", "https://skills-bridge.ph", icon=":material/open_in_new:")


def show_occupation_details(response: dict, api: ApiClient | None = None, qualifications: list[dict] | None = None) -> None:
    data = response["data"]
    profile = data.get("profile", {})
    occupation = profile.get("occupation")
    if not occupation:
        st.info("Skills Bridge could not find this occupation. Select another result and try again.")
        return
    st.divider()
    st.header(occupation["title"])
    st.caption("Occupation details from your last Explore selection.")
    for warning in data.get("warnings", []):
        st.warning(warning)
    st.subheader("Qualifications for this occupation")
    for index, standard in enumerate(profile.get("standards", [])):
        _qualification(standard, f"card_bridge_standard_{index}", api, qualifications or [])
    if not profile.get("standards"):
        st.caption("No linked qualifications were returned for this occupation.")
    st.subheader("Skills to review")
    st.caption("Preview of up to 50 linked skills, ordered by graph weight. This is a partial taxonomy view, not a complete competency assessment. Select the skills you already have to identify areas you want to explore.")
    skills = {item["skill_id"]: item for item in data.get("skills", []) if item.get("skill_id") is not None}
    if skills:
        known = st.multiselect("Skills I already have", list(skills), format_func=lambda key: skills[key]["name"], key="bridge_known_skills")
        remaining = [skill for key, skill in skills.items() if key not in known]
        st.caption(f"{len(known)} self-reported strengths · {len(remaining)} skills remaining in this preview")
        if remaining:
            st.dataframe([{"Skill to explore": item["name"], "Category": str(item.get("type") or "General").replace("_", " ").title()}
                          for item in remaining], hide_index=True, alt="Linked skills not marked as already known")
        else:
            st.info("You've marked every skill in this preview as known. The occupation may have additional skills beyond this preview.")
    else:
        st.caption("No linked skills were returned for this occupation.")
    st.subheader("International mappings")
    st.caption("These are mappings reported by Skills Bridge. Suggested and confirmed refer to its review status; neither establishes certification equivalency or guarantees a close occupational fit.")
    for index, benchmark in enumerate(data.get("benchmarks", [])):
        with st.container(border=True, key=f"card_bridge_benchmark_{index}"):
            st.badge(str(benchmark.get("status") or "Unspecified").title(), color="blue")
            st.subheader(benchmark.get("title") or "International occupation")
            st.caption(" · ".join(str(value) for value in (benchmark.get("source"), benchmark.get("standard")) if value) or "Framework not supplied")
            st.write("Sample linked skills: " + (", ".join(benchmark.get("sample_skills", [])) or "Not supplied"))
    if not data.get("benchmarks"):
        st.caption("No international mapping was returned for this occupation. No alternative equivalency has been inferred.")
