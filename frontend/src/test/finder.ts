import { http, HttpResponse } from 'msw'
import type { Qualification } from '../api/queries.ts'
import type { components } from '../api/schema.d.ts'
import { server } from './server.ts'

// The finder's routes, answered as the API does, for tests of Find my pathway.

type Profile = components['schemas']['Profile']
type Match = components['schemas']['Match']
type Report = components['schemas']['PathwayReport']
type ReportBody = components['schemas']['PathwayReportRequest']

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

/**
 * A pathway report as the API writes one, from the request: the units not rated confident are the gaps, and a
 * region brings one training option. Only what the tests read is filled in with care.
 */
export function reportFor(body: ReportBody): Report {
  const qualification = [welding, cookery].find((q) => q.code === body.qualification_code)!
  const answer = (id: number) => body.answers?.[id] ?? 'not_answered'
  const gaps = qualification.competencies.filter((c) =>
    ['not_familiar', 'some_experience'].includes(answer(c.id)),
  )
  const advice: Report['skills_to_improve'] = gaps.map((c) => {
    const learn = answer(c.id) === 'not_familiar'
    return {
      competency_id: c.id,
      name: c.name,
      category: c.category,
      status: answer(c.id),
      priority: learn && c.category === 'Core' ? 'high' : 'medium',
      action: learn ? 'learn' : 'practice',
      basis: learn ? 'required_unit' : 'reported_gap',
      must_learn: learn,
      what_to_do: `Learn to ${c.name.toLowerCase()}.`,
      why_it_matters: `It's a ${c.category.toLowerCase()} unit of ${qualification.name}.`,
      activities: ['Learn it in a training program with supervised, hands-on practice.'],
      relevance: `Part of what the ${qualification.name} assessment covers.`,
      evidence: ['You answered “I am not familiar with this”.'],
    }
  })
  const providers: Report['providers'] = body.region_code
    ? [
        {
          kind: 'training',
          service_id: 1,
          site_id: 1,
          name: 'Manila Welding Institute',
          title: 'SMAW NC II Batch 1',
          city: 'Manila',
          region_code: 'NCR',
          distance_km: 2,
          starts_on: '2026-11-10',
          cost: '8500.00',
          duration_hours: 268,
          delivery_mode: 'institution_based',
          scholarship_available: false,
          seats_left: null,
          status: 'confirmed',
          score: 95,
          notes: ['An assessment with open seats is available nearby'],
        },
      ]
    : []
  return {
    policy_version: 'pathway-report-v1',
    generated_at: '2026-10-21T01:00:00Z',
    qualification: {
      ...summary(qualification),
      possible_jobs: qualification.possible_jobs,
      unit_count: qualification.competencies.length,
    },
    match: {
      strength: 'named',
      rank: 1,
      match_count: 1,
      score: 76,
      explanation: 'Your goal’s own words point to this qualification.',
      alternatives: [],
    },
    route: 'SKILL_GAP_CHECK',
    readiness: {
      available: true,
      score: 75,
      level: 'Moderate Readiness',
      counts: { confident: 3, some_experience: 0, not_familiar: 1, not_answered: 0 },
      summary: 'Moderate Readiness (75%): you rated yourself confident in 3 of 4 units.',
      limitations: ['Self-reported: this is not an official competency assessment.'],
    },
    strengths: [],
    training_to_consider: [
      {
        kind: gaps.length ? 'focused_training' : 'direct_assessment',
        title: gaps.length
          ? 'Take focused training on your gaps, then the assessment'
          : 'Ask an assessment center about going straight to assessment',
        recommended: true,
        service_kind: gaps.length ? 'training' : 'assessment',
        reasons: [`You marked ${gaps.length} units as gaps.`],
        qualification: null,
      },
    ],
    skills_to_improve: advice,
    competencies_to_learn_or_practice: advice.filter((item) => item.action === 'learn'),
    reasoning: [
      {
        topic: 'employment',
        summary: 'Use this as general guidance on where the qualification can lead.',
        points: ['TESDA-TRACK has no job-vacancy or labor-market data.'],
      },
    ],
    employment: {
      observed_data: false,
      possible_jobs: qualification.possible_jobs,
      source: 'Training Regulation',
      note: 'TESDA-TRACK has no job-vacancy or labor-market data.',
    },
    considerations: providers.length
      ? [{ topic: 'providers', text: 'The options below come from the rankings.', items: [] }]
      : [
          {
            topic: 'missing_information',
            text: 'Some information is missing, so parts of this report are general:',
            items: ['Your region, to sort options by distance.'],
          },
        ],
    providers,
    region_name: body.region_code ? 'National Capital Region' : null,
    next_steps: [
      {
        position: 1,
        kind: 'compare_providers',
        title: 'Compare training providers',
        detail: 'Compare their schedules, fees and distance.',
        competency_ids: [],
      },
    ],
    final: {
      summary: `Your best next step for ${qualification.name} is focused training on the units you marked as gaps, then the assessment.`,
      next_action: 'Compare training providers: compare their schedules, fees and distance.',
      pathway: 'Take focused training on your gaps, then the assessment',
      focus: [],
      providers: [],
    },
    disclaimer: 'This report is guidance. It doesn’t guarantee certification or employment.',
    rankings: {
      training_audit_id: 1,
      training_policy: 'verified-services-v2',
      assessment_audit_id: 2,
      assessment_policy: 'assessment-center-v1',
    },
  }
}

interface FinderApiOptions {
  matches?: Match[]
  /** Fail the matches request this many times first. */
  failMatches?: number
  /** Fail the feedback answer this many times first. */
  failFeedback?: number
  /** Fail the pathway report this many times first. */
  failReport?: number
}

/** The finder's routes, with every request recorded in `requests` (bodies parsed). */
export function serveFinderApi({
  matches = [weldingMatch],
  failMatches = 0,
  failFeedback = 0,
  failReport = 0,
}: FinderApiOptions = {}) {
  const state = {
    requests: [] as FinderRequest[],
    matchFailures: failMatches,
    feedbackFailures: failFeedback,
    reportFailures: failReport,
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
    http.post('*/api/v1/feedback/recommendations', async ({ request }) => {
      await record(request)
      if (state.feedbackFailures > 0) {
        state.feedbackFailures--
        return HttpResponse.error()
      }
      const { satisfied } = (await request.json()) as { satisfied: boolean }
      return HttpResponse.json({ id: 'feedback-1', satisfied, reason: null }, { status: 201 })
    }),
    http.post('*/api/v1/recommendations/report', async ({ request }) => {
      await record(request)
      if (state.reportFailures > 0) {
        state.reportFailures--
        return HttpResponse.error()
      }
      return HttpResponse.json(reportFor((await request.json()) as ReportBody))
    }),
    http.patch('*/api/v1/feedback/recommendations/:id', async ({ request, params }) => {
      await record(request)
      const { reason } = (await request.json()) as { reason: string }
      return HttpResponse.json({ id: params.id, satisfied: false, reason })
    }),
  )
  return state
}

/** The catalog every page but Home loads, with the finder's qualifications. */
export function serveFinderCatalog(qualifications: Qualification[] = [welding, cookery]) {
  server.use(http.get('*/api/v1/qualifications', () => HttpResponse.json(qualifications)))
}
