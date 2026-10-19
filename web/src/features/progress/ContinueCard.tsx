import { useId } from 'react'
import { Button } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import { useFinderStore } from '../finder/store.ts'
import type { Continuation } from './journey.ts'
import { resumeSession } from './resume.ts'
import styles from './ProgressPage.module.css'

const copy = en.progress.continue

/** The ids of the sections the card can lead to, on this page. */
export const SECTION_IDS = { pathways: 'my-pathways', applications: 'my-applications' } as const

/** Brings a section of this page into view, with focus on its heading. */
export function goToSection(id: string): void {
  const heading = document.getElementById(id)
  heading?.scrollIntoView({ block: 'start' })
  heading?.focus({ preventScroll: true })
}

/** The one next step for the learner, above their records (US-10). */
export function ContinueCard({ next }: { next: Continuation }) {
  const { learner } = useAuth()
  const navigate = useNavigate()
  const headingId = useId()

  let text: string
  let action
  const primary = cx(buttons.button, buttons.primary)
  switch (next.kind) {
    case 'pathway':
      text = copy.pathway(next.enrollment.pathway.title)
      action = (
        <Button className={primary} onPress={() => goToSection(SECTION_IDS.pathways)}>
          {copy.pathwayAction}
          <Icon name="arrowRight" />
        </Button>
      )
      break
    case 'application':
      text = copy.application(next.application.schedule.qualification.name)
      action = (
        <Button className={primary} onPress={() => goToSection(SECTION_IDS.applications)}>
          {copy.applicationAction}
          <Icon name="arrowRight" />
        </Button>
      )
      break
    case 'readiness':
      text = copy.readiness(next.name)
      action = (
        <Button
          className={primary}
          onPress={() => {
            if (!learner) return
            resumeSession(next.session, learner.id)
            useFinderStore.getState().choose(next.code)
            void navigate(paths.finderReadiness)
          }}
        >
          {copy.readinessAction}
          <Icon name="arrowRight" />
        </Button>
      )
      break
    case 'resume':
      text = copy.resume(next.session.query)
      action = (
        <Button
          className={primary}
          onPress={() => {
            if (!learner) return
            resumeSession(next.session, learner.id)
            void navigate(paths.finderMatches)
          }}
        >
          {copy.resumeAction}
          <Icon name="arrowRight" />
        </Button>
      )
      break
    case 'start':
      text = copy.start
      action = (
        <Link className={primary} to={paths.finder}>
          {copy.startAction}
          <Icon name="arrowRight" />
        </Link>
      )
      break
  }

  return (
    <section aria-labelledby={headingId} className={styles.continue}>
      <span className={styles.continueIcon}>
        <Icon name="route" size={26} />
      </span>
      <div className={styles.continueText}>
        <h2 id={headingId}>{copy.heading}</h2>
        <p>{text}</p>
      </div>
      {action}
    </section>
  )
}
