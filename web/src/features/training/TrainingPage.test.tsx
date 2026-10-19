import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PASSWORD, maria, serveAccountApi } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { serveTrainingApi, weldingProgram, type TrainingRequest } from '../../test/training.ts'
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
  Reflect.deleteProperty(navigator, 'geolocation')
})

describe('Training & Assessment', () => {
  it('lists every center, the first in full with its programs, and the rest as rows', async () => {
    serveTrainingApi()
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
    await openTraining()

    await user.click(screen.getByText('Use my location'))

    expect(
      await screen.findByText(
        'Location access was declined. Search a place or choose a region instead.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Use my location/ })).not.toBeChecked()
    expect(screen.getByRole('heading', { level: 2, name: 'All results (4)' })).toBeInTheDocument()
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
    expect(otherRows()).toHaveLength(3)
    expect(window.localStorage.getItem('tesda-track.training-map')).toBe('hidden')
  })
})

describe('applying for an assessment (US-09)', () => {
  async function openSchedule(user: UserEvent) {
    await openTraining('/training?type=assessment')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
  }

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
    serveTrainingApi({ applyStatus: 409 })
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
  })
})
