import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import type { PathwayRoute } from './rules.ts'
import type { Answers, Profile, ReadinessResult, SessionState } from './store.ts'

// The finder's requests. The goal goes in request bodies only, never in an address (the plan's privacy rules).
// Query keys hold it in memory for the cache; they're never sent anywhere.

export type MatchResult = components['schemas']['MatchResult']
export type Match = MatchResult['matches'][number]
export type PathwayRecommendation = components['schemas']['PathwayRecommendation']
export type CuratedPathway = components['schemas']['PathwayPublic']
export type RecommendationSession = components['schemas']['RecommendationSessionPublic']
export type Feedback = components['schemas']['FeedbackPublic']
export type FeedbackReason = components['schemas']['FeedbackReasonUpdate']['reason']
export type PathwayReport = components['schemas']['PathwayReport']
export type ReportRequest = components['schemas']['PathwayReportRequest']

const MINUTE = 60_000

/** A goal's analysis: the API's reading of it. Signed in, it starts a saved recommendation session. */
export async function analyzeGoal(
  query: string,
  requestId: string | null,
): Promise<{ profile: Profile; sessionId: string | null }> {
  if (requestId) {
    const session = await startSession(query, requestId)
    return { profile: session.profile, sessionId: session.id }
  }
  const analysis = await unwrap(api.POST('/api/v1/analysis/goal', { body: { query } }))
  return { profile: analysis.profile, sessionId: null }
}

/**
 * The qualifications that match a goal, given the profile with the learner's answers. The API re-reads the intent
 * from the answers. The same goal and answers get the same matches, so they're kept for the visit.
 */
export const matchesQuery = (query: string, profile: Profile) =>
  queryOptions<MatchResult, ApiError>({
    queryKey: ['finder', 'matches', query, profile],
    queryFn: ({ signal }) =>
      unwrap(api.POST('/api/v1/analysis/matches', { body: { query, profile }, signal })),
    staleTime: Infinity,
    gcTime: 30 * MINUTE,
  })

/** The route the learner's experience suggests for a qualification, and why: "Why we ask". */
export const pathwayQuery = (profile: Profile, code: string) =>
  queryOptions<PathwayRecommendation, ApiError>({
    queryKey: ['finder', 'pathway', code, profile],
    queryFn: ({ signal }) =>
      unwrap(
        api.POST('/api/v1/analysis/pathway', {
          body: { profile, qualification_code: code },
          signal,
        }),
      ),
    staleTime: Infinity,
    gcTime: 30 * MINUTE,
  })

/**
 * The personalized report on the chosen qualification's pathway, worked out by the API from what the recommendation
 * came from (as feedback is) and where to look for options. Signed in, it also reads the learner's own applications
 * and certificates, so whose report it is belongs in the key. The same request gets the same report for the visit.
 */
export const reportQuery = (body: ReportRequest, learnerId: string | null) =>
  queryOptions<PathwayReport, ApiError>({
    queryKey: ['finder', 'report', learnerId, body],
    queryFn: ({ signal }) => unwrap(api.POST('/api/v1/recommendations/report', { body, signal })),
    staleTime: Infinity,
    gcTime: 30 * MINUTE,
  })

/** The curated pathways for a qualification on one route. */
export const curatedPathwaysQuery = (code: string, route: PathwayRoute) =>
  queryOptions<CuratedPathway[], ApiError>({
    queryKey: ['pathways', code, route],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/pathways', {
          params: { query: { qualification_code: code, route } },
          signal,
        }),
      ),
    staleTime: 5 * MINUTE,
  })

/**
 * Works out a readiness result from the answers. Signed in, it's saved to the learner's account, with the goal's
 * recommendation session when there is one.
 */
export async function submitReadiness(
  code: string,
  answers: Answers,
  saveTo: { sessionId: string | null; requestId: string } | null,
): Promise<ReadinessResult> {
  if (saveTo) {
    return unwrap(
      api.POST('/api/v1/me/readiness-checks', {
        body: {
          qualification_code: code,
          answers,
          recommendation_session_id: saveTo.sessionId,
          request_id: saveTo.requestId,
        },
      }),
    )
  }
  return unwrap(
    api.POST('/api/v1/analysis/readiness', { body: { qualification_code: code, answers } }),
  )
}

/** Starts a saved recommendation session for a goal analysed while signed out. */
export async function startSession(
  query: string,
  requestId: string,
): Promise<RecommendationSession> {
  return unwrap(api.POST('/api/v1/me/recommendations', { body: { query, request_id: requestId } }))
}

/** Saves the follow-up answers and the chosen qualification to the learner's recommendation session. */
export async function updateSession(sessionId: string, state: SessionState): Promise<void> {
  await unwrap(
    api.PATCH('/api/v1/me/recommendations/{session_id}', {
      params: { path: { session_id: sessionId } },
      body: state,
    }),
  )
}

/** Adds a curated pathway to My Progress. */
export async function followPathway(pathwayId: number): Promise<void> {
  await unwrap(api.POST('/api/v1/me/pathways', { body: { pathway_id: pathwayId } }))
}

/**
 * The learner's answer to "Are you satisfied with this recommendation?", with what the recommendation was worked out
 * from. The API works it out again and keeps the numbers with the answer, not the goal.
 */
export async function sendFeedback(body: {
  query: string
  profile: Profile
  qualification_code: string
  answers: Answers
  satisfied: boolean
}): Promise<Feedback> {
  return unwrap(api.POST('/api/v1/feedback/recommendations', { body }))
}

/** Why the learner answered No. */
export async function explainFeedback(id: string, reason: FeedbackReason): Promise<Feedback> {
  return unwrap(
    api.PATCH('/api/v1/feedback/recommendations/{feedback_id}', {
      params: { path: { feedback_id: id } },
      body: { reason },
    }),
  )
}
