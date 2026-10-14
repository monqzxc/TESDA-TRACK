import { BARISTA_UNITS } from './data.ts'

// The readiness check's scoring, as the API scores it (backend skill_gap_service.py, mirrored in landing.js): each
// unit counts 1 for Confident, 0.5 for Some experience and 0 for New to me, and the score is their average.

export const ANSWERS = ['yes', 'some', 'new'] as const
export type Answer = (typeof ANSWERS)[number]

const VALUES: Record<Answer, number> = { yes: 1, some: 0.5, new: 0 }

export type ReadinessLevel = 'high' | 'moderate' | 'low'

export function isAnswer(value: unknown): value is Answer {
  return ANSWERS.some((answer) => answer === value)
}

/** The score from 0 to 100. */
export function readinessScore(answers: readonly Answer[]): number {
  if (answers.length === 0) return 0
  return (answers.reduce((sum, answer) => sum + VALUES[answer], 0) / answers.length) * 100
}

/** 80 and up is high, 50 to 79 moderate, and below 50 low: the bands that pick the pathway. */
export function readinessLevel(score: number): ReadinessLevel {
  return score >= 80 ? 'high' : score >= 50 ? 'moderate' : 'low'
}

/** The answers Home's readiness check starts with. */
export const STARTING_ANSWERS: readonly Answer[] = BARISTA_UNITS.map((unit) => unit.answer)
