import { GOAL_MAX_LENGTH } from '../finder/store.ts'

export interface TspLearnerParams {
  learnerId: string
  name: string
  goal: string
  skills: string
  experienceYears: string
  hasCertification: '' | 'yes' | 'no'
  region: string
}

const clean = (value: string | null, limit: number) =>
  (value ?? '')
    .replace(/[\p{Cc}]/gu, ' ')
    .trim()
    .slice(0, limit)

/** The only fields accepted from the TSP launch URL. All are untrusted hints, never account credentials. */
export function parseTspParams(search: string): TspLearnerParams {
  const params = new URLSearchParams(search)
  const certification = clean(params.get('has_certification'), 8).toLowerCase()
  const experience = clean(params.get('experience_years'), 12)
  const years = Number(experience)
  const skills = params.getAll('skills').flatMap((value) => value.split(','))

  return {
    learnerId: clean(params.get('learner_id'), 120),
    name: clean(params.get('name'), 120),
    goal: clean(params.get('goal'), GOAL_MAX_LENGTH),
    skills: skills
      .map((skill) => clean(skill, 80))
      .filter(Boolean)
      .slice(0, 20)
      .join(', '),
    experienceYears:
      experience && Number.isFinite(years) && years >= 0 && years <= 60 ? String(years) : '',
    hasCertification:
      certification === 'true' || certification === 'yes' || certification === '1'
        ? 'yes'
        : certification === 'false' || certification === 'no' || certification === '0'
          ? 'no'
          : '',
    region: clean(params.get('region'), 120),
  }
}
