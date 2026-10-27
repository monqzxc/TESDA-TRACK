import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { Button } from 'react-aria-components'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { PageHero } from '../../components/PageHero.tsx'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { AccountGate } from '../account/AccountGate.tsx'
import {
  applicationsQuery,
  certificationsQuery,
  checksQuery,
  goalsQuery,
  pathwaysQuery,
  sessionsQuery,
} from './api.ts'
import { ContinueCard, goToSection, pathwayHeadingId, SECTION_IDS } from './ContinueCard.tsx'
import { nextStep } from './journey.ts'
import { Milestones } from './Milestones.tsx'
import { ReadinessHistory } from './ReadinessHistory.tsx'
import { QualificationGoals } from './QualificationGoals.tsx'
import { Pathways, RecommendationHistory } from './Records.tsx'

type ProgressSection =
  | 'qualifications'
  | 'milestones'
  | 'pathways'
  | 'readiness'
  | 'history'
const SECTIONS: readonly { id: ProgressSection; icon: IconName }[] = [
  { id: 'qualifications', icon: 'learn' },
  { id: 'milestones', icon: 'sparkle' },
  { id: 'pathways', icon: 'route' },
  { id: 'readiness', icon: 'checklist' },
  { id: 'history', icon: 'clock' },
]

/**
 * My Progress, at /progress: a qualification collection with sections for badges, pathways, readiness and
 * recommendations. Activity, goals, certificates and applications live in My Profile. Signed out, it asks the
 * learner to sign in.
 */
export default function ProgressPage() {
  const en = useCopy()
  const copy = en.progress

  const { isSignedIn, isChecking, offersAccounts } = useAuth()
  // Guest-only: progress needs an account, which learners can't make, so the page sends them Home.
  if (!isSignedIn && !isChecking && !offersAccounts) return <Navigate to={paths.home} replace />
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
  const en = useCopy()
  const copy = en.progress

  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const pendingFocus = useRef<string | null>(null)

  const sessions = useQuery({ ...sessionsQuery, throwOnError: throwWithoutData })
  const checks = useQuery({ ...checksQuery, throwOnError: throwWithoutData })
  const pathways = useQuery({ ...pathwaysQuery, throwOnError: throwWithoutData })
  const applications = useQuery({ ...applicationsQuery, throwOnError: throwWithoutData })
  const goals = useQuery({ ...goalsQuery, throwOnError: throwWithoutData })
  const certifications = useQuery({ ...certificationsQuery, throwOnError: throwWithoutData })
  const hasHistory = sessions.data?.some((session) => session.query.trim().length > 0) ?? false
  const sections = SECTIONS.filter((item) => item.id !== 'history' || hasHistory)
  const requested = params.get('section')
  const section = sections.find((item) => item.id === requested)?.id ?? 'qualifications'
  useEffect(() => {
    if (requested === 'activity' || requested === 'records' || requested === 'applications') {
      void navigate(`${paths.profile}?section=${requested}`, { replace: true })
      return
    }
    if (!sessions.data || requested === null || sections.some((item) => item.id === requested)) return
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.delete('section')
        return updated
      },
      { replace: true, preventScrollReset: true },
    )
  }, [navigate, requested, sections, sessions.data, setParams])
  useEffect(() => {
    if (!pendingFocus.current) return
    goToSection(pendingFocus.current)
    pendingFocus.current = null
  }, [section])

  const selectSection = (next: ProgressSection, focusId?: string) => {
    if (section === next && focusId) goToSection(focusId)
    else pendingFocus.current = focusId ?? null
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === 'qualifications') updated.delete('section')
        else updated.set('section', next)
        return updated
      },
      { preventScrollReset: true },
    )
  }
  const codes = useMemo(
    () => new Set(catalog.map((qualification) => qualification.code)),
    [catalog],
  )

  if (
    !sessions.data ||
    !checks.data ||
    !pathways.data ||
    !applications.data ||
    !goals.data ||
    !certifications.data
  ) {
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
        onOpenRecord={(next) => {
          if (next === 'applications') {
            void navigate(`${paths.profile}?section=applications`)
          } else {
            selectSection('pathways', SECTION_IDS.pathways)
          }
        }}
      />
      <nav
        data-tour="progress-sections"
        aria-label={copy.sections.label}
        className="rounded-18 border border-border bg-surface p-2"
      >
        <div className="flex flex-wrap gap-2">
          {sections.map((item) => (
            <Button
              key={item.id}
              className={cx(
                button({
                  variant: section === item.id ? 'primary' : 'tertiary',
                  text: 14,
                  height: 44,
                }),
                'grow',
              )}
              aria-pressed={section === item.id}
              aria-controls={`progress-panel-${item.id}`}
              onPress={() => selectSection(item.id)}
            >
              <Icon name={item.icon} />
              {copy.sections[item.id]}
            </Button>
          ))}
        </div>
      </nav>
      <div id="progress-panel-qualifications" hidden={section !== 'qualifications'}>
        <QualificationGoals
          enrollments={pathways.data}
          goals={goals.data}
          onViewPathway={(id) => selectSection('pathways', pathwayHeadingId(id))}
        />
      </div>
      <div id="progress-panel-milestones" hidden={section !== 'milestones'}>
        <Milestones
          enrollments={pathways.data}
          checks={checks.data}
          goals={goals.data}
          certifications={certifications.data}
        />
      </div>
      <div id="progress-panel-pathways" hidden={section !== 'pathways'}>
        <Pathways enrollments={pathways.data} />
      </div>
      <div id="progress-panel-readiness" hidden={section !== 'readiness'}>
        <div className="flex flex-col gap-4">
          <dl
            data-tour="progress-summary"
            className="m-0 grid grid-cols-3 gap-4 max-sm:grid-cols-1"
          >
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
        </div>
      </div>
      <div id="progress-panel-history" hidden={section !== 'history'}>
        <RecommendationHistory sessions={sessions.data} catalog={codes} />
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
