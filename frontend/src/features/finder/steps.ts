import type { PageKey } from '../../lib/navigation.ts'
import { paths } from '../../paths.ts'

// The finder's four steps, in order: each has its own address and its own page in en.pages.

export const STEP_PAGES: readonly PageKey[] = [
  'finderGoal',
  'finderMatches',
  'finderReadiness',
  'finderPathway',
]

export const STEP_PATHS: readonly string[] = [
  paths.finder,
  paths.finderMatches,
  paths.finderReadiness,
  paths.finderPathway,
]

export const GOAL = 0
export const MATCHES = 1
export const READINESS = 2
export const PATHWAY = 3
