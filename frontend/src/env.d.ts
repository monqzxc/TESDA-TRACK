/// <reference types="vite/client" />

// The build-time settings this app reads (docs/center-map.md). Vite puts VITE_ variables into the JavaScript it builds,
// where anyone can read them: only public values belong here, such as a MapTiler key restricted to the site's domains.
// The API's GET /api/v1/client-config is the usual place for these settings; these are for builds whose API doesn't
// send them yet.
interface ImportMetaEnv {
  /** "leaflet" keeps the center map on Leaflet, whatever the API says. */
  readonly VITE_MAP_ENGINE?: string
  /** A public MapTiler key, used when the API sends none. */
  readonly VITE_MAPTILER_KEY?: string
  /** An OpenMapTiles-schema TileJSON address, used when the API sends none. */
  readonly VITE_MAP_TILES_URL?: string
  /** "false" turns 3D buildings off, whatever the API says. */
  readonly VITE_MAP_3D_ENABLED?: string
}

interface Window {
  /** The MapLibre center map, for end-to-end tests. Set only by development builds. */
  __trackCenterMap?: import('maplibre-gl').Map
}
