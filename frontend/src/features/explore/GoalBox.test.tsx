import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '../../copy/en.ts'
import { renderWithAuth } from '../../test/account.tsx'
import { server } from '../../test/server.ts'
import { manilaInstitute, REGIONS, weldingProgram } from '../../test/training.ts'
import { GOAL_MAX_LENGTH } from '../finder/key.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// BUG-10 (US-0007): the Career Map's "Type what you can do" box validates as /find does: an empty submit asks
// for a goal, and a goal is at most 500 characters.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => <ul data-testid="map">{props.centers.length}</ul>,
}))

let matched = 0

beforeEach(() => {
  matched = 0
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
    http.post('*/api/v1/*', () => {
      matched += 1
      return HttpResponse.json({}, { status: 500 })
    }),
  )
})

const renderPage = () =>
  renderWithAuth(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )

describe('Career Map goal box', () => {
  it('asks for a goal when submitted empty, and clears the prompt on typing', async () => {
    const user = userEvent.setup()
    renderPage()
    const box = await screen.findByPlaceholderText(en.explore.search.placeholder)

    await user.click(box)
    await user.type(box, '   {Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(en.finder.unified.empty)
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveFocus()
    expect(matched).toBe(0)

    await user.type(box, 'I can weld')
    expect(screen.queryByText(en.finder.unified.empty)).not.toBeInTheDocument()
  })

  it(`takes ${GOAL_MAX_LENGTH} characters at most, as /find does`, async () => {
    const user = userEvent.setup()
    renderPage()
    const box = await screen.findByPlaceholderText(en.explore.search.placeholder)

    expect(box).toHaveAttribute('maxlength', String(GOAL_MAX_LENGTH))
    await user.click(box)
    await user.paste('a'.repeat(GOAL_MAX_LENGTH + 20))
    expect(box).toHaveValue('a'.repeat(GOAL_MAX_LENGTH))
  })
})
