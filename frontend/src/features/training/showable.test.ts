import { describe, expect, it } from 'vitest'
import { cookeryProgram, weldingAssessment, weldingProgram } from '../../test/training.ts'
import {
  buildCenters,
  isShowable,
  safeWebsite,
  type AssessmentSite,
  type Provider,
} from './centers.ts'

// Card 2: a learner never sees a listing that's unavailable, refused, lapsed, withdrawn or over. A listing nobody
// has reviewed yet stays, labelled by its evidence.
const TODAY = '2026-11-14'

describe('isShowable', () => {
  it('keeps current listings, reviewed or not', () => {
    expect(isShowable(weldingProgram, TODAY)).toBe(true)
    expect(isShowable(weldingAssessment, TODAY)).toBe(true)
    const unreviewed = { ...cookeryProgram, verification: undefined, availability: undefined }
    expect(isShowable(unreviewed, TODAY)).toBe(true)
  })

  it.each([
    [
      'marked unavailable',
      { availability: { ...weldingProgram.availability!, status: 'unavailable' as const } },
    ],
    [
      'refused in verification',
      { verification: { ...weldingProgram.verification!, status: 'unavailable' as const } },
    ],
    [
      'with a lapsed verification',
      { verification: { ...weldingProgram.verification!, status: 'expired' as const } },
    ],
    ['withdrawn', { is_active: false }],
    ['already over', { end_date: '2026-11-13' }],
  ])('hides a program %s', (_, change) => {
    expect(isShowable({ ...weldingProgram, ...change }, TODAY)).toBe(false)
  })

  it('keeps a program ending today', () => {
    expect(isShowable({ ...weldingProgram, end_date: TODAY }, TODAY)).toBe(true)
  })

  it.each(['closed', 'cancelled', 'completed'] as const)('hides a %s assessment', (status) => {
    expect(isShowable({ ...weldingAssessment, status }, TODAY)).toBe(false)
  })

  it('hides an assessment already past in Philippine time', () => {
    // 23:00 on 13 November in Manila, though 14 November has started in some places.
    expect(isShowable({ ...weldingAssessment, scheduled_at: '2026-11-13T15:00:00Z' }, TODAY)).toBe(
      false,
    )
    expect(isShowable({ ...weldingAssessment, scheduled_at: '2026-11-14T01:00:00Z' }, TODAY)).toBe(
      true,
    )
  })
})

describe('contact details', () => {
  const site = (fields: Partial<Provider>) =>
    buildCenters(
      [
        {
          ...weldingProgram.provider,
          contact_email: null,
          contact_phone: null,
          website: null,
          ...fields,
        } as Provider,
      ],
      [] as AssessmentSite[],
      [],
      [],
      new Map(),
    )[0]

  it('treats blank values as missing, so nothing empty is drawn', () => {
    const center = site({ contact_email: '  ', contact_phone: '', website: ' ', address: '   ' })
    expect([center.email, center.phone, center.website, center.address]).toEqual([
      null,
      null,
      null,
      null,
    ])
  })

  it('trims what it keeps', () => {
    expect(site({ contact_phone: ' (02) 8888 0000 ' }).phone).toBe('(02) 8888 0000')
  })

  it('links only to http and https websites', () => {
    expect(safeWebsite('tesda.gov.ph')).toBe('https://tesda.gov.ph/')
    expect(safeWebsite('http://example.ph/a')).toBe('http://example.ph/a')
    expect(safeWebsite('javascript:alert(1)')).toBeNull()
    expect(safeWebsite('mailto:a@example.ph')).toBeNull()
    expect(safeWebsite('not a url')).toBeNull()
    expect(site({ website: 'javascript:alert(1)' }).website).toBeNull()
  })
})
