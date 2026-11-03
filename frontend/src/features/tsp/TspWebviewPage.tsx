import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { analyzeGoal } from '../finder/api.ts'
import { GOAL_MAX_LENGTH, useFinderStore } from '../finder/store.ts'
import { parseTspParams, type TspLearnerParams } from './params.ts'

const field =
  'min-h-11 w-full rounded-12 border border-border bg-surface px-3 py-2 text-16 text-navy focus:border-blue'
const label = 'flex min-w-0 flex-col gap-1.5 text-14 font-semibold text-navy'
type Submission = Pick<
  TspLearnerParams,
  'skills' | 'experienceYears' | 'hasCertification' | 'region'
> & {
  query: string
}

/** A short handoff from TSP to the public pathway finder, sized for a native phone WebView. */
export default function TspWebviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [learner] = useState(() => parseTspParams(location.search))
  const [goal, setGoal] = useState(learner.goal)
  const [skills, setSkills] = useState(learner.skills)
  const [experienceYears, setExperienceYears] = useState(learner.experienceYears)
  const [hasCertification, setHasCertification] = useState(learner.hasCertification)
  const [region, setRegion] = useState(learner.region)
  const [error, setError] = useState<string | null>(null)
  const begin = useFinderStore((state) => state.begin)
  const setGoalInFinder = useFinderStore((state) => state.setGoal)
  const setPlace = useFinderStore((state) => state.setPlace)

  // Names, identifiers and goals should not remain in the address while the learner uses the page.
  useEffect(() => {
    if (location.search)
      void navigate(location.pathname, { replace: true, preventScrollReset: true })
  }, [location.pathname, location.search, navigate])

  const analyze = useMutation({
    mutationFn: ({ query }: Submission) => analyzeGoal(query, null),
    onSuccess: ({ profile }, { query, skills, experienceYears, hasCertification, region }) => {
      const suppliedSkills = skills
        .split(',')
        .map((skill) => skill.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20)
      begin({
        query,
        profile: {
          ...profile,
          existing_skills: suppliedSkills.length ? suppliedSkills : profile.existing_skills,
          experience_years:
            experienceYears === '' ? profile.experience_years : Number(experienceYears),
          has_certification:
            hasCertification === '' ? profile.has_certification : hasCertification === 'yes',
        },
        sessionId: null,
        sessionOwner: null,
      })
      setGoalInFinder(query)
      setPlace({ region: region.trim().toUpperCase() || null })
      void navigate(paths.finderMatches)
    },
    onError: (failure) => setError(failureMessage(failure)),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = goal.trim()
    if (!query) {
      setError('Enter a career goal to find a pathway.')
      return
    }
    setError(null)
    analyze.mutate({ query, skills, experienceYears, hasCertification, region })
  }

  return (
    <div className="min-w-0">
      <p className="mb-2 text-12 font-bold tracking-[0.1em] text-blue uppercase">
        TESDA Skill Passport
      </p>
      <PageHeading>Find your TESDA pathway</PageHeading>
      <p className="mb-5 text-15 text-muted">
        Review your details, then explore qualifications that match your goal and skills.
      </p>

      {(learner.name || learner.learnerId) && (
        <div className="mb-5 rounded-14 border border-banner-border bg-tint px-4 py-3">
          {learner.name && (
            <p className="m-0 font-semibold wrap-anywhere text-navy">{learner.name}</p>
          )}
          {learner.learnerId && (
            <p className="m-0 text-13 wrap-anywhere text-muted">
              Learner reference: {learner.learnerId}
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={submit}
        className="flex min-w-0 flex-col gap-4 rounded-16 border border-border bg-surface p-5 shadow-card max-xs:p-4"
      >
        <label className={label}>
          Career goal <span className="sr-only">required</span>
          <textarea
            className={`${field} min-h-28 resize-y`}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            maxLength={GOAL_MAX_LENGTH}
            placeholder="What work would you like to do?"
            required
          />
        </label>
        <label className={label}>
          Existing skills
          <input
            className={field}
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            maxLength={1600}
            placeholder="Separate skills with commas"
          />
        </label>
        <div className="grid min-w-0 grid-cols-2 gap-3 max-xs:grid-cols-1">
          <label className={label}>
            Years of experience
            <input
              className={field}
              type="number"
              inputMode="decimal"
              min="0"
              max="60"
              step="any"
              value={experienceYears}
              onChange={(event) => setExperienceYears(event.target.value)}
            />
          </label>
          <label className={label}>
            TESDA certification
            <select
              className={field}
              value={hasCertification}
              onChange={(event) =>
                setHasCertification(event.target.value as typeof hasCertification)
              }
            >
              <option value="">Not specified</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <label className={label}>
          Region
          <input
            className={field}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            maxLength={120}
            placeholder="Region code, e.g. NCR or VII"
          />
        </label>
        {error && (
          <p role="alert" className="m-0 text-14 text-warn-ink">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={button({ variant: 'primary', height: 48, wide: true })}
          disabled={analyze.isPending}
        >
          {analyze.isPending ? 'Finding your pathway…' : 'Find my pathway'}
        </button>
      </form>
    </div>
  )
}
