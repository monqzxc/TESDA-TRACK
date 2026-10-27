import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { Avatar } from './art.tsx'
import type { Journey } from './store.ts'
import { ownsSession, useSaveJourney } from './useJourneySession.ts'

interface GoalSummaryProps {
  journey: Journey
  /** The qualification the learner is working on, saved with the journey. */
  code: string | null
  /** The session sync's state (useSessionSync). */
  sync: { saved: boolean; failed: boolean; retry: () => void }
}

/**
 * The submitted goal above steps 2 to 4, as typed (classic/app.py show_goal_summary), with Change goal and whether
 * it's saved. A guest's Save to profile opens sign-in, then saves the journey as it is (US-02).
 * Drawn after classic/styles.css's .st-key-finder_goal_summary: the goal with a learner's avatar, and its actions.
 */
export function GoalSummary({ journey, code, sync }: GoalSummaryProps) {
  const en = useCopy()
  const copy = en.finder.summary

  const { learner, offersAccounts } = useAuth()
  const requireAccount = useRequireAccount()
  const { save, pending } = useSaveJourney()
  const owned = ownsSession(learner, journey.sessionOwner) && journey.sessionId !== null

  let status
  if (owned && sync.failed) {
    status = (
      <>
        <span className="text-14 font-semibold text-warn-ink">{en.finder.save.syncFailed}</span>
        <Button className={button({ variant: 'tertiary' })} onPress={sync.retry}>
          <Icon name="refresh" />
          {copy.retry}
        </Button>
      </>
    )
  } else if (owned) {
    status = (
      <span className="inline-flex items-center gap-[0.4rem] text-15 font-semibold text-good-ink">
        <Icon name="bookmark" />
        {copy.saved}
      </span>
    )
  } else if (offersAccounts) {
    status = (
      <Button
        className={button({ variant: 'tertiary' })}
        isPending={pending}
        onPress={() => requireAccount(() => void save(code))}
      >
        <Icon name="bookmark" />
        {pending ? copy.saving : copy.save}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-18 border border-border bg-surface py-[0.9rem] pr-5 pl-4 shadow-card">
      <div className="flex min-w-0 flex-[1_1_22rem] items-center gap-[1.1rem]">
        <Avatar className="size-17 shrink-0 max-xs:size-12" />
        <div className="min-w-0">
          <p className="m-0 text-11 leading-[1.6] font-bold tracking-[0.12em] text-ink uppercase">
            {copy.label}
          </p>
          <p className="mt-[0.15rem] mb-0 text-[1.1875rem] leading-[1.4] font-[650] wrap-anywhere text-navy max-xs:text-16">
            {journey.query}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-[0.6rem] gap-y-1">
        <Link to={paths.finder} className={button({ variant: 'tertiary' })}>
          <Icon name="edit" />
          {copy.change}
        </Link>
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l border-border pl-[0.6rem] max-xs:border-l-0 max-xs:pl-0"
          aria-live="polite"
        >
          {status}
        </div>
      </div>
    </div>
  )
}
