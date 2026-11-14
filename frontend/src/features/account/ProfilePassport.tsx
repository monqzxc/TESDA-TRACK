import { useQuery } from '@tanstack/react-query'
import { TspBadge } from '../../components/TspBadge.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { passportQuery } from '../tsp/passport.ts'

const SECTIONS = ['skills', 'experience', 'education', 'qualifications', 'credentials'] as const

/**
 * What the learner's Skill Passport held at their last TSP sign-in (GET /api/v1/auth/tsp/profile). Nothing for an
 * account that isn't linked to one, or while it can't be read.
 */
export function ProfilePassport({ learnerId }: { learnerId: string }) {
  const copy = useCopy().tspSignIn.passport
  const passport = useQuery(passportQuery(learnerId)).data
  if (!passport) return null
  return (
    <section
      aria-labelledby="profile-passport"
      className="mb-6 rounded-18 border border-border bg-surface p-5"
    >
      <h2 id="profile-passport" className="mb-3 flex items-center gap-2.5 text-17 text-navy">
        <TspBadge small />
        {copy.heading}
      </h2>
      <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section} className="min-w-0">
            <dt className="text-14 font-semibold text-muted">{copy.sections[section]}</dt>
            {/* Learner text from TSP: rendered as text. */}
            <dd className="m-0 text-15 wrap-anywhere text-ink">
              {passport[section].length ? passport[section].join(', ') : copy.none}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
