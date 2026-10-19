import { http, HttpResponse } from 'msw'
import type { Qualification } from '../api/queries.ts'
import type { components } from '../api/schema.d.ts'
import { server } from './server.ts'

// The finder's routes, answered as the API does, for tests of Find my pathway.

type Profile = components['schemas']['Profile']
type Match = components['schemas']['Match']

export const welding: Qualification = {
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  sector: 'Metals and Engineering',
  possible_jobs: ['Welder', 'Fabricator'],
  competencies: [
    { id: 1, position: 1, name: 'Participate in workplace communication', category: 'Basic' },
    { id: 2, position: 2, name: 'Work in a team environment', category: 'Basic' },
    { id: 3, position: 3, name: 'Apply safety practices', category: 'Common' },
    { id: 4, position: 4, name: 'Weld carbon steel plates', category: 'Core' },
  ],
}

export const cookery: Qualification = {
  code: 'CKY-NCII',
  name: 'Cookery NC II',
  sector: 'Tourism',
  possible_jobs: ['Cook'],
  competencies: [{ id: 9, position: 1, name: 'Prepare stocks', category: 'Core' }],
}

/** What the API reads from "I want to be a welder.": no experience or certification said. */
export const welderProfile: Profile = {
  career_goal: 'Welder',
  possible_sector: 'Metals and Engineering',
  existing_skills: ['welding'],
  experience_years: null,
  has_certification: null,
  intent: 'training_recommendation',
}

const summary = ({ code, name, sector }: Qualification) => ({ code, name, sector })

export const weldingMatch: Match = {
  qualification: summary(welding),
  score: 76,
  reason: 'Matched your words: welder',
}

export interface FinderRequest {
  method: string
  path: string
  body: unknown
}

interface FinderApiOptions {
  matches?: Match[]
  /** Fail the matches request this many times first. */
  failMatches?: number
}

/** The finder's routes, with every request recorded in `requests` (bodies parsed). */
export function serveFinderApi({
  matches = [weldingMatch],
  failMatches = 0,
}: FinderApiOptions = {}) {
  const state = {
    requests: [] as FinderRequest[],
    matchFailures: failMatches,
    followed: new Set<number>(),
  }
  const record = async (request: Request) => {
    const text = request.method === 'GET' ? '' : await request.clone().text()
    state.requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    })
  }
  const session = (query: string, profile: Profile) => ({
    id: 'session-1',
    goal_id: null,
    query,
    analysis_source: 'rules',
    profile,
    matches: [],
    selected_qualification: null,
    pathway: null,
    created_at: '2026-10-15T01:00:00Z',
    updated_at: '2026-10-15T01:00:00Z',
  })
  const readiness = (body: { qualification_code: string; answers: Record<string, string> }) => {
    const qualification = [welding, cookery].find((q) => q.code === body.qualification_code)!
    const confident = qualification.competencies.filter(
      (competency) => body.answers[competency.id] === 'confident',
    )
    const score = Math.round((100 * confident.length) / qualification.competencies.length)
    const level =
      score >= 80 ? 'High readiness' : score >= 50 ? 'Moderate readiness' : 'Low readiness'
    return {
      score,
      level,
      strengths: confident.map((competency) => competency.name),
      skill_gaps: qualification.competencies
        .filter((competency) => !confident.includes(competency))
        .map((competency) => competency.name),
      recommendation: 'Train on the skills you marked as gaps.',
    }
  }

  server.use(
    http.post('*/api/v1/analysis/goal', async ({ request }) => {
      await record(request)
      return HttpResponse.json({ profile: welderProfile, source: 'rules' })
    }),
    http.post('*/api/v1/me/recommendations', async ({ request }) => {
      await record(request)
      const { query } = (await request.json()) as { query: string }
      return HttpResponse.json(session(query, welderProfile), { status: 201 })
    }),
    http.patch('*/api/v1/me/recommendations/:id', async ({ request }) => {
      await record(request)
      return HttpResponse.json(session('I want to be a welder.', welderProfile))
    }),
    http.post('*/api/v1/analysis/matches', async ({ request }) => {
      await record(request)
      if (state.matchFailures > 0) {
        state.matchFailures--
        return HttpResponse.error()
      }
      const { profile } = (await request.json()) as { profile: Profile }
      return HttpResponse.json({ profile, matches })
    }),
    http.post('*/api/v1/analysis/pathway', async ({ request }) => {
      await record(request)
      return HttpResponse.json({
        recommendation: 'SKILL_GAP_CHECK',
        reason: 'Your experience makes a competency check useful first.',
        next_step: 'Check your skills.',
        pathway: null,
      })
    }),
    http.post('*/api/v1/analysis/readiness', async ({ request }) => {
      await record(request)
      return HttpResponse.json(readiness((await request.json()) as never))
    }),
    http.post('*/api/v1/me/readiness-checks', async ({ request }) => {
      await record(request)
      const body = (await request.json()) as {
        qualification_code: string
        answers: Record<string, string>
        recommendation_session_id: string | null
      }
      const qualification = [welding, cookery].find((q) => q.code === body.qualification_code)!
      return HttpResponse.json(
        {
          ...readiness(body),
          id: 'check-1',
          qualification: summary(qualification),
          answers: body.answers,
          recommendation_session_id: body.recommendation_session_id,
          created_at: '2026-10-15T01:00:00Z',
        },
        { status: 201 },
      )
    }),
    http.get('*/api/v1/pathways', async ({ request }) => {
      await record(request)
      const url = new URL(request.url)
      const code = url.searchParams.get('qualification_code')
      const qualification = [welding, cookery].find((q) => q.code === code)!
      return HttpResponse.json([
        {
          id: 7,
          qualification: summary(qualification),
          route: url.searchParams.get('route'),
          title: 'Close your skill gaps',
          description: 'Train only on the competencies you still need.',
          steps: [
            {
              id: 1,
              position: 1,
              kind: 'self_check',
              title: 'Complete the readiness check',
              description: '',
            },
            {
              id: 2,
              position: 2,
              kind: 'training',
              title: 'Take focused training',
              description: '',
            },
          ],
        },
      ])
    }),
    http.post('*/api/v1/me/pathways', async ({ request }) => {
      await record(request)
      const { pathway_id } = (await request.json()) as { pathway_id: number }
      if (state.followed.has(pathway_id)) {
        return HttpResponse.json({ detail: 'Already following.' }, { status: 409 })
      }
      state.followed.add(pathway_id)
      return HttpResponse.json({}, { status: 201 })
    }),
  )
  return state
}

/** The catalog every page but Home loads, with the finder's qualifications. */
export function serveFinderCatalog(qualifications: Qualification[] = [welding, cookery]) {
  server.use(http.get('*/api/v1/qualifications', () => HttpResponse.json(qualifications)))
}
