import { useId } from 'react'
import { ApiError } from '../api/errors.ts'
import { useCopy } from '../i18n/copy.ts'
import { Icon } from './Icon.tsx'

type ServiceUnavailableProps = {
  /** What failed. An ApiError's message is written for learners and is shown; any other error's is not. */
  error?: unknown
  onRetry: () => void
  /** 1 when this stands in for a whole page (a route error), 2 under the page's own heading. */
  headingLevel?: 1 | 2
}

// The Streamlit app's "We can't load TESDA Track right now" state (classic/portal/components.py), shown where it
// shows it: in place of a page whose data can't be loaded. Drawn after classic/styles.css's
// .st-key-service_unavailable, .service-state and .empty-icon.
export function ServiceUnavailable({ error, onRetry, headingLevel = 2 }: ServiceUnavailableProps) {
  const en = useCopy()
  const copy = en.unavailable

  const headingId = useId()
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const message = error instanceof ApiError ? error.message : undefined
  return (
    <section
      className="my-4 flex flex-col items-center rounded-18 border border-border bg-surface p-6 text-center max-xs:rounded-14 max-xs:p-[1.1rem]"
      aria-labelledby={headingId}
    >
      <span className="mb-[0.9rem] grid size-11.5 place-items-center rounded-13 bg-warn-bg text-warn-ink">
        <Icon name="cloud" size={23} />
      </span>
      {/* A page-level heading can take focus after a navigation, like a page's own h1. */}
      <Heading
        id={headingId}
        className="mb-[0.65rem] text-[1.4rem] text-navy focus:outline-none"
        tabIndex={headingLevel === 1 ? -1 : undefined}
      >
        {copy.heading}
      </Heading>
      <p className="mb-4 max-w-[620px] text-15 leading-[1.7] text-muted">{copy.body}</p>
      {message && (
        <p
          role="alert"
          className="mb-[1.2rem] max-w-[620px] rounded-12 bg-warn-bg px-4 py-3 text-15 text-warn-ink"
        >
          {message}
        </p>
      )}
      <button
        type="button"
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-12 border border-fill bg-fill px-[1.2rem] py-2 font-semibold text-white hovered:border-fill-hover hovered:bg-fill-hover"
        onClick={onRetry}
      >
        <Icon name="refresh" size="1.15em" />
        {copy.retry}
      </button>
    </section>
  )
}
