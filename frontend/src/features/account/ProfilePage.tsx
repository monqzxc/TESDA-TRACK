import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { QueryBoundary } from '../../components/QueryBoundary.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { AccountGate } from './AccountGate.tsx'
import {
  ProfileActivity,
  ProfileApplications,
  ProfileGoalsAndCertifications,
} from './ProfileRecords.tsx'

type ProfileSection = 'overview' | 'activity' | 'records' | 'applications'
const SECTIONS: readonly { id: ProfileSection; icon: IconName }[] = [
  { id: 'overview', icon: 'person' },
  { id: 'activity', icon: 'bars' },
  { id: 'records', icon: 'award' },
  { id: 'applications', icon: 'clipboard' },
]

const joinedDate = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'long',
  timeZone: 'Asia/Manila',
})

/** The current account's profile. AuthProvider removes these details as soon as the session ends. */
export default function ProfilePage() {
  const en = useCopy()
  const copy = en.account.profile
  const [params, setParams] = useSearchParams()
  const requested = params.get('section')
  const section = SECTIONS.find((item) => item.id === requested)?.id ?? 'overview'
  const [visited, setVisited] = useState<Set<ProfileSection>>(() => new Set([section]))

  useEffect(() => {
    if (requested === null || SECTIONS.some((item) => item.id === requested)) return
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.delete('section')
        return updated
      },
      { replace: true, preventScrollReset: true },
    )
  }, [requested, setParams])

  const selectSection = (next: ProfileSection) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === 'overview') updated.delete('section')
        else updated.set('section', next)
        return updated
      },
      { preventScrollReset: true },
    )
  }
  const openSection = (next: ProfileSection) => {
    setVisited((current) => (current.has(next) ? current : new Set([...current, next])))
    selectSection(next)
  }
  const { learner } = useAuth()
  if (!learner) {
    return (
      <AccountGate
        page="profile"
        icon="person"
        heading={copy.gate.heading}
        body={copy.gate.body}
        action={copy.gate.action}
      />
    )
  }

  const initials = learner.full_name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase('en-PH')
  const role = copy.roleName(learner.role)

  return (
    <div className="max-w-full">
      <PageHeading>{en.pages.profile.heading}</PageHeading>
      <p className="mt-2 mb-5 text-17 text-muted">{en.pages.profile.lead}</p>

      <section
        aria-labelledby="profile-name"
        className="mb-6 flex items-center gap-5 rounded-20 border border-banner-border bg-(image:--track-banner) p-7 max-sm:flex-col max-sm:items-start max-sm:p-5"
      >
        <span
          aria-hidden="true"
          className="grid size-20 shrink-0 place-items-center rounded-full border border-border bg-surface font-display text-[1.75rem] font-bold text-blue"
        >
          {initials || <Icon name="person" size={32} />}
        </span>
        <div className="min-w-0">
          <h2 id="profile-name" className="mb-2 text-24 wrap-anywhere text-navy">
            {learner.full_name}
          </h2>
          <span className="inline-block rounded-full bg-chip px-3 py-1 text-14 font-semibold wrap-anywhere text-navy">
            {role}
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <nav
          data-tour="profile-sections"
          aria-label={copy.sections.label}
          className="rounded-18 border border-border bg-surface p-2"
        >
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((item) => (
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
                aria-controls={`profile-panel-${item.id}`}
                onPress={() => openSection(item.id)}
              >
                <Icon name={item.icon} />
                {copy.sections[item.id]}
              </Button>
            ))}
          </div>
        </nav>
        <div id="profile-panel-overview" hidden={section !== 'overview'}>
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-5 max-lg:grid-cols-1">
            <section
              aria-labelledby="profile-details"
              className="min-w-0 rounded-18 border border-border bg-surface p-6 max-sm:p-5"
            >
              <h2 id="profile-details" className="mb-1 text-20 text-navy">
                {copy.details}
              </h2>
              <dl className="m-0 divide-y divide-border">
                <Detail label={copy.fullName}>{learner.full_name}</Detail>
                <Detail label={copy.email}>{learner.email}</Detail>
                <Detail label={copy.role}>{role}</Detail>
                <Detail label={copy.joined}>
                  <time dateTime={learner.created_at}>
                    {joinedDate.format(new Date(learner.created_at))}
                  </time>
                </Detail>
              </dl>
            </section>

            <section
              aria-labelledby="profile-journey"
              className="rounded-18 border border-border bg-surface p-6 max-sm:p-5"
            >
              <Icon name="growth" size={26} className="mb-3 text-blue" />
              <h2 id="profile-journey" className="mb-2 text-20 text-navy">
                {copy.journey.heading}
              </h2>
              <p className="mb-5 text-15 leading-relaxed text-muted">{copy.journey.body}</p>
              <Link to={paths.progress} className={button({ variant: 'primary' })}>
                {copy.journey.action}
              </Link>
            </section>
          </div>
        </div>
        <div id="profile-panel-activity" hidden={section !== 'activity'}>
          {(visited.has('activity') || section === 'activity') && (
            <QueryBoundary>
              <ProfileActivity />
            </QueryBoundary>
          )}
        </div>
        <div id="profile-panel-records" hidden={section !== 'records'}>
          {(visited.has('records') || section === 'records') && <ProfileGoalsAndCertifications />}
        </div>
        <div id="profile-panel-applications" hidden={section !== 'applications'}>
          {(visited.has('applications') || section === 'applications') && (
            <QueryBoundary>
              <ProfileApplications />
            </QueryBoundary>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-4 last:pb-0">
      <dt className="mb-1 text-14 text-muted">{label}</dt>
      <dd className="m-0 text-16 font-medium wrap-anywhere text-navy">{children}</dd>
    </div>
  )
}
