import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { Button } from 'react-aria-components'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { PageTitle } from '../../components/PageTitle.tsx'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
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

type ProgressSection = 'qualifications' | 'milestones' | 'pathways' | 'readiness' | 'history'
const SECTIONS: readonly { id: ProgressSection }[] = [
  { id: 'qualifications' },
  { id: 'milestones' },
  { id: 'pathways' },
  { id: 'readiness' },
  { id: 'history' },
]

/**
 * My Progress, at /progress: a qualification collection with sections for badges, pathways, readiness and
 * recommendations. Activity, goals, certificates and applications live in My Profile. Signed out, it asks the
 * learner to sign in.
 */
export default function ProgressPage() {
  const en = useCopy()

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
      <PageTitle heading={page.heading} lead={page.lead} />
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
    if (!sessions.data || requested === null || sections.some((item) => item.id === requested))
      return
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
    <div className="flex flex-col gap-6">
      <ContinueCard
        next={nextStep(sessions.data, checks.data, pathways.data, applications.data, codes)}
        checks={checks.data}
        onOpenRecord={(next) => {
          if (next === 'applications') {
            void navigate(`${paths.profile}?section=applications`)
          } else {
            selectSection('pathways', SECTION_IDS.pathways)
          }
        }}
      />
      {/* Underline tabs on a full-width rule. Narrow screens show every section at once, two a row, the selected one
          filled: no tab is hidden off the edge. An odd last one takes the whole row. */}
      <nav
        data-tour="progress-sections"
        aria-label={copy.sections.label}
        className="-mb-2 border-b border-border max-sm:mb-0 max-sm:border-b-0"
      >
        <div className="flex gap-6 max-sm:grid max-sm:grid-cols-2 max-sm:gap-1 max-sm:rounded-14 max-sm:border max-sm:border-border max-sm:bg-surface max-sm:p-1 max-sm:[&>:last-child:nth-child(odd)]:col-span-2">
          {sections.map((item) => {
            const current = section === item.id
            return (
              <Button
                key={item.id}
                className={cx(
                  '-mb-px flex min-h-11 flex-none cursor-pointer items-center border-0 border-b-2 bg-transparent px-0 pt-2 pb-[0.6rem] text-15 whitespace-nowrap transition-colors duration-150 ease-[ease]',
                  'max-sm:mb-0 max-sm:justify-center max-sm:rounded-10 max-sm:border-b-0 max-sm:px-3 max-sm:py-2 max-sm:text-14',
                  current
                    ? 'border-navy font-semibold text-navy max-sm:bg-chip'
                    : 'border-transparent font-medium text-muted hovered:border-hover-border hovered:text-navy max-sm:hovered:bg-soft',
                )}
                aria-pressed={current}
                aria-controls={`progress-panel-${item.id}`}
                onPress={() => selectSection(item.id)}
              >
                {copy.sections[item.id]}
              </Button>
            )
          })}
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
        <Pathways enrollments={pathways.data} sessions={sessions.data} checks={checks.data} />
      </div>
      <div id="progress-panel-readiness" hidden={section !== 'readiness'}>
        <div className="flex flex-col gap-4">
          {/* One strip split by dividers, label over value. */}
          <dl
            data-tour="progress-summary"
            className="m-0 grid grid-cols-3 divide-x divide-border rounded-16 border border-border bg-surface max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y"
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
        <RecommendationHistory sessions={sessions.data} checks={checks.data} catalog={codes} />
      </div>
    </div>
  )
}

/** A figure with its label, after Streamlit's st.metric: one cell of the summary strip. */
function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-14 text-muted">{label}</dt>
      <dd className="mt-1 mb-0 ml-0 flex flex-col gap-1">
        <span className="font-display text-[1.75rem] leading-[1.15] font-semibold text-navy tabular-nums">
          {value}
        </span>
        {help && <span className="text-13 leading-[1.45] text-muted">{help}</span>}
      </dd>
    </div>
  )
}
