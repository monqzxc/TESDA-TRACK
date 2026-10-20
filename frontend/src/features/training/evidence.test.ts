import { describe, expect, it } from 'vitest'
import { weldingAssessment } from '../../test/training.ts'
import { canReviewApplication, evidenceMessages } from './evidence.ts'

const NOW = Date.parse('2026-10-19T00:00:00Z')
const verification = weldingAssessment.verification!
const availability = weldingAssessment.availability!

describe('assessment service evidence', () => {
  it('requires current authority, availability and reviewed prerequisites', () => {
    expect(canReviewApplication(weldingAssessment, NOW)).toBe(true)
    for (const patch of [
      { verification: undefined },
      { availability: undefined },
      { verification: { ...verification, is_synthetic: true } },
      { verification: { ...verification, requirements_reviewed: false } },
      { availability: { ...availability, valid_until: '2026-10-18T00:00:00Z' } },
      {
        verification: { ...verification, review_due_at: '2026-10-18T00:00:00Z' },
      },
      { verification: { ...verification, valid_until: '2099-11-30T00:00:00Z' } },
      { scheduled_at: '2026-10-18T00:00:00Z' },
      { status: 'closed' as const },
      { seats_left: 0 },
    ]) {
      expect(canReviewApplication({ ...weldingAssessment, ...patch }, NOW)).toBe(false)
    }
  })

  it('blocks manual prerequisites and explains them; the API checks learner certificates', () => {
    const prerequisite = {
      kind: 'manual_review' as const,
      description: 'Review previous work experience',
      source_reference: 'test-rule',
    }
    const schedule = {
      ...weldingAssessment,
      verification: { ...verification, requirements: [prerequisite] },
    }
    expect(canReviewApplication(schedule, NOW)).toBe(false)
    expect(evidenceMessages(schedule, NOW)).toContain(
      'Prerequisite: Review previous work experience',
    )
    const withCertificate = {
      ...schedule,
      verification: {
        ...schedule.verification,
        requirements: [
          {
            ...prerequisite,
            kind: 'verified_certification' as const,
            qualification_code: 'SMAW-NCI',
          },
        ],
      },
    }
    expect(canReviewApplication(withCertificate, NOW)).toBe(true)
    expect(evidenceMessages(withCertificate, NOW)).toContain(
      'Your verified certificates will be checked when you apply',
    )
  })
})
