import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  lastMap,
  Map as FakeMapClass,
  Popup,
  resetFakeMaps,
  type Map as FakeMap,
} from '../../test/maplibre.ts'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { renderWithQuery } from '../../test/query.tsx'
import { directionsQuery, type Directions } from './api.ts'
import type { Center } from './centers.ts'
import CenterMapLibre, { type CenterMapLibreProps } from './CenterMapLibre.tsx'
import { PHILIPPINES } from './maplibre/camera.ts'

// The MapLibre renderer's wiring, against a stand-in for MapLibre (src/test/maplibre.ts): jsdom can't draw WebGL.
// tests/e2e/training.spec.ts checks the real thing in a browser.
vi.mock('maplibre-gl', () => import('../../test/maplibre.ts'))

const center = (
  id: string,
  name: string,
  latitude: number | null,
  longitude: number | null,
  distanceKm: number | null = null,
): Center => ({
  id,
  kind: id.startsWith('training') ? 'training' : 'assessment',
  name,
  regionCode: 'NCR',
  region: 'National Capital Region',
  province: null,
  city: 'Manila',
  address: `${name} Street`,
  latitude,
  longitude,
  email: 'center@example.com',
  phone: '+63 2 0000 0000',
  website: null,
  programs: [],
  schedules: [],
  distanceKm,
})

const MANILA = center('training-1', 'Manila Welding Institute', 14.5995, 120.9842)
const CEBU = center('training-2', 'Cebu Skills Center', 10.3157, 123.8854)
const ASSESSMENT = center('assessment-1', 'Manila Assessment Center', 14.6, 120.98)
const UNMAPPED = center('training-3', 'Mobile Training Unit', null, null)

function props(overrides: Partial<CenterMapLibreProps> = {}): CenterMapLibreProps {
  return {
    centers: [MANILA, CEBU, ASSESSMENT, UNMAPPED],
    selectedId: null,
    focus: 0,
    reference: null,
    radiusKm: null,
    route: null,
    travelMode: 'car',
    onTravelMode: vi.fn(),
    canRoute: true,
    saved: [],
    cartoKey: '',
    today: '2026-11-07',
    locating: false,
    onPick: vi.fn(),
    onDetails: vi.fn(),
    onRoute: vi.fn(),
    onToggleSaved: vi.fn(),
    onLocate: vi.fn(),
    settings: {
      engine: 'maplibre',
      tiles: { provider: 'maptiler', key: 'public-key' },
      buildings3d: true,
    },
    support: { webgl2: true, lowEnd: false, saveData: false },
    onFail: vi.fn(),
    ...overrides,
  }
}

/** The map, made and loaded. */
function loaded(): FakeMap {
  const map = lastMap()
  act(() => {
    map.fire('load')
  })
  return map
}

/** The map drawing these pins and clusters, then settling, as it does after every change. */
function drawing(map: FakeMap, rendered: FakeMap['rendered']) {
  map.rendered = rendered
  act(() => {
    map.fire('idle')
  })
}

const pin = (centerItem: Center) => ({
  properties: { id: centerItem.id, kind: centerItem.kind },
  geometry: { type: 'Point', coordinates: [centerItem.longitude, centerItem.latitude] },
})

const sourceData = (map: FakeMap, id: string) =>
  map.getSource(id)?.data as {
    features: { properties: Record<string, unknown>; geometry: { type: string } }[]
  }

beforeEach(() => {
  resetFakeMaps()
  localStorage.clear()
  document.documentElement.dataset.theme = 'light'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the MapLibre center map', () => {
  it('is made once, kept across rerenders, and removed with the page', () => {
    const view = renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    view.rerender(<CenterMapLibre {...props({ centers: [MANILA] })} />)
    view.rerender(<CenterMapLibre {...props({ centers: [CEBU], locating: true })} />)
    expect(
      screen.getAllByRole('region', { name: 'Map of training and assessment centers' }),
    ).toHaveLength(1)
    expect(lastMap()).toBe(map)
    view.unmount()
    expect(map.removed).toBe(true)
  })

  it('starts from the provider’s vector tiles, with the whole country in view', () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = lastMap()
    expect(map.options).toMatchObject({
      bounds: PHILIPPINES,
      maxZoom: 19,
      scrollZoom: false,
      attributionControl: false,
    })
    const style = map.options.style as { sources: Record<string, { url?: string }> }
    expect(style.sources.basemap.url).toBe(
      'https://api.maptiler.com/tiles/v3/tiles.json?key=public-key',
    )
  })

  it('draws in a worker that is one of the app’s own files, not a blob: script', async () => {
    const { setWorkerUrl } = await import('maplibre-gl')
    vi.mocked(setWorkerUrl).mockClear()
    vi.resetModules()
    await import('./CenterMapLibre.tsx')
    const [[url]] = vi.mocked(setWorkerUrl).mock.calls
    expect(url).toMatch(/^\/.*maplibre-gl-worker.*\.m?js/)
  })

  it('hands the mapped centers to the map once it has loaded, clustered, leaving out the unmapped', () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    const ids = sourceData(map, 'centers').features.map((feature) => feature.properties.id)
    expect(ids).toEqual(['training-1', 'training-2', 'assessment-1'])
    expect((map.getStyle().sources as Record<string, unknown>).centers).toMatchObject({
      cluster: true,
      clusterRadius: 46,
    })
  })

  it('frames every mapped center, without zooming in past street level', () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [120.98, 10.3157],
        [123.8854, 14.6],
      ],
      expect.objectContaining({ maxZoom: 13, duration: 0 }),
    )
  })

  it('reframes for new results, but not over the learner’s own move when nothing else changed', () => {
    const view = renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    act(() => {
      map.fire('dragstart', { originalEvent: new MouseEvent('mousedown') })
    })
    const framed = map.fitBounds.mock.calls.length
    view.rerender(<CenterMapLibre {...props({ onPick: vi.fn() })} />)
    expect(map.fitBounds).toHaveBeenCalledTimes(framed)

    view.rerender(<CenterMapLibre {...props({ centers: [MANILA, ASSESSMENT] })} />)
    expect(map.fitBounds).toHaveBeenCalledTimes(framed + 1)
  })

  it('puts a button over each pin and cluster on screen, named for screen readers', () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    drawing(map, {
      'center-pins': [pin(CEBU)],
      'center-clusters': [
        {
          properties: { cluster_id: 4, point_count: 2 },
          geometry: { type: 'Point', coordinates: [120.98, 14.6] },
        },
      ],
    })
    expect(
      screen.getByRole('button', { name: 'Cebu Skills Center, training center' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 centers here: zoom in' })).toBeInTheDocument()
  })

  it('opens a pin’s popup with the center and its buttons, which call back as Leaflet’s do', async () => {
    const user = userEvent.setup()
    const callbacks = props()
    renderWithQuery(<CenterMapLibre {...callbacks} />)
    const map = loaded()
    drawing(map, { 'center-pins': [pin(CEBU)] })

    await user.click(screen.getByRole('button', { name: 'Cebu Skills Center, training center' }))
    expect(callbacks.onPick).toHaveBeenCalledWith('training-2')
    const popup = within(Popup.instances.at(-1)!.getElement())
    expect(popup.getByText('Cebu Skills Center')).toBeInTheDocument()
    await user.click(popup.getByRole('button', { name: 'View details' }))
    expect(callbacks.onDetails).toHaveBeenCalledWith('training-2')
    await user.click(popup.getByRole('button', { name: 'Get directions' }))
    expect(callbacks.onRoute).toHaveBeenCalledWith('training-2')
    await user.click(popup.getByRole('button', { name: 'Save this center' }))
    expect(callbacks.onToggleSaved).toHaveBeenCalledWith('training-2')
  })

  it('opens the selected center in its popup, and moves the camera only when it’s out of view', () => {
    const view = renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    map.zoom = 12
    view.rerender(<CenterMapLibre {...props({ selectedId: 'training-2' })} />)
    expect(Popup.instances.at(-1)!.isOpen()).toBe(true)
    expect(Popup.instances.at(-1)!.lngLat).toEqual([123.8854, 10.3157])
    // Selected, it's drawn larger, apart from the clusters.
    expect(
      sourceData(map, 'center-selected').features.map((feature) => feature.properties.id),
    ).toEqual(['training-2'])
    expect(
      sourceData(map, 'centers').features.map((feature) => feature.properties.id),
    ).not.toContain('training-2')
    // From far out, View on map (a new `focus`) brings it in close.
    map.zoom = 6
    view.rerender(<CenterMapLibre {...props({ selectedId: 'training-2', focus: 1 })} />)
    expect(map.easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [123.8854, 10.3157], zoom: 13 }),
    )
  })

  it('leaves the camera where it is for a pin picked on the map itself', async () => {
    const user = userEvent.setup()
    const view = renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    drawing(map, { 'center-pins': [pin(CEBU)] })
    await user.click(screen.getByRole('button', { name: 'Cebu Skills Center, training center' }))
    view.rerender(<CenterMapLibre {...props({ selectedId: 'training-2' })} />)
    expect(map.easeTo).not.toHaveBeenCalledWith(expect.objectContaining({ zoom: 13 }))
  })

  it('opens from the keyboard into the popup, and Escape goes back to the pin', async () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    drawing(map, { 'center-pins': [pin(CEBU)] })
    const button = screen.getByRole('button', { name: 'Cebu Skills Center, training center' })
    button.focus()
    // Enter on a button clicks it with no pointer: detail 0.
    fireEvent.click(button, { detail: 0 })
    const popup = Popup.instances.at(-1)!.getElement()
    await waitFor(() =>
      expect(within(popup).getByRole('button', { name: 'View details' })).toHaveFocus(),
    )

    fireEvent.keyDown(within(popup).getByRole('button', { name: 'View details' }), {
      key: 'Escape',
    })
    await waitFor(() => expect(Popup.instances.at(-1)!.isOpen()).toBe(false))
    expect(button).toHaveFocus()
  })

  it('opens centers at the same spot as a list, at the deepest zoom', async () => {
    const user = userEvent.setup()
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    const source = map.getSource('centers')!
    source.getClusterExpansionZoom.mockResolvedValue(20)
    source.getClusterLeaves.mockResolvedValue([
      { properties: { id: 'training-1' } },
      { properties: { id: 'assessment-1' } },
    ])
    drawing(map, {
      'center-clusters': [
        {
          properties: { cluster_id: 9, point_count: 2 },
          geometry: { type: 'Point', coordinates: [120.98, 14.6] },
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: '2 centers here: zoom in' }))
    const popup = within(Popup.instances.at(-1)!.getElement())
    expect(await popup.findByText('2 centers at this spot')).toBeInTheDocument()
    await user.click(popup.getByRole('button', { name: /Manila Assessment Center/ }))
    expect(
      within(Popup.instances.at(-1)!.getElement()).getByText('Manila Assessment Center'),
    ).toBeInTheDocument()
  })

  it('zooms into a cluster where its centers part', async () => {
    const user = userEvent.setup()
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    map.getSource('centers')!.getClusterExpansionZoom.mockResolvedValue(14)
    drawing(map, {
      'center-clusters': [
        {
          properties: { cluster_id: 9, point_count: 2 },
          geometry: { type: 'Point', coordinates: [120.98, 14.6] },
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: '2 centers here: zoom in' }))
    await waitFor(() =>
      expect(map.easeTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [120.98, 14.6], zoom: 14 }),
      ),
    )
  })

  it('draws the learner’s location and the search radius around it', () => {
    const reference = { latitude: 14.5547, longitude: 121.0244, label: 'you', mine: true }
    renderWithQuery(<CenterMapLibre {...props({ reference, radiusKm: 10 })} />)
    const map = loaded()
    expect(sourceData(map, 'center-reference').features[0].properties).toEqual({ mine: true })
    expect(sourceData(map, 'center-radius').features[0].geometry.type).toBe('Polygon')
    expect(
      screen.getByRole('region', { name: 'Map of training and assessment centers' }),
    ).toHaveAttribute('data-radius-km', '10')
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ maxZoom: 13 }),
    )
  })

  it('draws the routes, fits them once, and lets their labels pick the travel mode', async () => {
    const user = userEvent.setup()
    const route = {
      from: { latitude: 14.5547, longitude: 121.0244 },
      to: { latitude: 14.5995, longitude: 120.9842 },
      kind: 'training' as const,
    }
    const directions: Directions = {
      routing_enabled: true,
      missing_modes: [],
      routes: [
        {
          mode: 'car',
          path: [
            [14.555, 121.024],
            [14.58, 121.0],
            [14.599, 120.985],
          ],
          start: [14.555, 121.024],
          end: [14.599, 120.985],
          distance_km: 10.3,
          duration_min: 14,
        },
        {
          mode: 'foot',
          path: [
            [14.555, 121.024],
            [14.57, 121.01],
            [14.599, 120.985],
          ],
          start: [14.555, 121.024],
          end: [14.599, 120.985],
          distance_km: 9.6,
          duration_min: 122,
        },
      ],
    } as Directions
    const callbacks = props({ route, selectedId: 'training-1' })
    const view = renderWithQuery(<CenterMapLibre {...callbacks} />)
    view.client.setQueryData(directionsQuery(route.from, route.to).queryKey, directions)
    const map = loaded()

    await waitFor(() => expect(sourceData(map, 'center-routes').features.length).toBeGreaterThan(0))
    expect(map.getLayoutProperty('center-route-chosen-line', 'visibility')).toBe('visible')
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ maxZoom: 16 }),
    )
    // No popup over the route: it has the view to itself.
    expect(
      Popup.instances.filter(
        (popup) => popup.isOpen() && popup.options.className === 'center-map-popup',
      ),
    ).toEqual([])

    const car = screen.getByRole('button', { name: '14 min · 10.3 km by car: show this route' })
    expect(car).toHaveAttribute('aria-pressed', 'true')
    await user.click(
      screen.getByRole('button', { name: '2 hr 2 min · 9.6 km on foot: show this route' }),
    )
    expect(callbacks.onTravelMode).toHaveBeenCalledWith('foot')

    // Without a route, the route layers (and the router's credit) go.
    view.rerender(<CenterMapLibre {...props()} />)
    await waitFor(() =>
      expect(map.getLayoutProperty('center-route-chosen-line', 'visibility')).toBe('none'),
    )
  })

  describe('in 3D', () => {
    it('tilts and turns the camera, raises buildings, and is remembered; 2D lays it flat again', async () => {
      const user = userEvent.setup()
      renderWithQuery(<CenterMapLibre {...props()} />)
      const map = loaded()
      const toggle = screen.getByRole('button', { name: 'Show buildings in 3D' })
      expect(toggle).toHaveAttribute('aria-pressed', 'false')

      await user.click(toggle)
      expect(map.easeTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ pitch: 55, bearing: -17 }),
      )
      expect(map.getLayoutProperty('building-3d', 'visibility')).toBe('visible')
      expect(map.dragRotate.enable).toHaveBeenCalled()
      expect(localStorage.getItem('tesda-track.map-3d')).toBe('on')
      expect(screen.getByRole('button', { name: 'Turn the map back to north' })).toBeInTheDocument()

      await user.click(toggle)
      expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 0, bearing: 0 }))
      expect(map.getLayoutProperty('building-3d', 'visibility')).toBe('none')
      expect(localStorage.getItem('tesda-track.map-3d')).toBe('off')
    })

    it('says when there’s nothing to raise in view', async () => {
      const user = userEvent.setup()
      renderWithQuery(<CenterMapLibre {...props()} />)
      const map = loaded()
      await user.click(screen.getByRole('button', { name: 'Show buildings in 3D' }))
      map.zoom = 12
      drawing(map, {})
      expect(screen.getByRole('status')).toHaveTextContent('Zoom in to see buildings in 3D.')
      map.zoom = 16
      drawing(map, {
        building: [{ properties: { render_height: 5 }, geometry: { type: 'Polygon' } }],
      })
      expect(screen.getByRole('status')).toHaveTextContent(
        'No building heights are recorded here yet',
      )
      drawing(map, {})
      expect(screen.getByRole('status')).toHaveTextContent('No buildings are mapped here yet.')
    })

    it('isn’t offered on a low-end device, where the deployment turns it off, or without building data', () => {
      const lowEnd = renderWithQuery(
        <CenterMapLibre {...props({ support: { webgl2: true, lowEnd: true, saveData: false } })} />,
      )
      loaded()
      expect(screen.queryByRole('button', { name: 'Show buildings in 3D' })).toBeNull()
      expect(lastMap().options.pixelRatio).toBeLessThanOrEqual(1.5)
      lowEnd.unmount()

      const off = renderWithQuery(
        <CenterMapLibre
          {...props({
            settings: {
              engine: 'maplibre',
              tiles: { provider: 'maptiler', key: 'k' },
              buildings3d: false,
            },
          })}
        />,
      )
      loaded()
      expect(screen.queryByRole('button', { name: 'Show buildings in 3D' })).toBeNull()
      off.unmount()

      renderWithQuery(<CenterMapLibre {...props()} />)
      const map = loaded()
      map.getSource('basemap')!.vectorLayerIds = ['water', 'transportation', 'place']
      act(() => {
        map.fire('sourcedata', { sourceId: 'basemap', sourceDataType: 'metadata' })
      })
      expect(screen.queryByRole('button', { name: 'Show buildings in 3D' })).toBeNull()
    })
  })

  it('follows the app’s theme by restyling the same map', async () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    expect(map.getPaintProperty('background', 'background-color')).toBe('#f2f4f7')
    act(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await waitFor(() =>
      expect(map.getPaintProperty('background', 'background-color')).toBe('#13213e'),
    )
    expect(map.setStyle).toHaveBeenLastCalledWith(expect.anything(), { diff: true })
    expect(lastMap()).toBe(map)
  })

  it('offers the provider’s base maps, and remembers the one chosen', async () => {
    const user = userEvent.setup()
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    await user.click(screen.getByRole('button', { name: 'Map layers' }))
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Map',
      'Light',
      'Satellite',
      'OpenStreetMap',
    ])
    await user.click(screen.getByRole('menuitemradio', { name: 'Satellite' }))
    expect(Object.keys(map.getStyle().sources)).toContain('satellite')
    expect(localStorage.getItem('tesda-track.basemap')).toBe('satellite')
  })

  it('says a lost drawing context is being restored, and gives way to Leaflet if it isn’t', () => {
    vi.useFakeTimers()
    const callbacks = props()
    renderWithQuery(<CenterMapLibre {...callbacks} />)
    const map = loaded()
    act(() => {
      map.fire('webglcontextlost')
    })
    expect(screen.getByRole('status')).toHaveTextContent('The map stopped drawing. Restoring it…')
    act(() => {
      map.fire('webglcontextrestored')
    })
    expect(screen.queryByRole('status')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(callbacks.onFail).not.toHaveBeenCalled()

    act(() => {
      map.fire('webglcontextlost')
      vi.advanceTimersByTime(8_000)
    })
    expect(callbacks.onFail).toHaveBeenCalledWith('context-lost')
  })

  it('tells Leaflet to take over when MapLibre can’t start', () => {
    FakeMapClass.failNext = true
    const callbacks = props()
    renderWithQuery(<CenterMapLibre {...callbacks} />)
    expect(callbacks.onFail).toHaveBeenCalledWith('init')
  })

  it('shows OpenStreetMap’s map, once, when the vector tiles are refused; tile failures only say so', () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    act(() => {
      map.fire('error', { sourceId: 'basemap', tile: { id: 1 }, error: new Error('timeout') })
    })
    expect(screen.getByRole('status')).toHaveTextContent('Some map tiles could not load.')
    act(() => {
      map.fire('error', { sourceId: 'basemap', error: new Error('403') })
    })
    expect(Object.keys(map.getStyle().sources)).toContain('osm')
    expect(Object.keys(map.getStyle().sources)).not.toContain('basemap')
  })

  it('moves at once for a learner who asked for less motion', async () => {
    mockMediaQueries({ '(prefers-reduced-motion: reduce)': true })
    const user = userEvent.setup()
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    expect(map.options).toMatchObject({ fadeDuration: 0, reduceMotion: true })
    await user.click(screen.getByRole('button', { name: 'Zoom in', exact: true } as never))
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 7, duration: 0 }))
  })

  it('needs two fingers to move on a touch screen, so one scrolls the page past it', () => {
    mockMediaQueries({ '(pointer: coarse)': true })
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    expect(map.cooperativeGestures.enable).toHaveBeenCalled()
  })

  it('zooms with the wheel only once a mouse user has clicked into or focused the map', () => {
    renderWithQuery(<CenterMapLibre {...props()} />)
    const map = loaded()
    expect(map.scrollZoom.isEnabled()).toBe(false)
    act(() => {
      map.getCanvas().focus()
      fireEvent.focusIn(map.getCanvas())
    })
    expect(map.scrollZoom.isEnabled()).toBe(true)
    act(() => {
      fireEvent.focusOut(map.getCanvas(), { relatedTarget: document.body })
    })
    expect(map.scrollZoom.isEnabled()).toBe(false)
  })
})
