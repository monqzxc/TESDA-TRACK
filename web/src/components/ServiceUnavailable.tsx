import { useId } from 'react'
import { ApiError } from '../api/errors.ts'
import { en } from '../copy/en.ts'
import { Icon } from './Icon.tsx'
import styles from './ServiceUnavailable.module.css'

const copy = en.unavailable

type ServiceUnavailableProps = {
  /** What failed. An ApiError's message is written for learners and is shown; any other error's is not. */
  error?: unknown
  onRetry: () => void
  /** 1 when this stands in for a whole page (a route error), 2 under the page's own heading. */
  headingLevel?: 1 | 2
}

// The Streamlit app's "We can't load TESDA Track right now" state (frontend/portal/components.py), shown where it
// shows it: in place of a page whose data can't be loaded.
export function ServiceUnavailable({ error, onRetry, headingLevel = 2 }: ServiceUnavailableProps) {
  const headingId = useId()
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const message = error instanceof ApiError ? error.message : undefined
  return (
    <section className={styles.state} aria-labelledby={headingId}>
      <span className={styles.icon}>
        <Icon name="cloud" size={23} />
      </span>
      {/* A page-level heading can take focus after a navigation, like a page's own h1. */}
      <Heading
        id={headingId}
        className={styles.heading}
        tabIndex={headingLevel === 1 ? -1 : undefined}
      >
        {copy.heading}
      </Heading>
      <p className={styles.body}>{copy.body}</p>
      {message && (
        <p role="alert" className={styles.message}>
          {message}
        </p>
      )}
      <button type="button" className={styles.retry} onClick={onRetry}>
        <Icon name="refresh" size="1.15em" />
        {copy.retry}
      </button>
    </section>
  )
}
