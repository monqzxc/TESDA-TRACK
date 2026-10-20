import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

// The administrator reports. Their query keys start with 'admin', so signing out (or another account signing in)
// removes them all (auth/session.ts accountQueryKeys). A new period keeps the last figures on screen while the next
// ones load.

export type Overview = components['schemas']['Overview']
export type Funnel = components['schemas']['Funnel']
export type QualificationDemand = components['schemas']['QualificationDemand']
export type CompetencyGap = components['schemas']['CompetencyGap']
export type RegionSupply = components['schemas']['RegionSupply']
export type FeedbackSummary = components['schemas']['FeedbackSummary']
export type FeedbackCount = components['schemas']['FeedbackCount']
export type MatchingReport = components['schemas']['MatchingReport']

/** Inclusive dates (YYYY-MM-DD) in Philippine time; null leaves that end open. */
export interface Period {
  from: string | null
  to: string | null
}

const dates = ({ from, to }: Period) => ({
  ...(from ? { date_from: from } : {}),
  ...(to ? { date_to: to } : {}),
})

export const overviewQuery = (period: Period) =>
  queryOptions<Overview, ApiError>({
    queryKey: ['admin', 'reports', 'overview', period.from, period.to],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/reports/overview', { params: { query: dates(period) }, signal }),
      ),
    placeholderData: keepPreviousData,
  })

export const funnelQuery = (period: Period) =>
  queryOptions<Funnel, ApiError>({
    queryKey: ['admin', 'reports', 'funnel', period.from, period.to],
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/v1/admin/reports/funnel', { params: { query: dates(period) }, signal })),
    placeholderData: keepPreviousData,
  })

export const demandQuery = (period: Period) =>
  queryOptions<QualificationDemand[], ApiError>({
    queryKey: ['admin', 'reports', 'qualification-demand', period.from, period.to],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/reports/qualification-demand', {
          params: { query: dates(period) },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  })

export const skillGapsQuery = (code: string, period: Period) =>
  queryOptions<CompetencyGap[], ApiError>({
    queryKey: ['admin', 'reports', 'skill-gaps', code, period.from, period.to],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/reports/skill-gaps', {
          params: { query: { qualification_code: code, ...dates(period) } },
          signal,
        }),
      ),
    // The last rows stay on screen for a new period, but never under another qualification's name.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === code ? previous : undefined,
  })

export const feedbackQuery = (period: Period) =>
  queryOptions<FeedbackSummary, ApiError>({
    queryKey: ['admin', 'reports', 'feedback', period.from, period.to],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/reports/feedback', { params: { query: dates(period) }, signal }),
      ),
    placeholderData: keepPreviousData,
  })

export const matchingQuery = (period: Period) =>
  queryOptions<MatchingReport, ApiError>({
    queryKey: ['admin', 'reports', 'matching', period.from, period.to],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/reports/matching', { params: { query: dates(period) }, signal }),
      ),
    placeholderData: keepPreviousData,
  })

/** Supply is what is listed now, whatever the period. */
export const supplyQuery = queryOptions<RegionSupply[], ApiError>({
  queryKey: ['admin', 'reports', 'supply'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/reports/supply', { signal })),
})

/** How much a qualification was looked at: matches, choices, checks and applications together. */
export function activity(row: QualificationDemand): number {
  return row.top_match + row.chosen + row.readiness_checks + row.assessment_applications
}

/** The qualifications with any activity, busiest first, then by name. */
export function activeDemand(rows: readonly QualificationDemand[]): QualificationDemand[] {
  return rows
    .filter((row) => activity(row) > 0 || row.certified > 0)
    .sort(
      (a, b) =>
        activity(b) - activity(a) ||
        b.certified - a.certified ||
        a.qualification.name.localeCompare(b.qualification.name),
    )
}

// From 2000 on: a date box holds 0002-10-01 while its year is typed, which isn't a period anyone means.
const DATE = /^2\d{3}-\d{2}-\d{2}$/

/** A YYYY-MM-DD date from 2000 on, or null for anything else (an impossible day included). */
export function readDate(value: string | null): string | null {
  if (!value || !DATE.test(value)) return null
  const day = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value) ? value : null
}

/** Whether the period's end comes before its start, which the API refuses. */
export function isBackwards({ from, to }: Period): boolean {
  return from !== null && to !== null && to < from
}
