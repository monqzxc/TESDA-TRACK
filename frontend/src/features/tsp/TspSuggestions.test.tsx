import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/app.tsx'
import { serveFinderApi, serveFinderCatalog } from '../../test/finder.ts'
import { useFinderStore } from '../finder/store.ts'
import { suggestionProfile, hasSuggestionSignal } from './suggestions.ts'

beforeEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

const WITH_SKILLS = '/tsp/webview?skills=welding,metal%20fabrication&experience_years=2&region=VII'

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

describe('Suggested for you', () => {
  it('suggests from the TSP profile alone and carries the choice into the matching flow', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const { router } = renderApp(WITH_SKILLS)

    expect(await screen.findByRole('heading', { name: 'Suggested for you' })).toBeInTheDocument()
    expect(await screen.findByText('Shielded Metal Arc Welding (SMAW) NC II')).toBeInTheDocument()
    expect(screen.getByText('From your TSP profile: welding')).toBeInTheDocument()

    const request = api.requests.find((r) => r.path === '/api/v1/analysis/suggestions')
    expect(request?.body).toMatchObject({
      limit: 3,
      profile: { existing_skills: ['welding', 'metal fabrication'], experience_years: 2 },
    })

    await user.click(screen.getByRole('button', { name: 'See my pathway' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview/matches'))
    expect(api.requests.find((r) => r.path === '/api/v1/analysis/goal')?.body).toEqual({
      query: 'Shielded Metal Arc Welding (SMAW) NC II',
    })
  })

  it('shows why the suggestions were made', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    renderApp(WITH_SKILLS)

    await user.click(await screen.findByText('Why these'))
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
    await user.type(screen.getByRole('textbox', { name: 'Career goal' }), 'Barista')
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
