import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import { Avatar } from './art.tsx'
import type { Journey } from './store.ts'
import { ownsSession, useSaveJourney } from './useJourneySession.ts'
import styles from './GoalSummary.module.css'

const copy = en.finder.summary

interface GoalSummaryProps {
  journey: Journey
  /** The qualification the learner is working on, saved with the journey. */
  code: string | null
  /** The session sync's state (useSessionSync). */
  sync: { saved: boolean; failed: boolean; retry: () => void }
}

/**
 * The submitted goal above steps 2 to 4, as typed (frontend/app.py show_goal_summary), with Change goal and whether
 * it's saved. A guest's Save to profile opens sign-in, then saves the journey as it is (US-02).
 */
export function GoalSummary({ journey, code, sync }: GoalSummaryProps) {
  const { learner } = useAuth()
  const requireAccount = useRequireAccount()
  const { save, pending } = useSaveJourney()
  const owned = ownsSession(learner, journey.sessionOwner) && journey.sessionId !== null

  let status
  if (owned && sync.failed) {
    status = (
      <>
        <span className={styles.unsaved}>{en.finder.save.syncFailed}</span>
        <Button className={cx(buttons.button, buttons.tertiary)} onPress={sync.retry}>
          <Icon name="refresh" />
          {copy.retry}
        </Button>
      </>
    )
  } else if (owned) {
    status = (
      <span className={styles.saved}>
        <Icon name="bookmark" />
        {copy.saved}
      </span>
    )
  } else {
    status = (
      <Button
        className={cx(buttons.button, buttons.tertiary)}
        isPending={pending}
        onPress={() => requireAccount(() => void save(code))}
      >
        <Icon name="bookmark" />
        {pending ? copy.saving : copy.save}
      </Button>
    )
  }

  return (
    <div className={styles.summary}>
      <div className={styles.goal}>
        <Avatar className={styles.avatar} />
        <div className={styles.text}>
          <p className={styles.label}>{copy.label}</p>
          <p className={styles.query}>{journey.query}</p>
        </div>
      </div>
      <div className={styles.actions}>
        <Link to={paths.finder} className={cx(buttons.button, buttons.tertiary)}>
          <Icon name="edit" />
          {copy.change}
        </Link>
        <div className={styles.status} aria-live="polite">
          {status}
        </div>
      </div>
    </div>
  )
}
