import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { PageHero } from '../../components/PageHero.tsx'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { en } from '../../copy/en.ts'
import { AccountGate } from '../account/AccountGate.tsx'
import { applicationsQuery, checksQuery, pathwaysQuery, sessionsQuery } from './api.ts'
import { ContinueCard } from './ContinueCard.tsx'
import { Certifications, Goals } from './GoalsAndCertifications.tsx'
import { nextStep } from './journey.ts'
import { ReadinessHistory } from './ReadinessHistory.tsx'
import { Applications, Pathways, RecommendationHistory } from './Records.tsx'

const copy = en.progress

/**
 * My Progress, at /progress (classic/app.py show_progress; US-10, US-11): what to do next, then the learner's
 * recommendations, readiness checks, pathways, applications, goals and certifications, each with its empty state.
 * Signed out, it asks the learner to sign in.
 */
export default function ProgressPage() {
  const { isSignedIn } = useAuth()
  if (!isSignedIn) {
    const gate = en.account.progress
    return (
      <AccountGate
        page="progress"
        icon="growth"
        heading={gate.heading}
        body={gate.body}
        action={gate.action}
      />
    )
  }
  const page = en.pages.progress
  return (
    <>
      <PageHero
        heading={page.heading}
        title={copy.hero.title}
        accent={copy.hero.accent}
        lead={page.lead}
        art="chart"
      />
      <WithCatalog>{(catalog) => <Progress catalog={catalog} />}</WithCatalog>
    </>
  )
}

function Progress({ catalog }: { catalog: Qualification[] }) {
  const sessions = useQuery({ ...sessionsQuery, throwOnError: throwWithoutData })
  const checks = useQuery({ ...checksQuery, throwOnError: throwWithoutData })
  const pathways = useQuery({ ...pathwaysQuery, throwOnError: throwWithoutData })
  const applications = useQuery({ ...applicationsQuery, throwOnError: throwWithoutData })
  const codes = useMemo(
    () => new Set(catalog.map((qualification) => qualification.code)),
    [catalog],
  )

  if (!sessions.data || !checks.data || !pathways.data || !applications.data) {
    return (
      <p role="status" className="text-17 text-muted">
        {copy.loading}
      </p>
    )
  }
  const latest = checks.data.length
    ? [...checks.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : null

  return (
    <div className="flex flex-col gap-4">
      <ContinueCard
        next={nextStep(sessions.data, checks.data, pathways.data, applications.data, codes)}
      />
      <dl data-tour="progress-summary" className="m-0 grid grid-cols-3 gap-4 max-sm:grid-cols-1">
        <Stat
          label={copy.stats.sessions}
          value={String(sessions.data.length)}
          help={copy.stats.sessionsHelp}
        />
        <Stat label={copy.stats.checks} value={String(checks.data.length)} />
        <Stat
          label={copy.stats.latest}
          value={latest ? `${Math.round(latest.score)}%` : copy.stats.none}
          help={copy.stats.latestHelp}
        />
      </dl>
      <ReadinessHistory checks={checks.data} />
      <RecommendationHistory sessions={sessions.data} catalog={codes} />
      <div className="grid grid-cols-2 items-start gap-4 max-xl:grid-cols-1">
        <Pathways enrollments={pathways.data} />
        <Applications applications={applications.data} />
      </div>
      <div className="grid grid-cols-2 items-start gap-4 max-xl:grid-cols-1">
        <Goals catalog={catalog} />
        <Certifications catalog={catalog} />
      </div>
    </div>
  )
}

/** A figure with its label, after Streamlit's st.metric with a border. */
function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="rounded-14 border border-border bg-surface px-5 py-[1.1rem]">
      <dt className="text-14 text-ink">{label}</dt>
      <dd className="mt-[0.2rem] mb-0 ml-0 flex flex-col gap-[0.2rem]">
        <span className="font-display text-[2rem] leading-[1.15] font-bold text-navy">{value}</span>
        {help && <span className="text-12 leading-[1.4] text-muted">{help}</span>}
      </dd>
    </div>
  )
}
