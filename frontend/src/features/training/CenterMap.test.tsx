import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Suspense, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import CenterMap, { resetRendererFailure, type CenterMapProps } from './CenterMap.tsx'
import { mapSupport } from './maplibre/capabilities.ts'

// Which renderer draws the center map: MapLibre where it can, Leaflet everywhere else, and Leaflet for the rest of
// the visit once MapLibre has failed. The renderers stand in as labels here; each has tests of its own.

const behaviour = vi.hoisted(() => ({ maplibre: 'draws' as 'draws' | 'fails' | 'throws' }))

vi.mock('./CenterMapLibre.tsx', () => ({
  default: function FakeMapLibre({ onFail }: { onFail: (reason: string) => void }) {
    if (behaviour.maplibre === 'throws') throw new Error('MapLibre broke')
    useEffect(() => {
      if (behaviour.maplibre === 'fails') onFail('context-lost')
    }, [onFail])
    return <p>MapLibre map</p>
  },
}))
vi.mock('./CenterMapLeaflet.tsx', () => ({ default: () => <p>Leaflet map</p> }))
vi.mock('./maplibre/capabilities.ts', () => ({
  mapSupport: vi.fn(() => ({ webgl2: true, lowEnd: false, saveData: false })),
}))

const PROPS: CenterMapProps = {
  centers: [],
  selectedId: null,
  focus: 0,
  reference: null,
  route: null,
  travelMode: 'car',
  onTravelMode: () => {},
  canRoute: false,
  saved: [],
  cartoKey: '',
  today: '2026-11-07',
  locating: false,
  onPick: () => {},
  onDetails: () => {},
  onRoute: () => {},
  onToggleSaved: () => {},
  onLocate: () => {},
}

function serveConfig(config: Record<string, unknown>) {
  server.use(
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({
        carto_key: '',
        routing_enabled: false,
        skills_bridge_enabled: false,
        ...config,
      }),
    ),
  )
}

const show = () =>
  renderWithQuery(
    <Suspense fallback={<p>Loading a renderer</p>}>
      <CenterMap {...PROPS} />
    </Suspense>,
  )

beforeEach(() => {
  behaviour.maplibre = 'draws'
  resetRendererFailure()
  vi.mocked(mapSupport).mockReturnValue({ webgl2: true, lowEnd: false, saveData: false })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // React reports a render error it recovered from; the boundary is what's under test.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('the center map', () => {
  it('waits for the deployment’s settings, showing a stand-in', async () => {
    serveConfig({ maptiler_key: 'public-key' })
    show()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the map…')
    expect(await screen.findByText('MapLibre map')).toBeInTheDocument()
  })

  it('is drawn by MapLibre with vector tiles and WebGL 2', async () => {
    serveConfig({ maptiler_key: 'public-key' })
    show()
    expect(await screen.findByText('MapLibre map')).toBeInTheDocument()
  })

  it('stays on Leaflet without vector tiles, the API being older than them included', async () => {
    serveConfig({})
    show()
    expect(await screen.findByText('Leaflet map')).toBeInTheDocument()
    // Leaflet needs no WebGL: the browser isn't even asked.
    expect(mapSupport).not.toHaveBeenCalled()
  })

  it('stays on Leaflet when the deployment says so, or the browser has no WebGL 2', async () => {
    serveConfig({ maptiler_key: 'public-key', map_engine: 'leaflet' })
    const kept = show()
    expect(await screen.findByText('Leaflet map')).toBeInTheDocument()
    kept.unmount()

    serveConfig({ maptiler_key: 'public-key' })
    vi.mocked(mapSupport).mockReturnValue({ webgl2: false, lowEnd: false, saveData: false })
    show()
    expect(await screen.findByText('Leaflet map')).toBeInTheDocument()
  })

  it('gives way to Leaflet when MapLibre fails, and doesn’t try MapLibre again during the visit', async () => {
    serveConfig({ maptiler_key: 'public-key' })
    behaviour.maplibre = 'fails'
    const first = show()
    expect(await screen.findByText('Leaflet map')).toBeInTheDocument()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('context-lost'))
    first.unmount()

    // MapLibre would draw now, but the next map (another page, the map shown again) starts on Leaflet.
    behaviour.maplibre = 'draws'
    show()
    expect(await screen.findByText('Leaflet map')).toBeInTheDocument()
    expect(screen.queryByText('MapLibre map')).toBeNull()
  })

  it('gives way to Leaflet when MapLibre breaks as it shows', async () => {
    serveConfig({ maptiler_key: 'public-key' })
    behaviour.maplibre = 'throws'
    show()
    expect(await screen.findByText('Leaflet map')).toBeInTheDocument()
  })
})
