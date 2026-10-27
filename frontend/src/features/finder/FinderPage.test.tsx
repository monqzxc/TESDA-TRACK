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
  welderProfile,
  welding,
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

/** Rates every skill of the qualification on screen, part by part. Skill 4 is a gap unless `withGap` is false. */
async function rateAll(user: UserEvent, withGap = true) {
  for (;;) {
    for (const group of screen.getAllByRole('radiogroup', { name: /^\d+\. / })) {
      const gap = withGap && (group.textContent ?? '').startsWith('4.')
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

  it('keeps the typed goal and every readiness answer after a failed check, and retries them', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const attempts: unknown[] = []
    server.use(
      http.post('*/api/v1/analysis/readiness', async ({ request }) => {
        attempts.push(await request.clone().json())
        if (attempts.length === 1) return HttpResponse.error()
      }),
    )
    const user = userEvent.setup()
    const { router } = await openFinder()
    await user.type(
      await screen.findByRole('textbox', { name: 'Or tell us in your own words' }),
      GOAL,
    )
    await user.click(screen.getByRole('button', { name: 'Get recommendation' }))
    await user.click(await screen.findByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    const answers = { ...useFinderStore.getState().answers[welding.code] }
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t complete your readiness check. Your answers are still here.',
    )
    expect(router.state.location.pathname).toBe('/find/readiness')
    expect(screen.getByText(GOAL)).toBeInTheDocument()
    expect(useFinderStore.getState().goal).toBe(GOAL)
    expect(useFinderStore.getState().answers[welding.code]).toEqual(answers)
    expect(
      screen.getByRole('radio', { name: 'I am not familiar with this', checked: true }),
    ).toBeInTheDocument()
    expect(useFinderStore.getState().checks[welding.code]).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    expect(await screen.findByRole('heading', { name: /focused training/ })).toBeInTheDocument()
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toEqual(attempts[0])
    expect(useFinderStore.getState().answers[welding.code]).toEqual(answers)
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

  it('explains a partial guest save and retries only the missing check without losing work', async () => {
    serveAccountApi()
    serveFinderCatalog()
    const api = serveFinderApi()
    const attempts: unknown[] = []
    server.use(
      http.post('*/api/v1/me/readiness-checks', async ({ request }) => {
        attempts.push(await request.clone().json())
        if (attempts.length === 1) return HttpResponse.error()
      }),
    )
    const user = userEvent.setup()
    await submitGoal(user)
    await choose(user, /Do you already have welding experience/, '1–3 years')
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    await screen.findByRole('heading', { name: /focused training/ })
    const answers = { ...useFinderStore.getState().answers[welding.code] }
    const check = useFinderStore.getState().checks[welding.code]

    await user.click(screen.getByRole('button', { name: 'Save to profile' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText(/We saved your goal and your answers, but not the rest\./),
    ).toBeVisible()
    expect(useFinderStore.getState().goal).toBe(GOAL)
    expect(useFinderStore.getState().experience).toBe('1-3')
    expect(useFinderStore.getState().answers[welding.code]).toEqual(answers)
    expect(useFinderStore.getState().checks[welding.code]).toEqual(check)
    expect(useFinderStore.getState().checks[welding.code].saved).toBe(false)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/me/recommendations')).toHaveLength(1)
    const answerSaves = sent(api.requests, 'PATCH', '/api/v1/me/recommendations/session-1').length
    expect(answerSaves).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Try saving again' }))

    expect(
      await screen.findByText(
        'Saved to My Progress: your goal, your answers and your readiness check.',
      ),
    ).toBeVisible()
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toEqual(attempts[0])
    expect(sent(api.requests, 'POST', '/api/v1/me/recommendations')).toHaveLength(1)
    expect(sent(api.requests, 'PATCH', '/api/v1/me/recommendations/session-1')).toHaveLength(
      answerSaves,
    )
    expect(useFinderStore.getState().answers[welding.code]).toEqual(answers)
    expect(useFinderStore.getState().checks[welding.code].saved).toBe(true)
  })

  it('asks a guest to sign in to save a qualification, then shows it as added', async () => {
    serveAccountApi()
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))

    await user.click(await screen.findByRole('button', { name: 'Add to My Progress' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(sent(api.requests, 'POST', '/api/v1/me/pathways')).toEqual([])
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText('Added to My Progress. Tick off each step as you complete it.'),
    ).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/me/pathways')[0].body).toEqual({ pathway_id: 7 })

    const added = screen.getByRole('button', { name: 'Added to My Progress' })
    expect(added).toBeDisabled()
    await user.click(added)
    expect(sent(api.requests, 'POST', '/api/v1/me/pathways')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'View My Progress' })).toHaveAttribute(
      'href',
      '/progress',
    )
  })
})

describe('Find my pathway, feedback', () => {
  const QUESTION = 'Are you satisfied with this recommendation?'

  /** From the welder goal to Your pathway (skill 4 a gap), then the question under the recommendation. */
  async function reachQuestion(user: UserEvent) {
    await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    return screen.findByRole('region', { name: QUESTION })
  }

  it('asks under the recommendation, and sends Yes with what the recommendation came from', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)
    expect(within(question).getByText(/not the words of your goal/)).toBeInTheDocument()

    await user.click(within(question).getByRole('button', { name: 'Yes' }))

    // The button pressed is gone, so focus is on what replaced it.
    expect(await within(question).findByText('Thank you for your answer.')).toHaveFocus()
    expect(within(question).queryByRole('button', { name: 'No' })).not.toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/feedback/recommendations')[0].body).toEqual({
      query: GOAL,
      profile: welderProfile,
      qualification_code: welding.code,
      answers: { 1: 'confident', 2: 'confident', 3: 'confident', 4: 'not_familiar' },
      satisfied: true,
    })
  })

  it('after No, offers an optional reason and sends the one picked', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)

    await user.click(within(question).getByRole('button', { name: 'No' }))

    expect(await within(question).findByText(/What didn’t fit\? This is optional/)).toHaveFocus()
    expect(sent(api.requests, 'POST', '/api/v1/feedback/recommendations')[0].body).toMatchObject({
      satisfied: false,
    })
    const reasons = within(question).getByRole('group', { name: 'What didn’t fit' })
    await user.click(
      within(reasons).getByRole('button', { name: 'The readiness result doesn’t seem right' }),
    )

    expect(
      await within(question).findByText('Thank you. That tells us what to improve.'),
    ).toHaveFocus()
    expect(
      sent(api.requests, 'PATCH', '/api/v1/feedback/recommendations/feedback-1')[0].body,
    ).toEqual({ reason: 'readiness_off' })
  })

  const SHARE = 'Share the words of my goal to improve matching'
  const GOAL_PATH = '/api/v1/feedback/recommendations/feedback-1/goal'

  it('after Yes, shares the goal’s words only once the learner ticks the box', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)
    await user.click(within(question).getByRole('button', { name: 'Yes' }))
    await within(question).findByText('Thank you for your answer.')

    const box = within(question).getByRole('checkbox', { name: new RegExp(SHARE) })
    expect(box).not.toBeChecked()
    expect(within(question).getByText(`“${GOAL}”`)).toBeInTheDocument()
    expect(within(question).getByText(/can run on Google Colab/)).toBeInTheDocument()
    expect(within(question).getByRole('button', { name: 'Share my goal' })).toBeDisabled()

    await user.click(box)
    await user.click(within(question).getByRole('button', { name: 'Share my goal' }))

    expect(await within(question).findByText(/Thank you for sharing your goal/)).toHaveFocus()
    expect(sent(api.requests, 'POST', GOAL_PATH).map((request) => request.body)).toEqual([
      { goal: GOAL, consent: true },
    ])
  })

  it('after the wrong qualification, asks which one was wanted and can share the goal with it', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)
    await user.click(within(question).getByRole('button', { name: 'No' }))
    await user.click(
      await within(question).findByRole('button', {
        name: 'It’s the wrong qualification for my goal',
      }),
    )

    expect(
      await within(question).findByText('Which qualification did you want? This is optional.'),
    ).toHaveFocus()
    expect(within(question).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(question).getByRole('button', { name: 'Send' })).toBeDisabled()
    const picker = within(question).getByRole('combobox', { name: 'Qualification' })
    await user.type(picker, 'cook')
    await user.click(await screen.findByRole('option', { name: cookery.name }))
    await user.click(within(question).getByRole('checkbox', { name: new RegExp(SHARE) }))
    await user.click(within(question).getByRole('button', { name: 'Send' }))

    expect(await within(question).findByText(/Thank you for sharing your goal/)).toHaveFocus()
    const path = '/api/v1/feedback/recommendations/feedback-1'
    expect(sent(api.requests, 'PATCH', path).map((request) => request.body)).toEqual([
      { reason: 'wrong_qualification' },
      { reason: 'wrong_qualification', wanted_qualification_code: cookery.code },
    ])
    expect(sent(api.requests, 'POST', GOAL_PATH).map((request) => request.body)).toEqual([
      { goal: GOAL, consent: true },
    ])
  })

  it('offers only other qualifications, and shares nothing without the box or on Skip', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)
    await user.click(within(question).getByRole('button', { name: 'No' }))
    await user.click(
      await within(question).findByRole('button', {
        name: 'It’s the wrong qualification for my goal',
      }),
    )
    const picker = await within(question).findByRole('combobox', { name: 'Qualification' })
    await user.click(picker)
    expect(await screen.findByRole('option', { name: cookery.name })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: welding.name })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(within(question).getByRole('button', { name: 'Skip' }))

    expect(
      await within(question).findByText('Thank you. That tells us what to improve.'),
    ).toHaveFocus()
    expect(sent(api.requests, 'PATCH', '/api/v1/feedback/recommendations/feedback-1')).toHaveLength(
      1,
    )
    expect(sent(api.requests, 'POST', GOAL_PATH)).toEqual([])
  })

  it('tucks into a button with Hide for now, which brings the question back', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)

    await user.click(within(question).getByRole('button', { name: 'Hide for now' }))

    expect(screen.queryByRole('region', { name: QUESTION })).not.toBeInTheDocument()
    const reopen = screen.getByRole('button', { name: 'Rate this recommendation' })
    expect(reopen).toHaveFocus()
    expect(sent(api.requests, 'POST', '/api/v1/feedback/recommendations')).toEqual([])

    await user.click(reopen)
    const again = screen.getByRole('region', { name: QUESTION })
    expect(again).toHaveFocus()
    expect(within(again).getByRole('button', { name: 'Yes' })).toBeInTheDocument()
  })

  it('closes once answered, and isn’t asked again', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)
    await user.click(within(question).getByRole('button', { name: 'Yes' }))
    await within(question).findByText('Thank you for your answer.')

    await user.click(within(question).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('region', { name: QUESTION })).not.toBeInTheDocument()
    expect(document.getElementById('main')).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Rate this recommendation' }),
    ).not.toBeInTheDocument()
  })

  it('isn’t asked again when the learner comes back to an answered recommendation', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    const question = await reachQuestion(user)
    await user.click(within(question).getByRole('button', { name: 'Yes' }))
    await within(question).findByText('Thank you for your answer.')

    await user.click(screen.getByRole('link', { name: /Back/ }))
    await screen.findByRole('heading', { level: 2, name: 'Readiness check' })
    await user.click(screen.getByRole('link', { name: /Next: Your pathway/ }))
    await screen.findByRole('heading', { level: 2, name: 'Your pathway' })

    expect(screen.queryByRole('region', { name: QUESTION })).not.toBeInTheDocument()
  })

  it('keeps the question when the answer can’t be sent, so the learner can answer again', async () => {
    serveFinderCatalog()
    serveFinderApi({ failFeedback: 1 })
    const user = userEvent.setup()
    const question = await reachQuestion(user)

    await user.click(within(question).getByRole('button', { name: 'Yes' }))

    expect(await within(question).findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now.",
    )
    await user.click(within(question).getByRole('button', { name: 'Yes' }))
    expect(await within(question).findByText('Thank you for your answer.')).toBeInTheDocument()
    expect(within(question).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Find my pathway, report', () => {
  const REPORT = 'Recommendations for you'

  /** From the welder goal to Your pathway, and the report under the verdict. */
  async function reachReport(user: UserEvent, withGap = true) {
    await submitGoal(user)
    await user.click(screen.getByRole('button', { name: 'Check my readiness' }))
    await screen.findByText('Part 1 of 3 · Basic skills')
    await rateAll(user, withGap)
    await user.click(screen.getByRole('button', { name: 'Analyze my skills' }))
    return screen.findByRole('region', { name: REPORT })
  }

  it('reports on the recommendation from the learner’s own answers, section by section', async () => {
    serveFinderCatalog()
    const api = serveFinderApi()
    const user = userEvent.setup()
    const report = await reachReport(user)

    expect(
      await within(report).findByText('Take focused training on your gaps, then the assessment'),
    ).toBeInTheDocument()
    expect(within(report).getByText('Recommended for you')).toBeInTheDocument()
    expect(within(report).getByText('Weld carbon steel plates')).toBeInTheDocument()
    expect(within(report).getByText('High priority')).toBeInTheDocument()
    expect(within(report).getByText('Learn to weld carbon steel plates.')).toBeInTheDocument()
    expect(within(report).getByText('A listed unit you reported not knowing')).toBeInTheDocument()
    for (const name of [
      'Why we recommend these',
      'Other things to consider',
      'Your next steps',
      'Final recommendation',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(
      within(screen.getByRole('region', { name: 'Final recommendation' })).getByText(
        /doesn’t guarantee certification or employment/,
      ),
    ).toBeInTheDocument()
    // Worked out from what the recommendation came from, as feedback is: the goal only in the body.
    expect(sent(api.requests, 'POST', '/api/v1/recommendations/report')[0].body).toEqual({
      query: GOAL,
      profile: welderProfile,
      qualification_code: welding.code,
      answers: { 1: 'confident', 2: 'confident', 3: 'confident', 4: 'not_familiar' },
      region_code: null,
      preferred_delivery_mode: null,
      needs_scholarship: false,
    })
  })

  it('asks again for the region chosen, and shows the options it brings', async () => {
    serveFinderCatalog()
    server.use(
      http.get('*/api/v1/regions', () =>
        HttpResponse.json([
          {
            code: 'NCR',
            name: 'National Capital Region',
            center_city: 'Manila',
            latitude: 14.5995,
            longitude: 120.9842,
          },
        ]),
      ),
    )
    const api = serveFinderApi()
    const user = userEvent.setup()
    await reachReport(user)
    const consider = await screen.findByRole('region', { name: 'Other things to consider' })
    expect(
      within(consider).getByText(
        'No training programs or assessment schedules are listed for this qualification yet.',
      ),
    ).toBeInTheDocument()
    expect(
      within(consider).getByText('Your region, to sort options by distance.'),
    ).toBeInTheDocument()

    await choose(user, /Your region/, 'National Capital Region')
    await user.click(screen.getByRole('checkbox', { name: 'I need a scholarship' }))

    expect(await within(consider).findByText('Manila Welding Institute')).toBeInTheDocument()
    expect(within(consider).getByText(/About 2 km from your region’s center/)).toBeInTheDocument()
    expect(within(consider).getByText('Verified')).toBeInTheDocument()
    expect(sent(api.requests, 'POST', '/api/v1/recommendations/report').at(-1)?.body).toMatchObject(
      { region_code: 'NCR', needs_scholarship: true },
    )
  })

  it('leaves out what it has nothing to say about', async () => {
    serveFinderCatalog()
    serveFinderApi()
    const user = userEvent.setup()
    const report = await reachReport(user, false)

    expect(await within(report).findByText('You didn’t report any skill gaps.')).toBeInTheDocument()
    expect(
      within(report).queryByRole('heading', { name: 'Competencies to learn or practice' }),
    ).not.toBeInTheDocument()
    expect(within(report).queryByText('Also worth considering')).not.toBeInTheDocument()
  })

  it('keeps the rest of the pathway when the report can’t be prepared, and Try again asks again', async () => {
    serveFinderCatalog()
    serveFinderApi({ failReport: 1 })
    const user = userEvent.setup()
    const report = await reachReport(user)

    expect(await within(report).findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now.",
    )
    expect(screen.getByRole('heading', { name: 'Close your skill gaps' })).toBeInTheDocument()

    await user.click(within(report).getByRole('button', { name: 'Try again' }))
    expect(
      await within(report).findByText('Take focused training on your gaps, then the assessment'),
    ).toBeInTheDocument()
  })
})
