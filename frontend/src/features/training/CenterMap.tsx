import { useQuery } from '@tanstack/react-query'
import { Component, lazy, useCallback, useMemo, useState, type ReactNode } from 'react'
import { useCopy } from '../../i18n/copy.ts'
import { clientConfigQuery } from './api.ts'
import type { CenterMapProps } from './CenterMapTypes.ts'
import { mapSupport } from './maplibre/capabilities.ts'
import { chooseRenderer, mapSettings, type VectorTiles } from './mapSettings.ts'

export type { CenterMapProps, MapRoute } from './CenterMapTypes.ts'

// The center map. Pages load this module when the map is first shown (React.lazy), and it loads the renderer that
// draws it, each in a chunk of its own, so a page whose map is hidden downloads neither, and a browser on Leaflet
// never downloads MapLibre. MapLibre draws vector tiles where they're set up and the browser has WebGL 2
// (docs/center-map.md); Leaflet stays as the fallback, and takes over if MapLibre fails.
const CenterMapLibre = lazy(() => import('./CenterMapLibre.tsx'))
const CenterMapLeaflet = lazy(() => import('./CenterMapLeaflet.tsx'))

/** Why MapLibre failed during this visit, if it did: later maps start on Leaflet rather than fail again. */
let maplibreFailed: string | null = null

/** For tests: forget a failure, as a new visit would. */
export function resetRendererFailure() {
  maplibreFailed = null
}

const standIn =
  'm-0 grid h-[var(--center-map-height,680px)] place-items-center rounded-18 border border-border bg-map-water text-15 text-muted max-sm:h-[min(var(--center-map-height,460px),460px)]'

export default function CenterMap(props: CenterMapProps) {
  const en = useCopy()
  const config = useQuery(clientConfigQuery)
  const settings = useMemo(() => mapSettings(config.data), [config.data])
  const [failed, setFailed] = useState(maplibreFailed)
  const fail = useCallback((reason: string) => {
    if (!maplibreFailed) {
      maplibreFailed = reason
      console.warn(`Center map: MapLibre failed (${reason}); showing the Leaflet map instead.`)
    }
    setFailed(reason)
  }, [])

  // The deployment's settings come first; the page has usually fetched them already.
  if (config.isPending) {
    return (
      <div className={standIn}>
        <p role="status">{en.training.map.loading}</p>
      </div>
    )
  }
  const engine = chooseRenderer(settings, () => mapSupport().webgl2, failed !== null)
  if (engine === 'maplibre' && settings.tiles) {
    return (
      <RendererBoundary onError={fail}>
        <CenterMapLibre
          {...props}
          settings={{ ...settings, tiles: settings.tiles as VectorTiles }}
          support={mapSupport()}
          onFail={fail}
        />
      </RendererBoundary>
    )
  }
  return <CenterMapLeaflet {...props} />
}

/** MapLibre's renderer, or its download, failing as it shows: Leaflet takes over, and the page carries on. */
class RendererBoundary extends Component<
  { onError: (reason: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : 'render')
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
