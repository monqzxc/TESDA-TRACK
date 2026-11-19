import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import { server } from '../../test/server.ts'
import { manilaInstitute, REGIONS, weldingProgram } from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { PLACE_KEY } from '../training/key.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { NEAR_KM } from './explore.ts'
import { EXPLORE_KEY } from './key.ts'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// A refresh keeps the Career Map's goal, typed place and results in this tab, as on Find my pathway; closing the tab
// (sessionStorage) clears them. The learner's location is never saved.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => <ul data-testid="map">{props.centers.length}</ul>,
}))

const search = {
  query: 'I can weld',
  result: {
    profile: { intent: 'assessment_recommendation' as const },
    matches: [{ qualification: weldingProgram.qualification, score: 50, reason: 'Matched weld' }],
  },
}

/** What a reload does: the page's memory goes, and the stores read back what this tab saved. */
async function reload() {
  const saved = [EXPLORE_KEY, PLACE_KEY].map(
    (key) => [key, window.sessionStorage.getItem(key)] as const,
  )
  useExploreStore.setState({ draft: '', search: null, rangeKm: NEAR_KM, rangeChosen: false })
  useTrainingStore.setState({ placeText: '', useLocation: false, location: null })
  // Emptying memory saves the empty state; a reload would have found what was there before.
  for (const [key, value] of saved) {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  }
  await Promise.all([useExploreStore.persist.rehydrate(), useTrainingStore.persist.rehydrate()])
}

beforeEach(() => {
  window.sessionStorage.clear()
  useExploreStore.getState().reset()
  useDemandStore.setState({ region: undefined, scope: undefined, locality: null, code: null })
  useTrainingStore.setState({
    useLocation: false,
    location: null,
    locating: false,
    placeText: '',
    locationError: null,
    askedOnOpen: true,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute])),
    http.get('*/api/v1/assessment-centers', () => HttpResponse.json([])),
    http.get('*/api/v1/training-programs', () => HttpResponse.json([weldingProgram])),
    http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
  )
})

describe('Career Map after a refresh', () => {
  it('keeps the goal, the typed place and the results', async () => {
    useExploreStore.getState().setDraft('I can weld')
    useExploreStore.getState().setSearch(search)
    useExploreStore.getState().setRange(50)
    useTrainingStore.getState().setPlaceText('Manila')

    await reload()
    renderWithAuth(
      <MemoryRouter initialEntries={['/explore']}>
        <ExplorePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('searchbox')).toHaveValue('I can weld')
    expect(await screen.findByRole('textbox', { name: 'Or type a city or province' })).toHaveValue(
      'Manila',
    )
    expect((await screen.findAllByText(weldingProgram.qualification.name)).length).toBeGreaterThan(
      0,
    )
    expect(useExploreStore.getState()).toMatchObject({ rangeKm: 50, rangeChosen: true })
  })

  it('never saves the learner’s location', () => {
    useTrainingStore.setState({
      useLocation: true,
      location: { latitude: 14.55, longitude: 121.02 },
    })
    useTrainingStore.getState().setPlaceText('Manila')

    expect(JSON.parse(window.sessionStorage.getItem(PLACE_KEY)!).state).toEqual({
      placeText: 'Manila',
    })
  })

  it('starts empty once the saved work is cleared, as when the tab is closed', async () => {
    useExploreStore.getState().setSearch(search)
    useTrainingStore.getState().setPlaceText('Manila')
    window.sessionStorage.removeItem(EXPLORE_KEY)
    window.sessionStorage.removeItem(PLACE_KEY)

    await reload()

    expect(useExploreStore.getState().search).toBeNull()
    expect(useTrainingStore.getState().placeText).toBe('')
  })
})
