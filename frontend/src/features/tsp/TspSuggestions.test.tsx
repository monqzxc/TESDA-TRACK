import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/app.tsx'
import { cookery, serveFinderApi, serveFinderCatalog, suggestedWelding } from '../../test/finder.ts'
import { server } from '../../test/server.ts'
import { useFinderStore } from '../finder/store.ts'
import { suggestionProfile, hasSuggestionSignal } from './suggestions.ts'

beforeEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

const WITH_SKILLS = '/tsp/webview?skills=welding,metal%20fabrication&experience_years=2&region=VII'

const suggestedCookery = {
  qualification: { code: cookery.code, name: cookery.name, sector: cookery.sector },
  score: 60,
  reason: 'From your TSP profile: cooking',
}

describe('suggestionProfile', () => {
  it('carries the TSP hints without the goal the learner is typing', () => {
    expect(
      suggestionProfile(
        { skills: 'welding, metal fabrication', experienceYears: '2', hasCertification: 'no' },
        null,
      ),
    ).toEqual({
      career_goal: null,
      possible_sector: null,
      existing_skills: ['welding', 'metal fabrication'],
      experience_years: 2,
      has_certification: false,
      intent: 'unknown',
    })
  })

  it('adds the Skill Passport skills behind the learner hints, without repeats', () => {
    const profile = suggestionProfile(
      { skills: 'welding', experienceYears: '', hasCertification: '' },
      {
        skills: ['Welding', 'Blueprint reading'],
        experience: [],
        education: [],
        qualifications: [],
        credentials: [],
      },
    )
    expect(profile.existing_skills).toEqual(['welding', 'Blueprint reading'])
    expect(profile.experience_years).toBeNull()
    expect(profile.has_certification).toBeNull()
  })

  it('needs a skill or career to suggest from: experience alone says nothing about what', () => {
    expect(
      hasSuggestionSignal(
        suggestionProfile({ skills: '', experienceYears: '5', hasCertification: 'yes' }, null),
      ),
    ).toBe(false)
  })
})

function suggestionsTurnedOn(on: boolean) {
  server.use(
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({
        carto_key: '',
        routing_enabled: false,
        skills_bridge_enabled: false,
        tsp_sign_in: false,
        tsp_suggestions: on,
      }),
    ),
  )
}

describe('Suggested for you', () => {
  beforeEach(() => suggestionsTurnedOn(true))

  it('stays off, without asking, until the server turns suggestions on', async () => {
    suggestionsTurnedOn(false)
    serveFinderCatalog()
    const api = serveFinderApi()
    renderApp(WITH_SKILLS)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Find your TESDA qualification' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Suggested for you' })).not.toBeInTheDocument()
    expect(api.requests.some((r) => r.path === '/api/v1/analysis/suggestions')).toBe(false)
  })

  it('suggests from the TSP profile alone and carries the choice into the matching flow', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const { router } = renderApp(WITH_SKILLS)

    expect(await screen.findByRole('heading', { name: 'Suggested for you' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Suggested for you' }))
    expect(
      screen.getByRole('heading', { level: 3, name: 'Shielded Metal Arc Welding (SMAW) NC II' }),
    ).toBeVisible()
    expect(screen.getByText('From your TSP profile: welding')).toBeVisible()

    const request = api.requests.find((r) => r.path === '/api/v1/analysis/suggestions')
    expect(request?.body).toMatchObject({
      limit: 3,
      profile: { existing_skills: ['welding', 'metal fabrication'], experience_years: 2 },
    })

    await user.click(screen.getByRole('button', { name: 'See my pathway' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview/matches'))
    // Counted as a tapped suggestion, apart from typed goals, so uptake can be compared in the pilot.
    expect(api.requests.find((r) => r.path === '/api/v1/analysis/goal')?.body).toEqual({
      query: 'Shielded Metal Arc Welding (SMAW) NC II',
      origin: 'suggestion',
    })
  })

  it('folds the suggestions into one row above the goal box until the learner opens them', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    renderApp(WITH_SKILLS)

    const toggle = await screen.findByRole('button', { name: 'Suggested for you' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The row says what's behind it, and is read with the button.
    expect(toggle).toHaveAccessibleDescription('1 qualification based on your TSP profile')
    expect(screen.queryByRole('button', { name: 'See my pathway' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Find centers' })).not.toBeInTheDocument()
    // The goal box follows the row, ready to type in.
    const goal = screen.getByRole('textbox', { name: 'Your career interests or skills' })
    expect(goal).toBeVisible()
    expect(toggle.compareDocumentPosition(goal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'See my pathway' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Find centers' })).toHaveAttribute(
      'href',
      expect.stringContaining('/tsp/webview/training'),
    )

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'See my pathway' })).not.toBeInTheDocument()
  })

  it('counts the suggestions behind the row', async () => {
    serveFinderCatalog()
    serveFinderApi({ suggestions: [suggestedWelding, suggestedCookery] })
    renderApp(WITH_SKILLS)

    expect(
      await screen.findByText('2 qualifications based on your TSP profile'),
    ).toBeInTheDocument()
  })

  it('stays open for the rest of the visit once the learner opens it', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    const first = renderApp(WITH_SKILLS)
    await user.click(await screen.findByRole('button', { name: 'Suggested for you' }))
    first.unmount()

    // Back from a center list, say: the same tab finds the suggestions as the learner left them.
    renderApp(WITH_SKILLS)
    expect(await screen.findByRole('button', { name: 'Suggested for you' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'See my pathway' })).toBeVisible()
  })

  it('shows why the suggestions were made', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    renderApp(WITH_SKILLS)

    await user.click(await screen.findByRole('button', { name: 'Suggested for you' }))
    await user.click(screen.getByText('Why these'))
    expect(
      await screen.findByText('Skills on your TSP profile: welding, metal fabrication'),
    ).toBeInTheDocument()
  })

  it('never asks for suggestions when TSP sent no skills', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    renderApp('/tsp/webview')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Find your TESDA qualification' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Suggested for you' })).not.toBeInTheDocument()
    expect(api.requests.some((r) => r.path === '/api/v1/analysis/suggestions')).toBe(false)
  })

  it('steps aside once the learner types a goal of their own', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    renderApp(WITH_SKILLS)

    expect(await screen.findByRole('heading', { name: 'Suggested for you' })).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: 'Your career interests or skills' }),
      'Barista',
    )
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Suggested for you' })).not.toBeInTheDocument(),
    )
  })

  it('leaves the goal box usable when suggestions fail', async () => {
    serveFinderCatalog()
    serveFinderApi({ failSuggestions: 10 })
    renderApp(WITH_SKILLS)

    expect(
      await screen.findByText("We couldn't load suggestions. You can still type your goal below."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find my match' })).toBeEnabled()
  })

  it('says so plainly when nothing in the catalog is close', async () => {
    serveFinderCatalog()
    serveFinderApi({ suggestions: [] })
    renderApp(WITH_SKILLS)

    expect(
      await screen.findByText('Nothing close to your skills yet. Type the job you want below.'),
    ).toBeInTheDocument()
  })
})
