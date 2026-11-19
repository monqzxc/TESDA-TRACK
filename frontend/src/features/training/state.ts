import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sessionStore } from '../../lib/sessionStore.ts'
import type { TravelMode } from './api.ts'
import type { Point } from './centers.ts'
import { readTrainingAddress, writeTrainingAddress, type TrainingFilters } from './address.ts'
import { PLACE_KEY } from './key.ts'

// The page's state. Filters are in the address (useTrainingFilters). The rest stays in this tab: the learner's
// location is kept in memory only and never saved or sent anywhere but where the page says. The place they typed is
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

export type LocationError = 'denied' | 'unavailable' | 'unsupported'

interface TrainingState {
  /** The learner asked to use their location, or the page did when it opened. */
  useLocation: boolean
  /** The page has asked for the location on its own during this visit, which it does only once. */
  askedOnOpen: boolean
  /** Their approximate location (rounded to about 1 km), once the browser shares it. */
  location: Point | null
  locating: boolean
  locationError: LocationError | null
  /** A city, province or region the learner typed, to measure distances from. */
  placeText: string
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
  setPlaceText: (text: string) => void
  showRoute: (centerId: string | null) => void
  setTravelMode: (mode: TravelMode) => void
}

/** Two decimal places: about 1 km, as the page promises. */
const round = (value: number) => Math.round(value * 100) / 100

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      useLocation: false,
      askedOnOpen: false,
      location: null,
      locating: false,
      locationError: null,
      placeText: '',
      routeTo: null,
      travelMode: 'car',

      setUseLocation: (wanted) => {
        if (wanted) {
          get().locate()
          return
        }
        // Routes start at the learner's location, so they go with it.
        set({
          useLocation: false,
          location: null,
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
        set({ useLocation: true, locating: true, locationError: null })
        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Turned off while the browser was asking: the answer isn't used.
            if (!get().useLocation) return
            set({
              locating: false,
              location: {
                latitude: round(position.coords.latitude),
                longitude: round(position.coords.longitude),
              },
            })
          },
          (error) => {
            // Turned off while the browser was asking (Show all centers instead): there's nothing to explain.
            if (!get().useLocation) return
            set({
              useLocation: false,
              location: null,
              locating: false,
              locationError: quietly
                ? null
                : error.code === error.PERMISSION_DENIED
                  ? 'denied'
                  : 'unavailable',
            })
          },
          { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
        )
      },
      setPlaceText: (placeText) => set({ placeText }),
      showRoute: (routeTo) => set({ routeTo }),
      setTravelMode: (travelMode) => set({ travelMode }),
    }),
    {
      name: PLACE_KEY,
      storage: createJSONStorage(() => sessionStore),
      version: 1,
      // Only the typed place: the location is never saved.
      partialize: ({ placeText }) => ({ placeText }),
    },
  ),
)
