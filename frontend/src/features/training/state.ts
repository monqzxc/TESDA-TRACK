import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sessionStore } from '../../lib/sessionStore.ts'
import type { TravelMode } from './api.ts'
import { distanceKm, type Point } from './centers.ts'
import { readTrainingAddress, writeTrainingAddress, type TrainingFilters } from './address.ts'
import { PLACE_KEY } from './key.ts'

// The page's state. Filters are in the address (useTrainingFilters). The rest stays in this tab: the learner's
// location is kept in memory only and never saved or sent anywhere but where the page says. While sharing is on, the
// browser keeps reporting it (watchPosition), so the "you are here" pin follows the learner. The place they typed is
// kept in sessionStorage, so a refresh keeps it and closing the tab clears it. Saved centers belong to the account
// (savedCenters.ts).

/** The filters in the address, and ways to change them. */
export function useTrainingFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readTrainingAddress(params), [params])

  /**
   * Changes some filters. Each change is a step Back can undo, except typing (`replace`), which would add one per
   * letter. The page stays where it is.
   */
  const update = useCallback(
    (changes: Partial<TrainingFilters>, { replace = false }: { replace?: boolean } = {}) => {
      setParams(
        (current) => writeTrainingAddress({ ...readTrainingAddress(current), ...changes }),
        { replace, preventScrollReset: true },
      )
    },
    [setParams],
  )

  return { filters, update }
}

export interface PlacePoint extends Point {
  label: string
  /** Moved by the learner on the map, rather than the town center of the place they chose. */
  pinned: boolean
}

/** Why the location couldn't be used. `insecure`: the page isn't on HTTPS, where browsers never share it. */
export type LocationError = 'denied' | 'unavailable' | 'unsupported' | 'insecure'

/** Where the "you are here" pin is drawn, and how sure the browser is of it. */
export interface LivePoint extends Point {
  /** The browser's accuracy in metres, when it gives one. */
  accuracyM: number | null
}

interface TrainingState {
  /** The learner asked to use their location, or the page did when it opened. */
  useLocation: boolean
  /** The page has asked for the location on its own during this visit, which it does only once. */
  askedOnOpen: boolean
  /**
   * Their approximate location (rounded to about 1 km), once the browser shares it: what distances, areas and the
   * API's questions are worked out from.
   */
  location: Point | null
  /**
   * The same location a little finer (about 100 m), for the "you are here" pin only. Never sent to the API and never
   * saved.
   */
  livePoint: LivePoint | null
  locating: boolean
  locationError: LocationError | null
  /** A city, province or region the learner typed, to measure distances from. */
  placeText: string
  /**
   * The point of the place they picked from the suggestions, or where they moved its pin: what distances, routes and
   * travel times start from. Null while they only typed: the page then works out the place from the text.
   */
  placePoint: PlacePoint | null
  /** The center whose routes are drawn, from the learner's location. */
  routeTo: string | null
  travelMode: TravelMode

  setUseLocation: (wanted: boolean) => void
  /**
   * Asks the browser for the learner's location (again). Asked `quietly`, by the page rather than the learner, a
   * refusal only turns the location off: the learner wasn't the one asking, so they aren't told why.
   */
  locate: (options?: { quietly?: boolean }) => void
  /**
   * Asks for the location as the page opens, so it can show the learner's area first rather than every center in
   * the country. Once a visit: turned off, or refused, it stays off until the learner turns it on.
   */
  locateOnOpen: () => void
  /** The page is back on screen: while sharing is on, the browser is asked to keep reporting the location again. */
  resumeWatch: () => void
  /** The page has gone: the browser stops reporting the location, which stays as it last was. */
  pauseWatch: () => void
  /** Typing changes the place, so a point picked or pinned for the old text is dropped. */
  setPlaceText: (text: string) => void
  /** A place picked from the suggestions: its name in the box, its point to measure from. */
  choosePlace: (place: { label: string } & Point) => void
  /** The place's pin moved on the map: `label` names the place it was moved from. */
  movePlace: (point: { label: string } & Point) => void
  /** Back to the place's own point, from its name. */
  unpinPlace: () => void
  showRoute: (centerId: string | null) => void
  setTravelMode: (mode: TravelMode) => void
}

/** Two decimal places: about 1 km, as the page promises. */
const round = (value: number) => Math.round(value * 100) / 100
/** A pin the learner placed themselves: three decimal places, about 100 m, so it doesn't jump when dropped. */
const roundPin = (value: number) => Math.round(value * 1000) / 1000
/** Smaller moves are the browser's jitter: the pin, and the queries that depend on the location, stay put. */
const MOVE_M = 50

/**
 * The browser's watch on the location, while sharing is on. `ended` covers a browser that answers (or fails) before
 * watchPosition has even returned its id. `last` is where the pin last moved to, as the browser gave it: moves are
 * measured from it, not from the rounded points, which are a step of about 100 m apart. It is kept in memory only, for
 * as long as the watch lasts.
 */
let watch: {
  id: number | null
  ended: boolean
  quietly: boolean
  last: Point | null
} | null = null

function stopWatch() {
  if (!watch) return
  watch.ended = true
  if (watch.id !== null) navigator.geolocation?.clearWatch(watch.id)
  watch = null
}

/** A much better (or worse) accuracy redraws its circle, even where the point hasn't moved. */
function accuracyChanged(before: number | null, after: number | null) {
  if (before === null || after === null) return before !== after
  return Math.max(before, after) / Math.min(before, after) >= 2
}

/**
 * Starts (or restarts) the browser's watch on the location. The first answer turns the location on; later ones move
 * it only past MOVE_M. Asked `quietly`, a refusal turns the location off without saying why.
 */
function watchLocation(quietly: boolean) {
  stopWatch()
  const current: NonNullable<typeof watch> = { id: null, ended: false, quietly, last: null }
  watch = current
  const { getState: get, setState: set } = useTrainingStore
  const id = navigator.geolocation.watchPosition(
    (position) => {
      // An old watch, or the location was turned off while the browser was asking: the answer isn't used.
      if (watch !== current) return
      if (!get().useLocation) {
        stopWatch()
        return
      }
      const { latitude, longitude, accuracy } = position.coords
      const live: LivePoint = {
        latitude: roundPin(latitude),
        longitude: roundPin(longitude),
        accuracyM: Number.isFinite(accuracy) && accuracy > 0 ? Math.round(accuracy) : null,
      }
      const state = get()
      const before = state.livePoint
      const moved =
        !before ||
        !current.last ||
        distanceKm(current.last, { latitude, longitude }) * 1000 > MOVE_M
      if (moved) current.last = { latitude, longitude }
      if (!moved && !accuracyChanged(before.accuracyM, live.accuracyM)) {
        if (state.locating) set({ locating: false })
        return
      }
      const location = { latitude: round(latitude), longitude: round(longitude) }
      const same =
        state.location?.latitude === location.latitude &&
        state.location.longitude === location.longitude
      set({
        locating: false,
        livePoint: moved ? live : { ...before, accuracyM: live.accuracyM },
        // The rounded location keeps its identity when it hasn't changed, so what's worked out from it isn't asked
        // again.
        ...(same ? {} : { location }),
      })
    },
    (error) => {
      if (watch !== current) return
      // Turned off while the browser was asking (Show all centers instead): there's nothing to explain.
      if (!get().useLocation) {
        stopWatch()
        return
      }
      // A later lookup that times out keeps the last location; only a refusal turns it off.
      if (get().location && error.code !== error.PERMISSION_DENIED) {
        if (get().locating) set({ locating: false })
        return
      }
      stopWatch()
      set({
        useLocation: false,
        location: null,
        livePoint: null,
        locating: false,
        locationError: current.quietly
          ? null
          : error.code === error.PERMISSION_DENIED
            ? 'denied'
            : 'unavailable',
      })
    },
    // A fresher first answer than the one-off lookup took (5 minutes), so the pin isn't where the learner was.
    { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 },
  )
  if (current.ended) navigator.geolocation.clearWatch(id)
  else current.id = id
}

/**
 * Keeps the browser reporting the location while the page is on screen and sharing is on, and stops it when the
 * page goes.
 */
export function useLocationWatch() {
  useEffect(() => {
    useTrainingStore.getState().resumeWatch()
    return () => useTrainingStore.getState().pauseWatch()
  }, [])
}

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      useLocation: false,
      askedOnOpen: false,
      location: null,
      livePoint: null,
      locating: false,
      locationError: null,
      placeText: '',
      placePoint: null,
      routeTo: null,
      travelMode: 'car',

      setUseLocation: (wanted) => {
        if (wanted) {
          get().locate()
          return
        }
        stopWatch()
        // Routes start at the learner's location, so they go with it.
        set({
          useLocation: false,
          location: null,
          livePoint: null,
          locating: false,
          locationError: null,
          routeTo: null,
        })
      },
      locateOnOpen: () => {
        const state = get()
        if (state.askedOnOpen || state.useLocation) return
        set({ askedOnOpen: true })
        // A browser that can't share a location is told so only when the learner asks.
        if ('geolocation' in navigator) state.locate({ quietly: true })
      },
      locate: ({ quietly = false } = {}) => {
        if (!('geolocation' in navigator)) {
          set({ useLocation: false, locating: false, locationError: 'unsupported' })
          return
        }
        // Browsers share a location only with HTTPS pages (and localhost): on a plain-HTTP test server, say why.
        if (window.isSecureContext === false) {
          stopWatch()
          set({
            useLocation: false,
            location: null,
            livePoint: null,
            locating: false,
            locationError: quietly ? null : 'insecure',
          })
          return
        }
        set({ useLocation: true, locating: true, locationError: null })
        watchLocation(quietly)
      },
      resumeWatch: () => {
        if (watch || !get().useLocation || !('geolocation' in navigator)) return
        watchLocation(true)
      },
      pauseWatch: stopWatch,
      setPlaceText: (placeText) =>
        set((state) => ({
          placeText,
          placePoint: placeText && placeText === state.placeText ? state.placePoint : null,
        })),
      choosePlace: ({ label, latitude, longitude }) =>
        set({ placeText: label, placePoint: { label, latitude, longitude, pinned: false } }),
      movePlace: ({ label, latitude, longitude }) =>
        set({
          placePoint: {
            label,
            latitude: roundPin(latitude),
            longitude: roundPin(longitude),
            pinned: true,
          },
        }),
      unpinPlace: () => set({ placePoint: null }),
      showRoute: (routeTo) => set({ routeTo }),
      setTravelMode: (travelMode) => set({ travelMode }),
    }),
    {
      name: PLACE_KEY,
      storage: createJSONStorage(() => sessionStore),
      version: 1,
      // Only the typed place and its point: the location is never saved.
      partialize: ({ placeText, placePoint }) => ({ placeText, placePoint }),
    },
  ),
)
