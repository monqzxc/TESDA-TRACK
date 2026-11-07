# The center map

Training & Assessment (`/training`, and `/tsp/webview/training` in TSP's WebView) and Skills Explorer show training
and assessment centers on a map. The map is an extra: the list beside it has everything, and keeps working when the
map can't load (US-08).

Two renderers draw it, behind one component (`frontend/src/features/training/CenterMap.tsx`):

| Renderer | When | Draws |
| --- | --- | --- |
| **MapLibre GL JS 6** (`CenterMapLibre.tsx`) | Vector tiles are set up, the browser has WebGL 2, and MapLibre hasn't failed during the visit | Vector tiles in the app's own light and dark colors, labels in the app's font, optional 3D buildings |
| **Leaflet 1.9** (`CenterMapLeaflet.tsx`) | Everywhere else: no vector tiles set up, `MAP_ENGINE=leaflet`, no WebGL 2, or MapLibre failed | Raster tiles: CARTO with `CARTO_API`, else OpenStreetMap |

Both take the same props and call back the same way, and both show the same popup (`CenterPopup.tsx`). Pages load
`CenterMap.tsx` only when the map is shown; it then loads one renderer, in a chunk of its own. A page whose map is
hidden downloads neither, and a browser on Leaflet never downloads MapLibre (about 300 kB compressed, plus its
worker).

## Configuration

The settings come from the API (`GET /api/v1/client-config`), as the CARTO key does, so one build of the React app
runs in every deployment and a key can be changed without rebuilding it. Set them in the server's `.env` (Docker
Compose passes them to the API):

| Variable | Default | Meaning |
| --- | --- | --- |
| `MAPTILER_KEY` | empty | A MapTiler key. With it, the map is drawn by MapLibre from MapTiler's vector tiles. |
| `MAP_TILES_URL` | empty | Instead of MapTiler: the TileJSON address of any other [OpenMapTiles-schema](https://openmaptiles.org/schema/) vector source, such as your own tile server. Must be `https://` in production. |
| `MAP_ENGINE` | `maplibre` | `leaflet` keeps the Leaflet map even with vector tiles set up: a switch back while MapLibre is new. |
| `MAP_3D_ENABLED` | `true` | `false` stops the map offering 3D buildings anywhere. |

Without `MAPTILER_KEY` or `MAP_TILES_URL`, nothing changes: the map stays on Leaflet, as before.

The keys reach learners' browsers: the browser sends them with every tile request, so they are public by design.
**Use a MapTiler key made for this site, restricted to your domains in MapTiler Cloud (Account → Keys → Allowed
HTTP origins), and never a private credential.** The API hands the key out with the other public settings.

### Build-time settings

A build of the React app can carry the same settings as Vite variables, for a frontend deployed ahead of its API
(for example on Vercel, before the server is updated). They are compiled into the JavaScript, where anyone can read
them, so the same rule applies: public, domain-restricted keys only.

| Variable | Meaning |
| --- | --- |
| `VITE_MAPTILER_KEY` | Used when the API sends no key. |
| `VITE_MAP_TILES_URL` | Used when the API sends no tile address. |
| `VITE_MAP_ENGINE` | `leaflet` keeps Leaflet whatever the API says. |
| `VITE_MAP_3D_ENABLED` | `false` turns 3D off whatever the API says. |

The API's settings win where it sends them; either side can turn MapLibre or 3D off (`mapSettings.ts`).

### Content Security Policy

`frontend/Caddyfile` sends the app's Content Security Policy. MapLibre fetches its tiles rather than loading them as
pictures, so their hosts belong in `connect-src`; MapTiler (`https://api.maptiler.com`) and OpenStreetMap
(`https://tile.openstreetmap.org`) are listed. **With `MAP_TILES_URL`, add its host to `connect-src`.** MapLibre's
worker is one of the app's own files (`worker-src 'self'`), never a `blob:` script. `src/csp.test.tsx` checks these.

## What the MapLibre map shows

Everything the Leaflet map did, drawn on the GPU:

- **Pins and clusters** from one GeoJSON source (MapLibre's clustering, 46 px like Leaflet.markercluster), so hundreds of
  centers cost no DOM elements. Pins and cluster badges are drawn on a canvas when first needed: no sprite sheet to
  download. Centers at the same spot stay a cluster even at the deepest zoom, and open as a list to choose from.
- **Buttons over the pins on screen** (at most 120), transparent and the size of each pin, so pins and clusters can
  be reached with Tab and read by screen readers ("Cebu Skills Center, training center"; "2 centers here: zoom in").
  Enter opens a pin's popup with focus on View details; Escape closes it and returns to the pin. A cluster opened from
  the keyboard moves focus to the nearest pin or cluster it opens into.
- **The selected center**, larger and glowing, with its popup: the same content and buttons as Leaflet's (View details,
  directions, save, copy link). The popup keeps clear of the filter panel and the controls.
- **The learner's location or searched place**, with the **search radius** drawn as a true circle on the ground.
- **Routes** for each travel mode, the chosen one on top, dotted where there's no road, with labels that pick the mode.
  The router's credit ("Route by OSRM · Fix the map") shows only while a route does.
- **Controls**: locate, zoom, 3D, layers (Map, Light, Satellite with MapTiler, OpenStreetMap), and north in 3D. The
  layer and 3D choices are kept for the browser.

### Camera

- Without a place: the results, or the whole Philippines without any.
- With the learner's location or a searched place: it and its six closest centers.
- With a search radius: the circle, never closer than zoom 13.
- A center chosen from the list, or with View on map: the camera goes to it (closer in from far out), leaving room for
  its popup. A pin picked on the map itself is already in view: only the popup makes room.
- A route: fitted once per set of directions; choosing a mode restyles it without moving the map.
- Padding keeps what's framed clear of the filter panel (`--map-overlay-inset`), the controls and the legend, with a
  larger share of a phone's map. Once the learner has moved the map themselves, a change of layout alone doesn't
  reframe it; new results do.
- With `prefers-reduced-motion: reduce`, every camera move is instant and gesture inertia is off.

### 3D buildings

The 3D button tilts the camera (55°) and lets it turn, and raises the buildings whose height OpenStreetMap records.

- **Only recorded heights are drawn.** OpenMapTiles gives a building without `height` or `building:levels` a
  `render_height` of 5 m; the map leaves those flat rather than present a made-up height. A building that really is
  about 5 m tall, or one storey, therefore stays flat too.
- **Coverage varies a great deal across the Philippines.** Central business districts (Makati, BGC, Ortigas, Cebu IT
  Park) have many mapped heights; most of the country has building footprints without heights, and some areas no
  buildings at all. The map says which: "Zoom in to see buildings in 3D", "No building heights are recorded here
  yet", "No buildings are mapped here yet". It doesn't promise 3D everywhere.
- 3D is offered only on the vector base maps (Map, Light), when the tiles have a building layer, `MAP_3D_ENABLED`
  isn't `false`, and the device isn't low-end. Turned off, the map goes back to flat and north up.
- Heights improve as people map them in OpenStreetMap: the map's credits link to it.

### Light and dark

The map follows the app's theme (`data-theme` on `<html>`) without being made again: its style is diffed, so only
colors change. Its colors come from `tokens.css`: quiet land, blue-grey roads and water, navy labels by day; the
app's night navy, darker water and light labels at night. The OpenStreetMap layer is inverted for the night, as the
Leaflet map's tiles are. Labels are drawn in Figtree, the app's font, which the page has already loaded: no map font
server is used.

### Devices and WebViews

- **WebGL 2 is required** (MapLibre 6). iOS 15 and later (WKWebView included), Android's Chrome WebView, and current
  desktop browsers have it; elsewhere the Leaflet map is used, decided before MapLibre is downloaded
  (`maplibre/capabilities.ts`).
- **Low-end devices** (software rendering, 2 GB of memory or less, 2 cores or fewer, or Save-Data) get a dependable 2D
  map: no 3D, no hillshade, a lower pixel ratio. Every device draws at most twice its CSS pixels.
- **Touch screens**: one finger scrolls the page past the map and two move it (MapLibre's cooperative gestures), so a
  learner in TSP's WebView isn't trapped in the map. With a mouse, the wheel zooms once the map is clicked or focused.
- **Location**: the map never asks for it by itself. The page asks as it always has (once a visit as it opens, and
  when the learner turns location on), and the locate button asks again. The map shows the location as the page
  already rounds it (about 1 km), and stores no position or view.
- The map doesn't touch the address bar or Back (no URL hash), the session, or sign-in. Links in popups open
  outside the WebView as before.
- **A lost drawing context** (the GPU reset, or a phone reclaiming memory) shows "The map stopped drawing. Restoring
  it…"; MapLibre restores its style and data itself. If the context isn't back within 8 seconds, the Leaflet map takes
  over, and stays for the rest of the visit.
- **Failures**: if MapLibre can't start, or breaks as it shows, the Leaflet map takes over for the visit. If the
  vector tiles are refused (a wrong or restricted key, an outage), the MapLibre map switches to OpenStreetMap's tiles
  and says so. Single tiles that fail only show "Some map tiles could not load".

## Licensing and attribution

- **MapLibre GL JS** is BSD-3-Clause: no attribution is required on the map.
- **OpenStreetMap** data is ODbL: "© OpenStreetMap contributors" is always shown, in the map's credits.
- **MapTiler**: "© MapTiler © OpenStreetMap contributors" in the credits, and MapTiler's logo in the corner, which its
  free plan requires. A paid plan may hide the logo; remove it from `providerUrls()` in `maplibre/styles.ts` only if
  your plan allows it. Check MapTiler's terms for the plan you use, including request limits.
- **Another provider** (`MAP_TILES_URL`): its TileJSON's own attribution is shown, with "© OpenStreetMap contributors"
  added. The [OpenMapTiles schema](https://openmaptiles.org/schema/) is CC-BY: tiles built with it are usually credited
  "© OpenMapTiles"; make sure your TileJSON's attribution says so.
- **Routes** credit OSRM and link to OpenStreetMap's "Fix the map" while they show.
- **CARTO and OpenStreetMap raster tiles** (the Leaflet map, and the OpenStreetMap layer) are credited as before.
  OpenStreetMap's tile servers have a [usage policy](https://operations.osmfoundation.org/policies/tiles/): heavy use
  needs its own tile server or a provider.
- The privacy notice names MapTiler among the map providers that see a learner's network address and the part of the
  map they view.

## Deploying

1. Create a MapTiler key for the site (or set up another OpenMapTiles-schema tile source) and restrict it to the
   site's domains.
2. Set `MAPTILER_KEY` (or `MAP_TILES_URL`) in the server's `.env`, and restart the API (`docker compose up -d`). The
   API serves the setting at once; browsers pick it up within five minutes (`client-config` is cached that long).
3. With `MAP_TILES_URL`, add its host to `connect-src` in `frontend/Caddyfile` and rebuild the app's container.
4. Open Training & Assessment: the map's shell has `data-engine="maplibre"`, and its credits name the tile provider.
   To switch back without a release, set `MAP_ENGINE=leaflet`.

The React app on Vercel needs nothing more: it reads the API's settings, and Vercel sends no Content Security Policy
of its own.

## Tests

- Unit tests (Vitest, `npm test`): the settings and which renderer is chosen (`mapSettings.test.ts`,
  `CenterMap.test.tsx`), the device checks, camera rules, styles (validated against the MapLibre style
  specification for every base map, theme and mode), overlays and routes (`maplibre/*.test.ts`), and the renderer's
  wiring against a stand-in for MapLibre (`CenterMapLibre.test.tsx`, `src/test/maplibre.ts`), since jsdom has no
  WebGL.
- End-to-end tests (Playwright, `tests/e2e/training.spec.ts`) run the real MapLibre in Chromium, against vector tiles
  cut on demand from a little made-up data (`tests/e2e/mapTiles.ts`): pins, clusters, popups and the keyboard, the
  radius, routes and travel modes, 2D and 3D with recorded heights, both themes, phones and touch, axe, a lost and
  restored drawing context, refused tiles, the TSP WebView, the map hidden and not downloaded, and the Leaflet fallback
  (no tiles, `MAP_ENGINE=leaflet`, no WebGL 2). Skills Explorer's tests run on Leaflet.
