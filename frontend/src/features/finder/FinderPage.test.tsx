import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PASSWORD, maria, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import {
  cookery,
  serveFinderApi,
  serveFinderCatalog,
  welding,
  welderProfile,
  type FinderRequest,
} from '../../test/finder.ts'
import { FINDER_KEY, useFinderStore } from './store.ts'
import { server } from '../../test/server.ts'

const GOAL = 'I want to be a welder.'

beforeEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

async function openFinder(path = '/find') {
  const view = renderApp(path)
  await screen.findByRole('heading', { level: 1, name: 'Find my pathway' })
  return view
}

/** Sends the welder goal from Your goal, and waits for Your match. */
async function submitGoal(user: UserEvent) {
  const view = await openFinder()
  await user.click(await screen.findByRole('button', { name: 'Become a welder' }))
  await user.click(screen.getByRole('button', { name: 'Get recommendation' }))
  await screen.findByRole('heading', { level: 2, name: 'Your match' })
  await screen.findByRole('article', { name: welding.name })
  return view
}

/** Answers a select (React Aria's Select) by its label. */
async function choose(user: UserEvent, label: RegExp, option: string) {
  await user.click(screen.getByRole('button', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

/** Rates every skill of the qualification on screen, part by part. Skill 4 is a gap. */
async function rateAll(user: UserEvent) {
  for (;;) {
    for (const group of screen.getAllByRole('radiogroup', { name: /^\d+\. / })) {
      const gap = (group.textContent ?? '').startsWith('4.')
      await user.click(
        within(group).getByRole('radio', {
          name: gap ? 'I am not familiar with this' : 'I can do this confidently',
        }),
      )
    }
    const next = screen.queryByRole('button', { name: /^Next: .* skills$/ })
    if (!next) return
    await user.click(next)
  }
}

const sent = (requests: FinderRequest[], method: string, path: string) =>
  requests.filter((request) => request.method === method && request.path === path)

describe('Find my pathway', () => {
  it('fills the goal box from an example without sending it, and says what to do with an empty goal', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await openFinder()

    await user.click(await screen.findByRole('button', { name: 'Work in a hotel' }))
    const box = screen.getByRole('textbox', { name: 'Or tell us in your own words' })
    expect(box).toHaveValue(
      'I want to work in a hotel but I don’t know which qualification is suitable for me.',
    )
    expect(api.requests).toEqual([])

    await user.clear(box)
    await user.click(screen.getByRole('button', { name: 'Get recommendation' }))

    expect(screen.getByText('Describe your career goal or skills to get started.')).toBeVisible()
    expect(box).toHaveFocus()
    expect(api.requests).toEqual([])
  })

  it('sends the goal in the request body only, and opens Your match with the goal above it', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const { router } = await submitGoal(user)

    expect(router.state.location.pathname).toBe('/find/matches')
    expect(router.state.location.search).toBe('')
    expect(sent(api.requests, 'POST', '/api/v1/analysis/goal')[0].body).toEqual({ query: GOAL })
    expect(screen.getByText(GOAL)).toBeInTheDocument()
    expect(document.title).not.toContain('welder')
    // The goal is kept for this tab only.
    expect(window.sessionStorage.getItem(FINDER_KEY)).toContain(GOAL)
    expect(window.localStorage.getItem(FINDER_KEY)).toBeNull()

    const card = screen.getByRole('article', { name: welding.name })
    expect(within(card).getByText('Top match')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Goal match: 76%' })).toBeInTheDocument()
    expect(within(card).getByText('Matched your words: welder')).toBeInTheDocument()
  })

  it('asks what the goal left out, and sends the answers with the matches request', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)

    await choose(user, /Do you already have welding experience/, '1–3 years')
    await choose(user, /Do you currently hold a related certification/, 'I’m not sure')

    await waitFor(() => {
      const last = sent(api.requests, 'POST', '/api/v1/analysis/matches').at(-1)
      expect(last?.body).toMatchObject({
        query: GOAL,
        profile: { experience_years: 2, has_certification: null },
      })
    })
    const facts = screen.getByRole('region', { name: 'Your starting point' })
    // Not sure is said as it is, not as a certification or none (US-03).
    expect(
      within(facts)
        .getAllByRole('definition')
        .map((fact) => fact.textContent),
    ).toEqual(['Welder', '1–3 years', 'Not sure', 'Training recommendation'])
  })

  it('labels a qualification picked from the full list as the learner’s choice', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)

    await choose(user, /Or choose any qualification to explore/, cookery.name)

    const card = await screen.findByRole('article', { name: cookery.name })
    expect(within(card).getByText('Your choice')).toBeInTheDocument()
  })

  it('asks for a qualification before the readiness check when the goal matched none', async () => {
    serveFinderCatalog()
    serveFinderApi({ matches: [] })
    const user = userEvent.setup()
    await openFinder()
    await user.click(await screen.findByRole('button', { name: 'Become a welder' }))
    await user.click(screen.getByRole('button', { name: 'Get recommendation' }))

    expect(await screen.findByText(/We couldn’t find a clear match/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Next: Readiness check' }))

    expect(
      await screen.findByRole('heading', { name: 'Choose a qualification first' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /^1\. / })).not.toBeInTheDocument()
  })

  it('checks readiness part by part, and sends nothing until every skill is rated', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))

    expect(await screen.findByText('Part 1 of 3 · Basic skills')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Why we ask' })).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('radiogroup', { name: /^1\. / })).getByRole('radio', {
        name: 'I can do this confidently',
      }),
    )
    expect(screen.getByText('1 of 4 skills rated')).toBeInTheDocument()

    // On to Core without rating the rest, then Analyze: the learner goes back to the first skill to rate.
    await user.click(screen.getByRole('button', { name: 'Next: Common skills' }))
    expect(screen.getByText('Part 2 of 3 · Common skills')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Next: Core skills' }))
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Rate every skill before you analyze. 3 are still unrated, starting in Basic skills.',
    )
    expect(screen.getByText('Part 1 of 3 · Basic skills')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByRole('radiogroup', { name: /^2\. / })).getAllByRole('radio')[0],
      ).toHaveFocus(),
    )
    expect(sent(api.requests, 'POST', '/api/v1/analysis/readiness')).toEqual([])

    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))

    expect(await screen.findByRole('heading', { name: /focused training/ })).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/analysis/readiness')[0].body).toEqual({
      qualification_code: welding.code,
      answers: { 1: 'confident', 2: 'confident', 3: 'confident', 4: 'not_familiar' },
    })
  })

  it('shows the verdict, and opens Training & Assessment filtered to the qualification', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    const { router } = await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))

    // 3 of 4 confident: 75%, moderate.
    expect(
      await screen.findByRole('heading', { name: 'Take focused training, then the NC assessment' }),
    ).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText(/not an official competency assessment result/)).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Close your skill gaps' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Find training near you' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/training'))
    const query = new URLSearchParams(router.state.location.search)
    expect(query.getAll('type')).toEqual(['training'])
    expect(query.getAll('qualification')).toEqual([welding.code])
    expect(query.get('q')).toBe('Shielded Metal Arc Welding')
  })

  it('says when the answers changed after the result', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    await screen.findByRole('heading', { name: /focused training/ })

    act(() => useFinderStore.getState().answer(welding.code, 4, 'confident'))

    expect(
      await screen.findByText(/You’ve changed your answers since this result/),
    ).toBeInTheDocument()
  })

  it('sends a later step back to Your goal when there’s no goal yet', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const { router } = renderApp('/find/pathway')

    await screen.findByRole('heading', { level: 2, name: 'What would you like to achieve?' })
    expect(router.state.location.pathname).toBe('/find')
  })

  it('keeps the goal when the matches can’t be loaded, and Try again asks again', async () => {
    serveFinderCatalog()
    serveFinderApi({ failMatches: 1 })
    const user = userEvent.setup()
    await openFinder()
    await user.click(await screen.findByRole('button', { name: 'Become a welder' }))
    await user.click(screen.getByRole('button', { name: 'Get recommendation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now.",
    )
    expect(screen.getByText(GOAL)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('article', { name: welding.name })).toBeInTheDocument()
  })

  it('picks up where the learner was after a refresh', async () => {
    serveFinderCatalog()
    serveFinderApi()
    window.sessionStorage.setItem(
      FINDER_KEY,
      JSON.stringify({
        state: {
          goal: GOAL,
          journey: {
            query: GOAL,
            profile: { intent: 'unknown', experience_years: 2, has_certification: false },
            sessionId: null,
            sessionOwner: null,
            synced: null,
          },
          experience: null,
          certification: null,
          selected: welding.code,
          answers: { [welding.code]: { 3: 'some_experience' } },
          parts: { [welding.code]: 1 },
          checks: {},
        },
        version: 2,
      }),
    )
    await useFinderStore.persist.rehydrate()

    await openFinder('/find/readiness')

    expect(await screen.findByText('Part 2 of 3 · Common skills')).toBeInTheDocument()
    expect(screen.getByText('1 of 4 skills rated')).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: 'I have some experience', checked: true }),
    ).toBeInTheDocument()
  })
})

describe('Find my pathway, signed in', () => {
  it('retries a failed goal with its receipt and changes the receipt for a new goal', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    serveFinderCatalog()
    serveFinderApi()
    const bodies: { query: string; request_id: string }[] = []
    server.use(
      http.post('*/api/v1/me/recommendations', async ({ request }) => {
        bodies.push((await request.json()) as { query: string; request_id: string })
        return bodies.length < 3
          ? HttpResponse.error()
          : HttpResponse.json({ id: 'session-1', profile: welderProfile }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    await openFinder()
    await screen.findByText('Your results are saved to My Progress.')
    await user.click(screen.getByRole('button', { name: 'Become a welder' }))
    const send = () => user.click(screen.getByRole('button', { name: 'Get recommendation' }))

    await send()
    await screen.findByText(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
    await send()
    await waitFor(() => expect(bodies).toHaveLength(2))
    await screen.findByRole('button', { name: 'Get recommendation' })
    expect(bodies[1].request_id).toBe(bodies[0].request_id)
    expect(bodies[0].request_id).toMatch(/^[0-9a-f-]{36}$/i)

    await user.click(screen.getByRole('button', { name: 'Work in a hotel' }))
    await send()
    await screen.findByRole('article', { name: welding.name })
    expect(bodies[2].request_id).not.toBe(bodies[0].request_id)
  })

  it('saves the goal as a session, keeps its answers and choice in step, and saves the check with it', async () => {
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await openFinder()
    await screen.findByText('Your results are saved to My Progress.')

    await user.click(await screen.findByRole('button', { name: 'Become a welder' }))
    await user.click(screen.getByRole('button', { name: 'Get recommendation' }))
    await screen.findByRole('article', { name: welding.name })

    expect(sent(api.requests, 'POST', '/api/v1/me/recommendations')[0].body).toEqual({
      query: GOAL,
      request_id: expect.any(String),
    })
    expect(sent(api.requests, 'POST', '/api/v1/analysis/goal')).toEqual([])
    expect(screen.getByText('Saved to My Progress')).toBeInTheDocument()

    await choose(user, /Do you already have welding experience/, 'More than 3 years')
    await waitFor(() =>
      expect(
        sent(api.requests, 'PATCH', '/api/v1/me/recommendations/session-1').at(-1)?.body,
      ).toEqual({
        experience_years: 4,
        has_certification: null,
        qualification_code: welding.code,
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    await screen.findByRole('heading', { name: /focused training/ })

    expect(sent(api.requests, 'POST', '/api/v1/me/readiness-checks')[0].body).toMatchObject({
      qualification_code: welding.code,
      recommendation_session_id: 'session-1',
      request_id: expect.any(String),
    })
    expect(sent(api.requests, 'POST', '/api/v1/analysis/readiness')).toEqual([])
    // Every write carried the header that cookie sign-in requires.
    expect(account.requests.every((request) => request.requestedWith === 'XMLHttpRequest')).toBe(
      true,
    )
  })

  it('saves a guest’s journey after they sign in, once', async () => {
    serveAccountApi()
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)
    await choose(user, /Do you already have welding experience/, '1–3 years')
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    await screen.findByRole('heading', { name: /focused training/ })

    await user.click(screen.getByRole('button', { name: 'Save to profile' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText(
        'Saved to My Progress: your goal, your answers and your readiness check.',
      ),
    ).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/me/recommendations')).toHaveLength(1)
    expect(sent(api.requests, 'PATCH', '/api/v1/me/recommendations/session-1')[0].body).toEqual({
      experience_years: 2,
      has_certification: null,
      qualification_code: welding.code,
    })
    expect(sent(api.requests, 'POST', '/api/v1/me/readiness-checks')[0].body).toEqual({
      qualification_code: welding.code,
      answers: { 1: 'confident', 2: 'confident', 3: 'confident', 4: 'not_familiar' },
      recommendation_session_id: 'session-1',
      request_id: expect.any(String),
    })
    expect(await screen.findByText('Saved to My Progress')).toBeInTheDocument()
    // The journey is the learner's own now: the same work isn't sent again.
    expect(screen.queryByRole('button', { name: 'Save to profile' })).not.toBeInTheDocument()
  })

  it('asks a guest to sign in to follow a pathway, then follows it', async () => {
    serveAccountApi()
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))

    await user.click(await screen.findByRole('button', { name: 'Follow this pathway' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(sent(api.requests, 'POST', '/api/v1/me/pathways')).toEqual([])
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText('Added to My Progress. Tick off each step as you complete it.'),
    ).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/me/pathways')[0].body).toEqual({ pathway_id: 7 })

    await user.click(screen.getByRole('button', { name: 'Follow this pathway' }))
    expect(
      await screen.findByText('You’re already following this pathway. Find it under My Progress.'),
    ).toBeInTheDocument()
  })
})
