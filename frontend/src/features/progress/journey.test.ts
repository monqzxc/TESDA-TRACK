import { describe, expect, it } from 'vitest'
import type { Application, Enrollment, ReadinessCheck, RecommendationSession } from './api.ts'
import { checkedQualifications, checksFor, compareChecks, nextStep } from './journey.ts'

const welding = {
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  sector: 'Metals',
}
const cookery = { code: 'CKY-NCII', name: 'Cookery NC II', sector: 'Tourism' }
const CATALOG = new Set([welding.code, cookery.code])

function session(id: string, at: string, selected: typeof welding | null): RecommendationSession {
  return {
    id,
    goal_id: null,
    query: `Goal ${id}`,
    analysis_source: 'rules',
    profile: { intent: 'unknown' },
    matches: [],
    selected_qualification: selected,
    pathway: null,
    created_at: at,
    updated_at: at,
  }
}

function check(
  id: string,
  qualification: typeof welding,
  at: string,
  score: number,
  answers: Record<string, 'confident' | 'not_familiar'> = { 1: 'confident' },
  sessionId: string | null = null,
): ReadinessCheck {
  return {
    id,
    qualification,
    score,
    level: 'Moderate readiness',
    strengths: [],
    skill_gaps: [],
    recommendation: '',
    answers,
    recommendation_session_id: sessionId,
    created_at: at,
  }
}

function enrollment(
  id: string,
  done: boolean[],
  status: Enrollment['status'] = 'active',
): Enrollment {
  return {
    id,
    pathway: {
      id: 1,
      qualification: welding,
      route: 'SKILL_GAP_CHECK',
      title: 'Close your skill gaps',
      description: '',
      steps: [],
    },
    status,
    completion_percent: 0,
    steps: done.map((completed, i) => ({
      id: i + 1,
      position: i + 1,
      kind: 'other',
      title: `Step ${i + 1}`,
      description: '',
      status: completed ? 'completed' : 'not_started',
    })),
    completed_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  }
}

const application = (status: Application['status']) =>
  ({
    id: 'app-1',
    status,
    created_at: '2026-10-02T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
  }) as Application

describe('nextStep', () => {
  it('sends a learner with no records to the finder', () => {
    expect(nextStep([], [], [], [], CATALOG)).toEqual({ kind: 'start' })
  })

  it('offers a pathway with steps left first, never a completed one', () => {
    const open = enrollment('e-open', [true, false])
    const done = enrollment('e-done', [true, true], 'completed')
    expect(nextStep([], [], [done, open], [application('pending')], CATALOG)).toMatchObject({
      kind: 'pathway',
      enrollment: { id: 'e-open' },
    })
    expect(nextStep([], [], [done], [], CATALOG)).toEqual({ kind: 'start' })
  })

  it('then an application the center hasn’t decided on', () => {
    expect(nextStep([], [], [], [application('approved')], CATALOG)).toMatchObject({
      kind: 'application',
    })
    expect(nextStep([], [], [], [application('rejected')], CATALOG)).toEqual({ kind: 'start' })
  })

  it('then a readiness check for the latest recommendation’s qualification', () => {
    const older = session('s-old', '2026-10-01T00:00:00Z', cookery)
    const latest = session('s-new', '2026-10-05T00:00:00Z', welding)
    expect(nextStep([older, latest], [], [], [], CATALOG)).toMatchObject({
      kind: 'readiness',
      code: welding.code,
      session: { id: 's-new' },
    })
  })

  it('doesn’t count a check saved with another recommendation (US-10)', () => {
    const latest = session('s-new', '2026-10-05T00:00:00Z', welding)
    const elsewhere = check('c-1', welding, '2026-10-03T00:00:00Z', 50, undefined, 's-other')
    expect(nextStep([latest], [elsewhere], [], [], CATALOG).kind).toBe('readiness')
    const here = check('c-2', welding, '2026-10-06T00:00:00Z', 50, undefined, 's-new')
    expect(nextStep([latest], [here], [], [], CATALOG)).toMatchObject({ kind: 'resume' })
  })

  it('resumes a recommendation whose qualification the catalog no longer has', () => {
    const gone = session('s-gone', '2026-10-05T00:00:00Z', {
      code: 'GONE-NCII',
      name: 'Gone NC II',
      sector: 'Old',
    })
    expect(nextStep([gone], [], [], [], CATALOG)).toMatchObject({ kind: 'resume' })
  })
})

describe('readiness over time (US-11)', () => {
  const checks = [
    check('c-3', welding, '2026-10-09T00:00:00Z', 75),
    check('c-1', welding, '2026-10-01T00:00:00Z', 50),
    check('c-2', cookery, '2026-10-05T00:00:00Z', 30),
  ]

  it('lists the qualifications checked, the most recent first', () => {
    expect(checkedQualifications(checks).map((q) => q.code)).toEqual([welding.code, cookery.code])
  })

  it('keeps one qualification’s checks, oldest first', () => {
    expect(checksFor(checks, welding.code).map((c) => c.id)).toEqual(['c-1', 'c-3'])
  })

  it('compares two checks, and says when they asked about different skills', () => {
    const [first, second] = checksFor(checks, welding.code)
    expect(compareChecks(first, second)).toEqual({ points: 25, sameQuestions: true })
    const other = check('c-4', welding, '2026-10-10T00:00:00Z', 60, {
      1: 'confident',
      2: 'not_familiar',
    })
    expect(compareChecks(second, other)).toEqual({ points: -15, sameQuestions: false })
  })
})
