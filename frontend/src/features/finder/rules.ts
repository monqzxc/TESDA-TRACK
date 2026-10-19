import type { CenterKind } from '../training/address.ts'
import type {
  CertificationAnswer,
  ExperienceAnswer,
  Profile,
  ReadinessResult,
  SessionState,
} from './store.ts'

// The finder's rules, from classic/app.py: how follow-up answers fill in the goal's profile, and how a readiness
// result picks the recommendation (VERDICTS).

/** Years of experience for each answer (app.py EXPERIENCE_OPTIONS). */
export const EXPERIENCE_YEARS: Record<ExperienceAnswer, number> = {
  none: 0,
  'under-1': 0.5,
  '1-3': 2,
  'over-3': 4,
}

/** "I'm not sure" leaves the certification unknown, rather than reporting one or none (US-03). */
export const CERTIFICATION_VALUES: Record<CertificationAnswer, boolean | null> = {
  yes: true,
  no: false,
  unsure: null,
}

/** The goal didn't say how much experience the learner has: the finder asks. */
export function asksExperience(profile: Profile): boolean {
  return profile.experience_years === null || profile.experience_years === undefined
}

/** The goal didn't say whether the learner holds a certification: the finder asks. */
export function asksCertification(profile: Profile): boolean {
  return profile.has_certification === null || profile.has_certification === undefined
}

/** The goal's profile with the follow-up answers filled into what it left blank. */
export function answeredProfile(
  profile: Profile,
  experience: ExperienceAnswer | null,
  certification: CertificationAnswer | null,
): Profile {
  return {
    ...profile,
    experience_years:
      asksExperience(profile) && experience !== null
        ? EXPERIENCE_YEARS[experience]
        : (profile.experience_years ?? null),
    has_certification:
      asksCertification(profile) && certification !== null
        ? CERTIFICATION_VALUES[certification]
        : (profile.has_certification ?? null),
  }
}

/** What a signed-in learner's recommendation session should hold now. */
export function sessionState(
  profile: Pick<Profile, 'experience_years' | 'has_certification'>,
  qualificationCode: string | null,
): SessionState {
  return {
    experience_years: profile.experience_years ?? null,
    has_certification: profile.has_certification ?? null,
    qualification_code: qualificationCode,
  }
}

export function sameSessionState(a: SessionState | null, b: SessionState): boolean {
  return (
    a !== null &&
    a.experience_years === b.experience_years &&
    a.has_certification === b.has_certification &&
    a.qualification_code === b.qualification_code
  )
}

export type Verdict = 'high' | 'moderate' | 'low'

/** A curated pathway's route, as GET /api/v1/pathways takes it. */
export type PathwayRoute = 'ASSESSMENT_READINESS' | 'SKILL_GAP_CHECK' | 'TRAINING_AND_ASSESSMENT'

/** Each verdict's curated pathway route, and the centers its button opens. */
export const VERDICTS: Record<Verdict, { route: PathwayRoute; kind: CenterKind }> = {
  high: { route: 'ASSESSMENT_READINESS', kind: 'assessment' },
  moderate: { route: 'SKILL_GAP_CHECK', kind: 'training' },
  low: { route: 'TRAINING_AND_ASSESSMENT', kind: 'training' },
}

/**
 * The verdict for a readiness result: the first word of its level ("High readiness"), which the API sets from the
 * score's 80% and 50% bands. A level the app doesn't know falls back to those bands.
 */
export function verdictFor(result: ReadinessResult): Verdict {
  const word = result.level.trim().split(/\s+/)[0]?.toLowerCase()
  if (word === 'high' || word === 'moderate' || word === 'low') return word
  if (result.score >= 80) return 'high'
  return result.score >= 50 ? 'moderate' : 'low'
}
