import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PASSWORD, maria, serveAccountApi } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import {
  serveTrainingApi,
  weldingAssessment,
  weldingProgram,
  type TrainingRequest,
} from '../../test/training.ts'
import { useFinderStore } from '../finder/store.ts'
import { useTrainingStore } from './state.ts'

// Leaflet needs a real browser (tests/e2e/training.spec.ts covers the map). Here the map stands in as a list of its
// pins, so the page's wiring to it can be checked.
vi.mock('./CenterMap.tsx', () => ({
  default: ({ centers }: { centers: { id: string; name: string }[] }) => (
    <ul data-testid="map">
      {centers.map((center) => (
        <li key={center.id}>{center.name}</li>
      ))}
    </ul>
  ),
}))

const CATALOG = [
  {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
    possible_jobs: ['Welder'],
    competencies: [],
  },
  {
    code: 'CKY-NCII',
    name: 'Cookery NC II',
    sector: 'Tourism',
    possible_jobs: ['Cook'],
    competencies: [],
  },
]

function serveCatalog() {
  server.use(http.get('*/api/v1/qualifications', () => HttpResponse.json(CATALOG)))
}

async function openTraining(path = '/training') {
  const view = renderApp(path)
  await screen.findByRole('heading', { level: 2, name: /^All results/ })
  return view
}

const results = () => screen.getByRole('region', { name: /^All results/ })
/** The other centers' rows, by their View details buttons. */
const otherRows = () =>
  within(results())
    .getAllByRole('button', { name: /^View details: / })
    .map((button) => button.closest('li') as HTMLElement)
const featured = () => within(results()).getAllByRole('article')[0]
const sent = (requests: TrainingRequest[], method: string, path: string) =>
  requests.filter((request) => request.method === method && request.path === path)

/** The browser shares a location (Makati) when asked. */
function shareLocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { latitude: 14.55471, longitude: 121.02441 } } as GeolocationPosition),
    },
  })
}

beforeEach(() => {
  // The workspace measures its available height in the browser; jsdom has no layout observer.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  serveCatalog()
  useTrainingStore.setState({
    useLocation: false,
    location: null,
    locating: false,
    locationError: null,
    placeText: '',
    routeTo: null,
    travelMode: 'car',
    saved: [],
  })
  useFinderStore.getState().reset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'geolocation')
})

describe('Training & Assessment', () => {
  it('features the first center and initially shows two other centers before Show more', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    await openTraining()

    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeInTheDocument()
    // By name until there's a place to measure from.
    expect(
      within(featured()).getByRole('heading', { name: 'Cebu Skills Center' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Turn on your location or search a place to sort by distance.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Training programs (1)' })).toBeInTheDocument()
    // A recorded zero is free.
    expect(screen.getByText(/Flexible start • Free/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other centers (3)' })).toBeInTheDocument()
    expect(otherRows()).toHaveLength(2)
    const showMore = within(results()).getByRole('button', { name: 'Show more (1 more)' })
    expect(showMore.previousElementSibling).toHaveProperty('tagName', 'UL')

    await user.click(showMore)

    expect(otherRows()).toHaveLength(3)
    expect(within(results()).queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
    expect(within(await screen.findByTestId('map')).getAllByRole('listitem')).toHaveLength(4)
  })

  it('opens filtered from the address, as the finder sends it (US-07)', async () => {
    const api = serveTrainingApi()
    await openTraining(
      '/training?type=training&qualification=SMAW-NCII&q=Shielded+Metal+Arc+Welding',
    )

    expect(screen.getByRole('heading', { level: 2, name: 'All results (1)' })).toBeInTheDocument()
    expect(
      within(featured()).getByRole('heading', { name: 'Manila Welding Institute' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue(
      'Shielded Metal Arc Welding',
    )
    expect(sent(api.requests, 'GET', '/api/v1/training-programs')[0].search).toContain(
      'qualification_code=SMAW-NCII',
    )
    // The chosen qualification shows in the filters, ready to change or clear.
    expect(screen.getByRole('row', { name: /Shielded Metal Arc Welding/ })).toBeInTheDocument()
  })

  it('says a cost that isn’t given isn’t provided (US-08), and shows a program in full', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    await openTraining('/training?qualification=SMAW-NCII&type=training')

    expect(screen.getByText(/Starts .* • Not provided/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Program details' }))

    const dialog = await screen.findByRole('dialog', { name: weldingProgram.title })
    expect(within(dialog).getByText('Cost').nextSibling).toHaveTextContent('Not provided')
    expect(
      within(dialog).getByText('Manila Welding Institute, Manila, National Capital Region'),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('features a center chosen from the list, with focus on its name, at an address of its own', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining()

    await user.click(screen.getByRole('button', { name: 'View details: Manila Welding Institute' }))

    const heading = within(featured()).getByRole('heading', { name: 'Manila Welding Institute' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(new URLSearchParams(router.state.location.search).get('center')).toBe('training-1')
  })

  it('keeps the filters in the address as they change, without the place the learner typed', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining()

    // Both are on to start with: turning training centers off leaves assessment centers.
    await user.click(screen.getByRole('button', { name: 'Training center' }))
    expect(new URLSearchParams(router.state.location.search).getAll('type')).toEqual(['assessment'])
    expect(screen.getByRole('heading', { level: 2, name: 'All results (1)' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search centers' }), 'manila')
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('manila')

    await user.type(screen.getByRole('searchbox', { name: 'Search location' }), 'Cebu City')
    expect(router.state.location.search).not.toMatch(/cebu/i)
    expect(await screen.findByText('Approximate distances from Cebu City')).toBeInTheDocument()
  })

  it('keeps typed search and location after a training-list failure and reloads without clearing them', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    const { client, router } = await openTraining('/training?type=training')
    await user.type(screen.getByRole('searchbox', { name: 'Search centers' }), 'manila')
    await user.type(screen.getByRole('searchbox', { name: 'Search location' }), 'Cebu City')
    const address = router.state.location.search
    let attempts = 0
    server.use(
      http.get('*/api/v1/training-programs', () => {
        attempts++
        if (attempts === 1) return HttpResponse.error()
      }),
    )

    await act(() => client.invalidateQueries({ queryKey: ['training', 'listings'] }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t load the training and assessment list. Your search and filters are still here.',
    )
    expect(
      screen.getByText('Showing the last loaded results. They may be out of date.'),
    ).toBeVisible()
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('manila')
    expect(screen.getByRole('searchbox', { name: 'Search location' })).toHaveValue('Cebu City')
    expect(router.state.location.search).toBe(address)
    expect(screen.getByRole('heading', { name: 'Manila Welding Institute' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try loading the list again' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(attempts).toBe(2)
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('manila')
    expect(screen.getByRole('searchbox', { name: 'Search location' })).toHaveValue('Cebu City')
    expect(router.state.location.search).toBe(address)
  })

  it('offers a local retry on the first failed training list while keeping the typed search', async () => {
    serveTrainingApi()
    let attempts = 0
    server.use(
      http.get('*/api/v1/training-programs', () => {
        attempts++
        if (attempts === 1) return HttpResponse.error()
      }),
    )
    const user = userEvent.setup()
    const { router } = renderApp('/training?type=training&q=manila')
    await screen.findByRole('alert')
    expect(
      screen.queryByRole('heading', { name: 'No centers match your search' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('manila')
    await user.type(screen.getByRole('searchbox', { name: 'Search location' }), 'Cebu City')

    await user.click(screen.getByRole('button', { name: 'Try loading the list again' }))

    expect(
      await screen.findByRole('heading', { name: 'Manila Welding Institute' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('manila')
    expect(screen.getByRole('searchbox', { name: 'Search location' })).toHaveValue('Cebu City')
    expect(router.state.location.search).toContain('q=manila')
  })

  it('keeps the requested region when its reference list fails and never shows nationwide results', async () => {
    serveTrainingApi()
    let attempts = 0
    server.use(
      http.get('*/api/v1/regions', () => {
        attempts++
        if (attempts === 1) return HttpResponse.error()
      }),
    )
    const user = userEvent.setup()
    const { router } = renderApp('/training?type=training&region=NCR')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your search and filters are still here.',
    )
    expect(screen.queryByRole('heading', { name: /^All results/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cebu Skills Center' })).not.toBeInTheDocument()
    const regionSection = screen
      .getAllByText('Region', { exact: true })
      .map((element) => element.closest('details'))
      .find((element) => element !== null)!
    const regionSummary = regionSection.querySelector('summary')!
    expect(regionSummary).toHaveTextContent('NCR')
    await user.click(regionSummary)
    expect(within(regionSection).getByRole('button', { name: /Region$/ })).toHaveTextContent('NCR')
    expect(new URLSearchParams(router.state.location.search).get('region')).toBe('NCR')
    await user.type(screen.getByRole('searchbox', { name: 'Search centers' }), 'manila')
    await user.type(screen.getByRole('searchbox', { name: 'Search location' }), 'Cebu City')
    expect(new URLSearchParams(router.state.location.search).get('region')).toBe('NCR')

    await user.click(screen.getByRole('button', { name: 'Try loading the list again' }))

    expect(
      await screen.findByRole('heading', { name: 'Manila Welding Institute' }),
    ).toBeInTheDocument()
    const restoredRegionSection = screen
      .getAllByText('Region', { exact: true })
      .map((element) => element.closest('details'))
      .find((element) => element !== null)!
    if (!restoredRegionSection.open) {
      await user.click(restoredRegionSection.querySelector('summary')!)
    }
    expect(
      within(restoredRegionSection).getByRole('button', { name: /Region$/ }),
    ).toHaveTextContent('National Capital Region')
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('manila')
    expect(screen.getByRole('searchbox', { name: 'Search location' })).toHaveValue('Cebu City')
    expect(new URLSearchParams(router.state.location.search).get('region')).toBe('NCR')
    expect(screen.queryByRole('heading', { name: 'Cebu Skills Center' })).not.toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('measures from a typed place, nearest first, and gives no distance to a center without coordinates', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    await openTraining('/training?type=training')

    await user.type(screen.getByRole('searchbox', { name: 'Search location' }), 'Cebu City')

    await waitFor(() =>
      expect(
        within(featured()).getByRole('heading', { name: 'Cebu Skills Center' }),
      ).toBeInTheDocument(),
    )
    expect(within(featured()).getByText('Nearest to you')).toBeInTheDocument()
    const rows = otherRows()
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Manila Welding Institute'),
      expect.stringContaining('Mobile Training Unit'),
    ])
    expect(rows[0]).toHaveTextContent(/About .* km away/)
    expect(rows[1]).not.toHaveTextContent(/km away/)
  })

  it('says which filters are on when nothing matches, and Clear all broadens them (US-07)', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining('/training?type=assessment&q=astronaut')

    expect(
      screen.getByRole('heading', { name: 'No centers match your search' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Filters on: Assessment center · “astronaut”')).toBeInTheDocument()
    await user.click(within(results()).getByRole('button', { name: 'Clear all' }))

    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeInTheDocument()
  })

  it('filters both kinds of centers and map pins by radius, then restores all distances', async () => {
    shareLocation()
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining()
    await user.click(screen.getByText('Use my location'))
    await screen.findByText('Approximate distances from your location')

    await user.click(screen.getByRole('button', { name: /Radius near me$/ }))
    await user.click(screen.getByRole('option', { name: 'Within 10 km' }))

    expect(screen.getByRole('heading', { level: 2, name: 'All results (2)' })).toBeVisible()
    expect(
      within(screen.getByTestId('map'))
        .getAllByRole('listitem')
        .map((pin) => pin.textContent),
    ).toEqual(expect.arrayContaining(['Manila Welding Institute', 'Manila Assessment Center']))
    expect(within(screen.getByTestId('map')).queryByText('Cebu Skills Center')).toBeNull()
    expect(within(screen.getByTestId('map')).queryByText('Mobile Training Unit')).toBeNull()
    expect(screen.getByText('Within 10 km of your location')).toBeVisible()
    expect(router.state.location.search).toBe('?radius=10')

    await user.click(screen.getByRole('button', { name: /Radius near me$/ }))
    await user.click(screen.getByRole('option', { name: 'All distances' }))

    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeVisible()
    expect(within(screen.getByTestId('map')).getAllByRole('listitem')).toHaveLength(4)
    expect(router.state.location.search).toBe('')
  })

  it('keeps a radius pending without a location and applies it to a searched place', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining('/training?radius=10')

    expect(screen.getByRole('button', { name: /Radius near me$/ })).toBeDisabled()
    expect(
      screen.getByText('Share your location or search a place to apply the selected radius.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeVisible()
    await user.type(screen.getByRole('searchbox', { name: 'Search location' }), 'Cebu City')

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'All results (1)' })).toBeVisible(),
    )
    expect(screen.getByRole('button', { name: /Radius near me$/ })).toBeEnabled()
    expect(within(screen.getByTestId('map')).getAllByRole('listitem')).toHaveLength(1)
    expect(within(screen.getByTestId('map')).getByText('Cebu Skills Center')).toBeVisible()
    expect(router.state.location.search).toBe('?radius=10')

    await user.clear(screen.getByRole('searchbox', { name: 'Search location' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeVisible(),
    )
    expect(screen.getByRole('button', { name: /Radius near me$/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Show all distances' }))
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeVisible()
  })

  it('can broaden an empty radius search while keeping its other filters and location', async () => {
    shareLocation()
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining('/training?type=training&q=Manila&radius=5')
    await user.click(screen.getByText('Use my location'))

    expect(
      await screen.findByRole('heading', { name: 'No centers match your search' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Show all distances' }))

    expect(screen.getByRole('heading', { level: 2, name: 'All results (1)' })).toBeVisible()
    expect(screen.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('Manila')
    expect(screen.getByRole('switch', { name: /Use my location/ })).toBeChecked()
    const query = new URLSearchParams(router.state.location.search)
    expect(query.get('radius')).toBeNull()
    expect(query.get('type')).toBe('training')
    expect(query.get('q')).toBe('Manila')
  })

  it('clears a pending radius while keeping the selected center type', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    const { router } = await openTraining('/training?radius=10&type=assessment')

    expect(screen.getByRole('heading', { level: 2, name: 'All results (1)' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Radius near me$/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Show all distances' }))

    expect(router.state.location.search).toBe('?type=assessment')
    expect(screen.getByRole('heading', { level: 2, name: 'All results (1)' })).toBeVisible()
  })

  it('draws routes from the learner’s approximate location, by travel mode', async () => {
    shareLocation()
    const api = serveTrainingApi({ missingModes: ['foot'] })
    const user = userEvent.setup()
    await openTraining('/training?type=training')

    await user.click(screen.getByText('Use my location'))
    expect(await screen.findByText('Approximate distances from your location')).toBeInTheDocument()
    expect(
      within(featured()).getByRole('heading', { name: 'Manila Welding Institute' }),
    ).toBeInTheDocument()

    await user.click(within(featured()).getByRole('button', { name: 'Get directions' }))

    const modes = await screen.findByRole('radiogroup', { name: 'Travel mode' })
    expect(within(modes).getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByText('10.3 km · about 14 min by car')).toBeInTheDocument()
    expect(screen.getByText('No walking route could be loaded right now.')).toBeInTheDocument()
    // The location goes to the API rounded to about 1 km, and never into the page's address.
    const [request] = sent(api.requests, 'GET', '/api/v1/routes')
    expect(new URLSearchParams(request.search).get('origin')).toBe('14.55,121.02')

    await user.click(within(modes).getByRole('radio', { name: /by bike/ }))
    expect(screen.getByText('10.3 km · about 36 min by bike')).toBeInTheDocument()
  })

  it('links to Google Maps for directions when this server can’t route', async () => {
    shareLocation()
    serveTrainingApi({ routingEnabled: false })
    const user = userEvent.setup()
    await openTraining('/training?type=training')
    await user.click(screen.getByText('Use my location'))
    await screen.findByText('Approximate distances from your location')

    const link = within(featured()).getByRole('link', { name: 'Get directions' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=14.5995,120.9842',
    )
  })

  it('says why the location couldn’t be used, and the rest still works (US-08)', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) =>
          failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    })
    serveTrainingApi()
    const user = userEvent.setup()
    await openTraining('/training?radius=10')

    await user.click(screen.getByText('Use my location'))

    expect(
      await screen.findByText(
        'Location access was declined. Search a place or choose a region instead.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Use my location/ })).not.toBeChecked()
    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Radius near me$/ })).toBeDisabled()
  })

  it('ranks programs by fit with the finder’s goal, never with the learner’s own location', async () => {
    shareLocation()
    const api = serveTrainingApi()
    useFinderStore.getState().begin({
      query: 'I want to be a welder.',
      profile: { intent: 'unknown' },
      sessionId: null,
      sessionOwner: null,
    })
    const user = userEvent.setup()
    await openTraining('/training?qualification=SMAW-NCII&type=training')
    await user.click(screen.getByText('Use my location'))

    expect(await screen.findByText('82% fit')).toBeInTheDocument()
    const bodies = sent(api.requests, 'POST', '/api/v1/recommendations/training').map((r) => r.body)
    expect(bodies.at(-1)).toMatchObject({
      qualification_code: 'SMAW-NCII',
      goal: 'I want to be a welder.',
    })
    expect(bodies.at(-1)).not.toHaveProperty('near_lat')
  })

  it('hides the map, and remembers that the learner did', async () => {
    serveTrainingApi()
    const user = userEvent.setup()
    await openTraining()

    await user.click(screen.getByRole('button', { name: 'Hide map' }))

    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    expect(otherRows()).toHaveLength(2)
    expect(within(results()).getByRole('button', { name: 'Show more (1 more)' })).toBeVisible()
    expect(window.localStorage.getItem('tesda-track.training-map')).toBe('hidden')
  })
})

describe('applying for an assessment (US-09)', () => {
  async function openSchedule(user: UserEvent) {
    await openTraining('/training?type=assessment')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
  }

  it('shows missing service evidence and blocks an application with unconfirmed availability', async () => {
    serveTrainingApi()
    server.use(
      http.get('*/api/v1/assessment-schedules', () =>
        HttpResponse.json([{ ...weldingAssessment, availability: { status: 'unknown' } }]),
      ),
    )
    await openTraining('/training?type=assessment')

    expect(screen.getByText('Intake availability requires confirmation')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('asks a guest to sign in, then shows the application to review, without sending it', async () => {
    serveAccountApi()
    const api = serveTrainingApi()
    const user = userEvent.setup()
    await openSchedule(user)

    const signIn = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(signIn).getByLabelText('Email'), maria.email)
    await user.type(within(signIn).getByLabelText('Password'), PASSWORD)
    await user.click(within(signIn).getByRole('button', { name: 'Sign in' }))

    const review = await screen.findByRole('dialog', { name: 'Apply for this assessment' })
    expect(within(review).getByText('Shielded Metal Arc Welding (SMAW) NC II')).toBeInTheDocument()
    expect(
      within(review).getByText('Manila Assessment Center, Manila, National Capital Region'),
    ).toBeInTheDocument()
    expect(within(review).getByText(/Philippine time/)).toBeInTheDocument()
    expect(within(review).getByText('₱750.00 fee')).toBeInTheDocument()
    expect(within(review).getByText(/doesn’t reserve a seat/)).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/me/assessment-applications')).toEqual([])

    await user.click(within(review).getByRole('button', { name: 'Send application' }))

    const sentDialog = await screen.findByRole('dialog', { name: 'Application sent' })
    expect(
      within(sentDialog).getByText(/Reference 9F1C2A52 · Status: Awaiting review/),
    ).toBeInTheDocument()
    expect(within(sentDialog).getByRole('link', { name: 'Go to My Progress' })).toHaveAttribute(
      'href',
      '/progress',
    )
    expect(sent(api.requests, 'POST', '/api/v1/me/assessment-applications')).toHaveLength(1)
  })

  it('says so when the API refuses, without claiming it was sent', async () => {
    serveAccountApi()
    const api = serveTrainingApi({ applyStatus: 409 })
    const user = userEvent.setup()
    await openSchedule(user)
    const signIn = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(signIn).getByLabelText('Email'), maria.email)
    await user.type(within(signIn).getByLabelText('Password'), PASSWORD)
    await user.click(within(signIn).getByRole('button', { name: 'Sign in' }))
    const review = await screen.findByRole('dialog', { name: 'Apply for this assessment' })

    await user.click(within(review).getByRole('button', { name: 'Send application' }))

    expect(await within(review).findByRole('alert')).toHaveTextContent(
      'You have already applied for this schedule.',
    )
    expect(screen.queryByRole('dialog', { name: 'Application sent' })).not.toBeInTheDocument()

    await user.click(within(review).getByRole('button', { name: 'Send application' }))
    await waitFor(() =>
      expect(sent(api.requests, 'POST', '/api/v1/me/assessment-applications')).toHaveLength(2),
    )
    const requests = sent(api.requests, 'POST', '/api/v1/me/assessment-applications')
    expect(requests[0].body).toEqual({
      schedule_id: weldingAssessment.id,
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(requests[1].body).toEqual(requests[0].body)
  })
})
