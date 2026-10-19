import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

// The signed-in learner's own records, for My Progress. Their query keys start with 'me', so signing out (or another
// learner signing in) removes them all (auth/session.ts accountQueryKeys).

export type RecommendationSession = components['schemas']['RecommendationSessionPublic']
export type ReadinessCheck = components['schemas']['ReadinessCheckPublic']
export type Enrollment = components['schemas']['EnrollmentPublic']
export type Application = components['schemas']['AssessmentApplicationPublic']
export type Goal = components['schemas']['GoalPublic']
export type Certification = components['schemas']['CertificationPublic']
export type StepStatus = Enrollment['steps'][number]['status']

/** Recommendation sessions shown, as the Streamlit page shows its last ten. */
const SESSIONS_SHOWN = 10

export const progressKeys = {
  sessions: ['me', 'recommendations'] as const,
  checks: ['me', 'readiness-checks'] as const,
  pathways: ['me', 'pathways'] as const,
  applications: ['me', 'applications'] as const,
  goals: ['me', 'goals'] as const,
  certifications: ['me', 'certifications'] as const,
}

export const sessionsQuery = queryOptions<RecommendationSession[], ApiError>({
  queryKey: progressKeys.sessions,
  queryFn: ({ signal }) =>
    unwrap(
      api.GET('/api/v1/me/recommendations', {
        params: { query: { limit: SESSIONS_SHOWN } },
        signal,
      }),
    ),
})

export const checksQuery = queryOptions<ReadinessCheck[], ApiError>({
  queryKey: progressKeys.checks,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/readiness-checks', { signal })),
})

export const pathwaysQuery = queryOptions<Enrollment[], ApiError>({
  queryKey: progressKeys.pathways,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/pathways', { signal })),
})

export const applicationsQuery = queryOptions<Application[], ApiError>({
  queryKey: progressKeys.applications,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/assessment-applications', { signal })),
})

export const goalsQuery = queryOptions<Goal[], ApiError>({
  queryKey: progressKeys.goals,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/goals', { signal })),
})

export const certificationsQuery = queryOptions<Certification[], ApiError>({
  queryKey: progressKeys.certifications,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/certifications', { signal })),
})

export function setStepStatus(
  enrollmentId: string,
  stepId: number,
  status: StepStatus,
): Promise<Enrollment> {
  return unwrap(
    api.PATCH('/api/v1/me/pathways/{enrollment_id}/steps/{step_id}', {
      params: { path: { enrollment_id: enrollmentId, step_id: stepId } },
      body: { status },
    }),
  )
}

export function withdrawApplication(applicationId: string): Promise<Application> {
  return unwrap(
    api.POST('/api/v1/me/assessment-applications/{application_id}/withdraw', {
      params: { path: { application_id: applicationId } },
    }),
  )
}

export function addGoal(title: string, targetCode: string | null): Promise<Goal> {
  return unwrap(
    api.POST('/api/v1/me/goals', {
      body: { title, target_qualification_code: targetCode },
    }),
  )
}

export function achieveGoal(goalId: string): Promise<Goal> {
  return unwrap(
    api.PATCH('/api/v1/me/goals/{goal_id}', {
      params: { path: { goal_id: goalId } },
      body: { status: 'achieved' },
    }),
  )
}

export interface NewCertification {
  title: string
  qualificationCode: string | null
  certificateNumber: string | null
  issuedOn: string | null
}

export function addCertification(certification: NewCertification): Promise<Certification> {
  return unwrap(
    api.POST('/api/v1/me/certifications', {
      body: {
        title: certification.title,
        qualification_code: certification.qualificationCode,
        certificate_number: certification.certificateNumber,
        // The API's own default; the generated type asks for it.
        issuing_body: 'TESDA',
        issued_on: certification.issuedOn,
      },
    }),
  )
}
