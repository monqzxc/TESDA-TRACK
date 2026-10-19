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
import styles from './ProgressPage.module.css'

const copy = en.progress

/**
 * My Progress, at /progress (frontend/app.py show_progress; US-10, US-11): what to do next, then the learner's
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
      <p role="status" className={styles.loading}>
        {copy.loading}
      </p>
    )
  }
  const latest = checks.data.length
    ? [...checks.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : null

  return (
    <div className={styles.sections}>
      <ContinueCard
        next={nextStep(sessions.data, checks.data, pathways.data, applications.data, codes)}
      />
      <dl className={styles.stats}>
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
      <div className={styles.columns}>
        <Pathways enrollments={pathways.data} />
        <Applications applications={applications.data} />
      </div>
      <div className={styles.columns}>
        <Goals catalog={catalog} />
        <Certifications catalog={catalog} />
      </div>
    </div>
  )
}

/** A figure with its label, after Streamlit's st.metric. */
function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.figure}>{value}</span>
        {help && <span className={styles.help}>{help}</span>}
      </dd>
    </div>
  )
}
