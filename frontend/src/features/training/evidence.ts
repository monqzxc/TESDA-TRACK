import type { Program, Schedule } from './centers.ts'

type Service = Program | Schedule

const time = (value: string | null | undefined) => (value ? Date.parse(value) : Number.NaN)

/** Recheck expiry when cached listings are displayed. Missing evidence stays unconfirmed. */
export function verificationStatus(service: Service, now = Date.now()): string {
  const evidence = service.verification
  if (!evidence || evidence.is_synthetic) return 'unknown'
  if (evidence.status !== 'verified') return evidence.status ?? 'unknown'
  if (
    !evidence.source_name ||
    !evidence.source_reference ||
    !(time(evidence.reviewed_at) <= now) ||
    !Number.isFinite(time(evidence.review_due_at)) ||
    (evidence.valid_from && !(time(evidence.valid_from) <= now))
  )
    return 'unknown'
  if (
    time(evidence.review_due_at) <= now ||
    (evidence.valid_until && !(time(evidence.valid_until) > now))
  )
    return 'expired'
  return 'verified'
}

export function availabilityStatus(service: Service, now = Date.now()): string {
  const evidence = service.availability
  if (
    !evidence?.source_reference ||
    !(time(evidence.checked_at) <= now) ||
    !(time(evidence.valid_until) > now)
  )
    return 'unknown'
  return evidence.status ?? 'unknown'
}

function authorizationCoversSchedule(schedule: Schedule): boolean {
  const evidence = schedule.verification
  const scheduled = time(schedule.scheduled_at)
  return Boolean(
    evidence &&
    Number.isFinite(scheduled) &&
    (!evidence.valid_from || time(evidence.valid_from) <= scheduled) &&
    (!evidence.valid_until || time(evidence.valid_until) > scheduled),
  )
}

/** Public service checks only; the API checks the learner's verified certificates at submission. */
export function canReviewApplication(schedule: Schedule, now = Date.now()): boolean {
  return (
    schedule.status === 'open' &&
    schedule.seats_left > 0 &&
    time(schedule.scheduled_at) > now &&
    verificationStatus(schedule, now) === 'verified' &&
    availabilityStatus(schedule, now) === 'available' &&
    schedule.verification?.requirements_reviewed === true &&
    !(schedule.verification.requirements ?? []).some((rule) => rule.kind === 'manual_review') &&
    authorizationCoversSchedule(schedule)
  )
}

/** Evidence and prerequisites are shown as text, including for unranked catalog listings. */
export function evidenceMessages(service: Service, now = Date.now()): string[] {
  const evidence = service.verification
  const status = verificationStatus(service, now)
  const labels: Record<string, string> = {
    verified: 'Service verified for this qualification',
    expired: 'Service verification expired',
    unavailable: 'Service unavailable',
    unknown: 'Service requires verification',
  }
  const messages = [
    evidence?.is_synthetic
      ? 'Demonstration record — not a verified service'
      : (labels[status] ?? labels.unknown),
  ]
  if (evidence?.source_name) messages.push(`Source: ${evidence.source_name}`)
  if ('scheduled_at' in service && !authorizationCoversSchedule(service)) {
    messages.push('Service authorization does not cover the scheduled assessment date')
  }
  const available = availabilityStatus(service, now)
  if (available !== 'available') {
    messages.push(
      available === 'unavailable'
        ? 'Intake unavailable'
        : 'Intake availability requires confirmation',
    )
  }
  if (!evidence?.requirements_reviewed)
    messages.push('Mandatory prerequisites require verification')
  for (const rule of evidence?.requirements ?? []) {
    messages.push(`Prerequisite: ${rule.description}`)
    if (rule.kind === 'manual_review')
      messages.push('This prerequisite requires manual verification before applying')
  }
  if ((evidence?.requirements ?? []).some((rule) => rule.kind === 'verified_certification')) {
    messages.push('Your verified certificates will be checked when you apply')
  }
  return [...new Set(messages)]
}
