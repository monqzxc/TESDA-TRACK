import type { Application, Enrollment, ReadinessCheck, RecommendationSession } from './api.ts'

// The learner's next useful step, and their readiness over time (US-10, US-11). Plain functions over the records.

export type Continuation =
  | { kind: 'pathway'; enrollment: Enrollment }
  | { kind: 'application'; application: Application }
  | { kind: 'readiness'; session: RecommendationSession; code: string; name: string }
  | { kind: 'resume'; session: RecommendationSession }
  | { kind: 'start' }

const newest = <T extends { updated_at?: string; created_at: string }>(a: T, b: T) =>
  (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at)

/** The qualification a saved recommendation is about: the one chosen, or else its top match. */
export function sessionQualification(session: RecommendationSession) {
  return session.selected_qualification ?? session.matches[0]?.qualification ?? null
}

/**
 * The one next step to offer (US-10), in this order:
 *
 * 1. A pathway being followed that still has steps to do.
 * 2. An assessment application the center hasn't decided on yet.
 * 3. The latest recommendation, when its qualification (one the catalog still has) has no readiness check saved with
 *    it: a check saved with another recommendation isn't counted.
 * 4. The latest recommendation, to pick up where the learner left off.
 * 5. With no records, the finder.
 *
 * Completed pathways are achievements, not tasks: they're never offered.
 */
export function nextStep(
  sessions: readonly RecommendationSession[],
  checks: readonly ReadinessCheck[],
  enrollments: readonly Enrollment[],
  applications: readonly Application[],
  catalog: ReadonlySet<string>,
): Continuation {
  const pathway = enrollments
    .filter(
      (enrollment) =>
        enrollment.status === 'active' &&
        enrollment.steps.some((step) => step.status !== 'completed'),
    )
    .sort(newest)[0]
  if (pathway) return { kind: 'pathway', enrollment: pathway }

  const application = applications
    .filter((item) => item.status === 'pending' || item.status === 'approved')
    .sort(newest)[0]
  if (application) return { kind: 'application', application }

  const latest = [...sessions].sort(newest)[0]
  if (!latest) return { kind: 'start' }
  const qualification = sessionQualification(latest)
  if (qualification && catalog.has(qualification.code)) {
    const checked = checks.some(
      (check) =>
        check.recommendation_session_id === latest.id &&
        check.qualification.code === qualification.code,
    )
    if (!checked) {
      return {
        kind: 'readiness',
        session: latest,
        code: qualification.code,
        name: qualification.name,
      }
    }
  }
  return { kind: 'resume', session: latest }
}

export interface CheckedQualification {
  code: string
  name: string
}

/** The qualifications the learner has checked their readiness for, the most recently checked first. */
export function checkedQualifications(checks: readonly ReadinessCheck[]): CheckedQualification[] {
  const seen = new Map<string, CheckedQualification>()
  for (const check of [...checks].sort(newest)) {
    if (!seen.has(check.qualification.code)) seen.set(check.qualification.code, check.qualification)
  }
  return [...seen.values()]
}

/** One qualification's checks, oldest first (US-11). */
export function checksFor(checks: readonly ReadinessCheck[], code: string): ReadinessCheck[] {
  return checks
    .filter((check) => check.qualification.code === code)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export interface Comparison {
  /** Whole points, the later check's score less the earlier one's. */
  points: number
  /** Both checks rated the same competencies, so their scores compare like for like (US-11). */
  sameQuestions: boolean
}

export function compareChecks(earlier: ReadinessCheck, later: ReadinessCheck): Comparison {
  const asked = (check: ReadinessCheck) => Object.keys(check.answers).sort().join(',')
  return {
    points: Math.round(later.score - earlier.score),
    sameQuestions: asked(earlier) === asked(later),
  }
}
