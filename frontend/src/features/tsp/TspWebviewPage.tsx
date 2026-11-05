import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { paths } from '../../paths.ts'
import { analyzeGoal } from '../finder/api.ts'
import { GOAL_MAX_LENGTH, useFinderStore } from '../finder/store.ts'
import type { TspLearnerParams } from './params.ts'
import { usePassport, withPassport } from './passport.ts'
import { suggestionProfile } from './suggestions.ts'
import { TspPassportStatus } from './TspPassportStatus.tsx'
import { TspSuggestions } from './TspSuggestions.tsx'
import { useTspState } from './TspState.tsx'
import type { TspSignInState } from './useTspSignIn.ts'

const suggestions = ['Welder', 'Caregiver', 'Barista', 'Hotel work']
type Submission = Pick<
  TspLearnerParams,
  'skills' | 'experienceYears' | 'hasCertification' | 'region'
> & { query: string }

/** TSP's first step: a goal, then a few optional details before matching. */
export default function TspWebviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [learner, setLearner] = useTspState()
  const [showQuestions, setShowQuestions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const begin = useFinderStore((state) => state.begin)
  const setGoalInFinder = useFinderStore((state) => state.setGoal)
  const setPlace = useFinderStore((state) => state.setPlace)
  const signIn = useOutletContext<TspSignInState | undefined>()
  const passport = usePassport(signIn)

  useEffect(() => {
    if (location.search)
      void navigate(location.pathname, { replace: true, preventScrollReset: true })
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    const suggestedGoal = (location.state as { goal?: unknown } | null)?.goal
    if (typeof suggestedGoal !== 'string') return
    setLearner((current) => ({ ...current, goal: suggestedGoal.slice(0, GOAL_MAX_LENGTH) }))
    void navigate(location.pathname, { replace: true, state: null, preventScrollReset: true })
  }, [location.pathname, location.state, navigate, setLearner])

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
        // The Skill Passport's skills go after the learner's own, without showing in the form.
        profile: withPassport(
          {
            ...profile,
            existing_skills: suppliedSkills.length ? suppliedSkills : profile.existing_skills,
            experience_years:
              experienceYears === '' ? profile.experience_years : Number(experienceYears),
            has_certification:
              hasCertification === '' ? profile.has_certification : hasCertification === 'yes',
          },
          passport.data,
        ),
        sessionId: null,
        sessionOwner: null,
      })
      setGoalInFinder(query)
      setPlace({ region: region.trim().toUpperCase() || null })
      void navigate(paths.tspMatches)
    },
    onError: (failure) => setError(failureMessage(failure)),
  })

  /**
   * A suggestion is a head start, not a shortcut: its qualification name becomes the goal and goes through the
   * same analysis as a typed one, so the matches and recommendation steps work from a goal the learner chose.
   */
  const chooseSuggestion = (qualificationName: string) => {
    const query = qualificationName.slice(0, GOAL_MAX_LENGTH)
    setError(null)
    setLearner((current) => ({ ...current, goal: query }))
    analyze.mutate({
      query,
      skills: learner.skills,
      experienceYears: learner.experienceYears,
      hasCertification: learner.hasCertification,
      region: learner.region,
    })
  }

  const openQuestions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!learner.goal.trim()) {
      setError('Enter a job or career goal to find a match.')
      return
    }
    setError(null)
    setShowQuestions(true)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = learner.goal.trim()
    if (!query) {
      setError('Enter a job or career goal to find a match.')
      setShowQuestions(false)
      return
    }
    setError(null)
    analyze.mutate({
      query,
      skills: learner.skills,
      experienceYears: learner.experienceYears,
      hasCertification: learner.hasCertification,
      region: learner.region,
    })
  }

  return (
    <div className="tsp-entry">
      {!showQuestions && (
        <section className="tsp-intro">
          <h1>Find your TESDA qualification</h1>
          <p>Type the job you want. We’ll show the right course and where to take it.</p>
        </section>
      )}
      <div className="tsp-entry-body">
        {showQuestions && (
          <div className="tsp-progress" aria-label="Step 1 of 3">
            <div className="tsp-progress-label">
              <strong>Step 1 of 3</strong>
              <span>Your goal</span>
            </div>
            <div className="tsp-progress-track">
              <span style={{ width: '33.333%' }} />
            </div>
          </div>
        )}
        {/* Only while the goal box is empty: a learner who already knows what they want needs no suggestion. */}
        {!showQuestions && !learner.goal.trim() && (
          <TspSuggestions
            profile={suggestionProfile(learner, passport.data)}
            onChoose={chooseSuggestion}
            busy={analyze.isPending}
          />
        )}
        {!showQuestions ? (
          <form onSubmit={openQuestions} className="tsp-card tsp-goal-form">
            <TspPassportStatus signIn={signIn} passport={passport} />
            {(learner.name || learner.learnerId) && (
              <div className="tsp-learner">
                {learner.name && <strong>{learner.name}</strong>}
                {learner.learnerId && <span>Learner reference: {learner.learnerId}</span>}
              </div>
            )}
            <h2>What job do you want?</h2>
            <label className="tsp-search-field">
              <span className="sr-only">Career goal</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                value={learner.goal}
                onChange={(event) =>
                  setLearner((current) => ({ ...current, goal: event.target.value }))
                }
                maxLength={GOAL_MAX_LENGTH}
                placeholder="e.g. Cook in a hotel"
                required
              />
            </label>
            <div className="tsp-suggestions" aria-label="Suggested jobs">
              {suggestions.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => setLearner((current) => ({ ...current, goal }))}
                >
                  {goal}
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" className="tsp-error">
                {error}
              </p>
            )}
            <button className="tsp-primary" type="submit">
              Find my match
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="tsp-questions">
            <div className="tsp-goal-note">
              <span>Your goal</span>
              <strong>{learner.goal}</strong>
              <button type="button" onClick={() => setShowQuestions(false)}>
                Edit
              </button>
            </div>
            <h1>A few quick questions</h1>
            <p className="tsp-muted">Optional. Helps us match you better.</p>
            <fieldset className="tsp-card tsp-choice-group">
              <legend>Have you done this work before?</legend>
              <div className="tsp-choices">
                {(['', '0', '0.5', '1'] as const).map((years, index) => (
                  <button
                    key={index}
                    type="button"
                    className={learner.experienceYears === years ? 'is-selected' : ''}
                    onClick={() =>
                      setLearner((current) => ({ ...current, experienceYears: years }))
                    }
                  >
                    {['Not sure', 'No', 'Less than 1 year', '1 year or more'][index]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="tsp-card tsp-choice-group">
              <legend>Do you have a TESDA certificate for it?</legend>
              <div className="tsp-choices">
                {(['no', 'yes', ''] as const).map((answer, index) => (
                  <button
                    key={index}
                    type="button"
                    className={learner.hasCertification === answer ? 'is-selected' : ''}
                    onClick={() =>
                      setLearner((current) => ({ ...current, hasCertification: answer }))
                    }
                  >
                    {['No', 'Yes', 'Not sure'][index]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="tsp-card tsp-extra-fields">
              <label>
                Existing skills <span>(optional)</span>
                <input
                  value={learner.skills}
                  maxLength={1600}
                  placeholder="e.g. welding, reading drawings"
                  onChange={(event) =>
                    setLearner((current) => ({ ...current, skills: event.target.value }))
                  }
                />
              </label>
              <label>
                Region <span>(optional)</span>
                <input
                  value={learner.region}
                  maxLength={120}
                  placeholder="e.g. NCR"
                  onChange={(event) =>
                    setLearner((current) => ({ ...current, region: event.target.value }))
                  }
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="tsp-error">
                {error}
              </p>
            )}
            <div className="tsp-bottom-actions">
              <button
                type="button"
                className="tsp-secondary"
                onClick={() => setShowQuestions(false)}
              >
                Back
              </button>
              <button className="tsp-primary" type="submit" disabled={analyze.isPending}>
                {analyze.isPending ? 'Finding matches…' : 'Show my matches'}
              </button>
            </div>
          </form>
        )}
        <div className="tsp-entry-links">
          <Link to={paths.tspQualifications}>
            Browse all qualifications <span aria-hidden="true">›</span>
          </Link>
          <Link to={paths.tspTraining}>
            Find a center near you <span aria-hidden="true">›</span>
          </Link>
        </div>
        <p className="tsp-privacy">
          Your answers stay in this webview session. Location is used only if you allow it.
        </p>
      </div>
    </div>
  )
}
