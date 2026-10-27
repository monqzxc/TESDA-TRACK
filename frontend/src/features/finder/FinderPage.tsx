import { useEffect, useId, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { useCurrentPage } from '../../lib/navigation.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { GoalStep } from './GoalStep.tsx'
import { GoalSummary } from './GoalSummary.tsx'
import { JourneyBanner } from './JourneyBanner.tsx'
import { MatchesStep } from './MatchesStep.tsx'
import { PathwayStep } from './PathwayStep.tsx'
import { ReadinessStep } from './ReadinessStep.tsx'
import { GOAL, MATCHES, PATHWAY, READINESS, STEP_PAGES, STEP_PATHS } from './steps.ts'
import { StepTabs } from './StepTabs.tsx'
import { useFinderStore, type Journey } from './store.ts'
import { useJourney } from './useJourney.ts'
import { useSessionSync } from './useJourneySession.ts'
import { card, muted, status, stepBody, stepNav } from './styles.ts'

// The step shown last, so the next one slides in from the side the learner moved towards. Each step is its own
// route, so this outlives the page between them.
let lastStep: number | null = null

/**
 * Find my pathway, at /find and its steps (/find/matches, /find/readiness, /find/pathway): classic/app.py
 * show_finder. The goal and the learner's work live in the finder's store (sessionStorage), never in the address.
 * Without a goal, the later steps go back to the first.
 */
export default function FinderPage() {
  const page = useCurrentPage()
  const step = Math.max(GOAL, STEP_PAGES.indexOf(page ?? 'finderGoal'))
  const journey = useFinderStore((state) => state.journey)
  const [direction] = useState(() =>
    lastStep === null || lastStep === step ? undefined : step > lastStep ? 'forward' : 'back',
  )
  useEffect(() => {
    lastStep = step
  }, [step])

  if (step > GOAL && !journey) return <Navigate to={paths.finder} replace />
  return (
    <>
      <JourneyBanner />
      <StepTabs current={step} unlocked={journey !== null} />
      <WithCatalog emptyState>
        {(catalog) => (
          <div className={stepBody} data-direction={direction}>
            {step === GOAL || !journey ? (
              <>
                <GoalStep />
                {journey && <StepNav step={GOAL} />}
              </>
            ) : (
              <JourneySteps step={step} journey={journey} catalog={catalog} />
            )}
          </div>
        )}
      </WithCatalog>
    </>
  )
}

/** Steps 2 to 4: the goal above, the step, then Back and Next. */
function JourneySteps({
  step,
  journey,
  catalog,
}: {
  step: number
  journey: Journey
  catalog: Qualification[]
}) {
  const en = useCopy()
  const copy = en.finder

  const context = useJourney(journey, catalog)
  const { chosen } = context
  const sync = useSessionSync(context.matchedProfile, chosen?.code ?? null)
  const choose = useFinderStore((state) => state.choose)
  const hasCheck = useFinderStore((state) => (chosen ? chosen.code in state.checks : false))
  const navigate = useNavigate()
  const headingId = useId()
  const profile = context.matchedProfile ?? context.profile

  let body
  if (step === MATCHES) {
    body = (
      <MatchesStep
        journey={journey}
        context={context}
        catalog={catalog}
        onCheck={(code) => {
          choose(code)
          void navigate(paths.finderReadiness)
        }}
      />
    )
  } else if (context.choosing) {
    body = (
      <p role="status" className={status}>
        {copy.matches.loading}
      </p>
    )
  } else if (!chosen) {
    body = <ChooseFirst />
  } else if (step === READINESS) {
    body = (
      <ReadinessStep
        journey={journey}
        qualification={chosen}
        profile={profile}
        onResult={() => void navigate(paths.finderPathway)}
      />
    )
  } else {
    body = (
      <PathwayStep
        qualification={chosen}
        profile={profile}
        asked={{ query: journey.query, profile: context.profile }}
      />
    )
  }

  return (
    <>
      <GoalSummary journey={journey} code={chosen?.code ?? null} sync={sync} />
      <section aria-labelledby={headingId} className={stepBody}>
        <h2 id={headingId} className="sr-only">
          {copy.steps.names[step]}
        </h2>
        {body}
      </section>
      {/* On the readiness check, the questions' own buttons lead until there's a result. */}
      <StepNav step={step} quietNext={step === READINESS && !hasCheck} />
    </>
  )
}

/** A goal with no match has no qualification until the learner picks one (US-03). */
function ChooseFirst() {
  const en = useCopy()
  const copy = en.finder

  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={card}>
      <h3 id={headingId}>{copy.choose.heading}</h3>
      <p className={muted}>{copy.choose.body}</p>
      <p>
        <Link to={paths.finderMatches} className={button({ variant: 'primary' })}>
          <Icon name="arrowLeft" />
          {copy.choose.action}
        </Link>
      </p>
    </section>
  )
}

/** Back to the step before, and on to the next (the last step's own button is its next step). */
function StepNav({ step, quietNext = false }: { step: number; quietNext?: boolean }) {
  const en = useCopy()
  const copy = en.finder

  return (
    <div className={stepNav}>
      {step > GOAL && (
        <Link to={STEP_PATHS[step - 1]} className={button()}>
          <Icon name="arrowLeft" />
          {copy.steps.back}
        </Link>
      )}
      {step < PATHWAY && (
        <Link
          to={STEP_PATHS[step + 1]}
          className={button({ variant: quietNext ? 'secondary' : 'primary' })}
        >
          {copy.steps.next(copy.steps.names[step + 1])}
          <Icon name="arrowRight" />
        </Link>
      )}
    </div>
  )
}
