import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/app.tsx'
import { serveFinderApi, serveFinderCatalog } from '../../test/finder.ts'
import { useFinderStore } from '../finder/store.ts'
import { parseTspParams } from './params.ts'

beforeEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

describe('TSP WebView', () => {
  it('accepts only bounded learner hints from a launch URL', () => {
    expect(
      parseTspParams(
        '?learner_id=TSP-42&name=Ana&goal=Welder&skills=welding,metalwork&skills=safety&experience_years=2&has_certification=false&region=VII&token=secret',
      ),
    ).toEqual({
      learnerId: 'TSP-42',
      name: 'Ana',
      goal: 'Welder',
      skills: 'welding, metalwork, safety',
      experienceYears: '2',
      hasCertification: 'no',
      region: 'VII',
    })
    expect(parseTspParams('?experience_years=-2&has_certification=maybe').experienceYears).toBe('')
    expect(parseTspParams('?experience_years=-2&has_certification=maybe').hasCertification).toBe('')
  })

  it('prefills learner details, clears the launch query, and sends only recommendation inputs to the API', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const { router } = renderApp(
      '/tsp/webview?learner_id=TSP-42&name=Ana%20Santos&goal=I%20want%20to%20be%20a%20welder.&skills=metal%20fabrication,welding&experience_years=2&has_certification=no&region=VII',
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Find your TESDA qualification' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ana Santos')).toBeInTheDocument()
    expect(screen.getByText('Learner reference: TSP-42')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Your career interests or skills' })).toHaveValue(
      'I want to be a welder.',
    )
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(api.requests).toEqual([])

    await user.click(screen.getByRole('link', { name: /Browse all qualifications/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview/qualifications'))
    await user.click(await screen.findByRole('link', { name: 'Find my path' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview'))
    expect(screen.getByRole('textbox', { name: 'Your career interests or skills' })).toHaveValue(
      'I want to be a welder.',
    )
    await user.click(screen.getByRole('button', { name: 'Find my match' }))
    expect(screen.getByRole('textbox', { name: /Existing skills/ })).toHaveValue(
      'metal fabrication, welding',
    )

    await user.click(screen.getByRole('button', { name: 'Show my matches' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview/matches'))
    await waitFor(() =>
      expect(
        api.requests.find((request) => request.path === '/api/v1/analysis/matches')?.body,
      ).toMatchObject({
        query: 'I want to be a welder.',
        profile: {
          existing_skills: ['metal fabrication', 'welding'],
          experience_years: 2,
          has_certification: false,
        },
      }),
    )
    expect(api.requests.find((request) => request.path === '/api/v1/analysis/goal')?.body).toEqual({
      query: 'I want to be a welder.',
      interpret_input: true,
    })
    expect(JSON.stringify(api.requests)).not.toContain('TSP-42')
    expect(JSON.stringify(api.requests)).not.toContain('Ana Santos')
    expect(useFinderStore.getState().place.region).toBe('VII')

    await user.click((await screen.findAllByRole('button', { name: 'Am I ready?' }))[0])
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview/readiness'))
    for (let skill = 0; skill < 4; skill++) {
      await user.click(await screen.findByRole('button', { name: 'I can do it' }))
      await user.click(await screen.findByRole('button', { name: skill === 3 ? 'See recommendation' : 'Next skill' }))
    }
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview/recommendation'))
    expect(api.requests.some((request) => request.path === '/api/v1/analysis/readiness')).toBe(true)
  })
})
