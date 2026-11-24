import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLACE_KEY } from './key.ts'
import { useTrainingStore } from './state.ts'

// The learner's location while sharing is on: the browser keeps reporting it (watchPosition), the pin follows it, and
// turning sharing off stops the watch. A stand-in for the browser's geolocation, which jsdom doesn't have.

type Success = (position: GeolocationPosition) => void
type Failure = (error: GeolocationPositionError) => void

let report: Success
let fail: Failure
const watchPosition = vi.fn((success: Success, failure: Failure, options?: PositionOptions) => {
  void options
  report = success
  fail = failure
  return 7
})
const clearWatch = vi.fn()

const at = (latitude: number, longitude: number, accuracy = 30) =>
  report({ coords: { latitude, longitude, accuracy } } as GeolocationPosition)
const refused = { code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError
const timedOut = { code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError

beforeEach(() => {
  watchPosition.mockClear()
  clearWatch.mockClear()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition, clearWatch },
  })
  useTrainingStore.setState({
    useLocation: false,
    askedOnOpen: false,
    location: null,
    livePoint: null,
    locating: false,
    locationError: null,
  })
})

afterEach(() => {
  useTrainingStore.getState().setUseLocation(false)
  Reflect.deleteProperty(navigator, 'geolocation')
  vi.unstubAllGlobals()
})

describe('the learner’s location', () => {
  it('starts a watch when sharing turns on, and clears it when sharing turns off', () => {
    useTrainingStore.getState().setUseLocation(true)
    expect(watchPosition).toHaveBeenCalledTimes(1)
    // Fresher than the old 5-minute one-off lookup, so the first pin isn't where the learner was.
    expect(watchPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 30_000 })

    at(14.55471, 121.02441, 25)
    expect(useTrainingStore.getState()).toMatchObject({
      useLocation: true,
      locating: false,
      // About 1 km, for distances and the API's questions; about 100 m for the pin only.
      location: { latitude: 14.55, longitude: 121.02 },
      livePoint: { latitude: 14.555, longitude: 121.024, accuracyM: 25 },
    })

    useTrainingStore.getState().setUseLocation(false)
    expect(clearWatch).toHaveBeenCalledWith(7)
    expect(useTrainingStore.getState()).toMatchObject({ location: null, livePoint: null })
    // A late answer from the cleared watch changes nothing.
    at(14.6, 121.1)
    expect(useTrainingStore.getState().livePoint).toBeNull()
  })

  it('moves the pin past about 50 m, and leaves the location alone for smaller jitter', () => {
    useTrainingStore.getState().setUseLocation(true)
    at(14.55471, 121.02441)
    const { location, livePoint } = useTrainingStore.getState()

    at(14.5549, 121.0246) // About 30 m away.
    expect(useTrainingStore.getState().livePoint).toBe(livePoint)
    expect(useTrainingStore.getState().location).toBe(location)

    at(14.5532, 121.0221) // About 300 m away, in the same rounded kilometre.
    expect(useTrainingStore.getState().livePoint).toEqual({
      latitude: 14.553,
      longitude: 121.022,
      accuracyM: 30,
    })
    // The rounded location keeps its identity, so what depends on it isn't asked again.
    expect(useTrainingStore.getState().location).toBe(location)

    at(14.6, 121.1)
    expect(useTrainingStore.getState().location).toEqual({ latitude: 14.6, longitude: 121.1 })
  })

  it('keeps the last location when a later lookup times out, and turns off when access is withdrawn', () => {
    useTrainingStore.getState().setUseLocation(true)
    at(14.55471, 121.02441)
    fail(timedOut)
    expect(useTrainingStore.getState()).toMatchObject({ useLocation: true, locationError: null })

    fail(refused)
    expect(useTrainingStore.getState()).toMatchObject({
      useLocation: false,
      location: null,
      livePoint: null,
      locationError: 'denied',
    })
    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  it('says why when the learner asked and the browser refused, but not when the page asked on its own', () => {
    useTrainingStore.getState().locate({ quietly: true })
    fail(refused)
    expect(useTrainingStore.getState()).toMatchObject({ useLocation: false, locationError: null })

    useTrainingStore.getState().locate()
    fail(refused)
    expect(useTrainingStore.getState()).toMatchObject({
      useLocation: false,
      locationError: 'denied',
    })

    useTrainingStore.getState().locate()
    fail(timedOut)
    expect(useTrainingStore.getState().locationError).toBe('unavailable')
  })

  it('says HTTPS is needed on a plain-HTTP page, without asking the browser', () => {
    vi.stubGlobal('isSecureContext', false)
    useTrainingStore.getState().locate()
    expect(watchPosition).not.toHaveBeenCalled()
    expect(useTrainingStore.getState()).toMatchObject({
      useLocation: false,
      locationError: 'insecure',
    })
  })

  it('stops the watch when the page goes, and starts it again when it comes back', () => {
    useTrainingStore.getState().setUseLocation(true)
    at(14.55471, 121.02441)
    useTrainingStore.getState().pauseWatch()
    expect(clearWatch).toHaveBeenCalledWith(7)
    // The location stays as it last was.
    expect(useTrainingStore.getState().location).toEqual({ latitude: 14.55, longitude: 121.02 })

    useTrainingStore.getState().resumeWatch()
    expect(watchPosition).toHaveBeenCalledTimes(2)
  })

  it('never saves the location', () => {
    useTrainingStore.getState().setUseLocation(true)
    at(14.55471, 121.02441)
    useTrainingStore.setState({ placeText: 'Makati' })
    const saved = sessionStorage.getItem(PLACE_KEY) ?? ''
    expect(saved).toContain('Makati')
    expect(saved).not.toContain('14.55')
    expect(saved).not.toContain('livePoint')
  })
})
