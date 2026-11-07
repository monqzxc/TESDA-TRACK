import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
import type { Profile } from '../finder/store.ts'
import { trainingAddress } from '../training/address.ts'
import { hasSuggestionSignal, suggestionsQuery, type Suggestion } from './suggestions.ts'

/** Whether the learner left the suggestions open, for this tab: coming back from a center list finds them as left. */
const OPEN_KEY = 'tesda-track.tsp-suggestions-open'

function readOpen(): boolean {
  try {
    return window.sessionStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function saveOpen(open: boolean) {
  try {
    if (open) window.sessionStorage.setItem(OPEN_KEY, 'true')
    else window.sessionStorage.removeItem(OPEN_KEY)
  } catch {
    // Not saved: the suggestions start folded next time.
  }
}

/**
 * The entry page's head start: qualifications worked out from the TSP profile, before the learner types anything.
 *
 * A suggestion is not a match. The learner has given no goal here, so tapping one hands its qualification name to
 * the normal goal flow rather than jumping past it: the matches, readiness and recommendation steps then work from
 * a goal the learner chose, as they do for a typed one. Nothing shows for a profile with no skills behind it.
 *
 * The goal box is the page's task, so the suggestions stay folded into one row above it until the learner opens
 * them: the row says how many there are, and the box stays on the first screen of a phone.
 */
export function TspSuggestions({
  profile,
  onChoose,
  busy = false,
}: {
  profile: Profile
  onChoose: (qualificationName: string) => void
  busy?: boolean
}) {
  const copy = useCopy().tspSuggestions
  const enabled = hasSuggestionSignal(profile)
  const suggestions = useQuery({ ...suggestionsQuery(profile), enabled })
  const [open, setOpen] = useState(readOpen)
  if (!enabled) return null

  const found = suggestions.data?.suggestions ?? []
  const basis = suggestions.data?.basis ?? []

  if (suggestions.isPending) {
    return (
      <Header copy={copy}>
        <p role="status" className="tsp-suggested-summary">
          {copy.loading}
        </p>
      </Header>
    )
  }
  if (suggestions.isError && suggestions.data === undefined) {
    return (
      <Header copy={copy}>
        <p role="alert" className="tsp-suggested-summary">
          {copy.failed}
        </p>
        <button
          type="button"
          className="tsp-suggested-retry"
          onClick={() => void suggestions.refetch()}
        >
          {copy.retry}
        </button>
      </Header>
    )
  }
  if (found.length === 0) {
    return (
      <Header copy={copy}>
        <p className="tsp-suggested-summary">{copy.none}</p>
      </Header>
    )
  }

  const toggle = () => {
    setOpen(!open)
    saveOpen(!open)
  }
  return (
    <Header
      copy={copy}
      toggle={{ open, onToggle: toggle }}
      panel={
        <div id="tsp-suggested-panel" className="tsp-suggested-panel" hidden={!open}>
          <ul className="tsp-suggested-list">
            {found.map((suggestion) => (
              <SuggestionRow
                key={suggestion.qualification.code}
                suggestion={suggestion}
                onChoose={onChoose}
                busy={busy}
                copy={copy}
              />
            ))}
          </ul>
          {basis.length > 0 && (
            <details className="tsp-suggested-basis">
              <summary>{copy.basis}</summary>
              <ul>
                {basis.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      }
    >
      <p id="tsp-suggested-summary" className="tsp-suggested-summary">
        {copy.count(found.length)}
      </p>
    </Header>
  )
}

/**
 * The section's one row: its heading, and a line saying what's in it. With suggestions to show, the heading is the
 * accordion's button (the WAI-ARIA pattern: a button inside the heading), and the whole row opens and closes it.
 */
function Header({
  copy,
  toggle,
  panel,
  children,
}: {
  copy: ReturnType<typeof useCopy>['tspSuggestions']
  toggle?: { open: boolean; onToggle: () => void }
  panel?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="tsp-card tsp-suggested"
      aria-labelledby="tsp-suggested-heading"
      data-open={toggle?.open ?? undefined}
    >
      <div className="tsp-suggested-header">
        <span className="tsp-suggested-icon" aria-hidden="true">
          <Icon name="sparkle" size="18px" />
        </span>
        <h2 id="tsp-suggested-heading">
          {toggle ? (
            <button
              type="button"
              aria-expanded={toggle.open}
              aria-controls="tsp-suggested-panel"
              aria-describedby="tsp-suggested-summary"
              onClick={toggle.onToggle}
            >
              {copy.heading}
              <Icon name="chevron" size="20px" className="tsp-suggested-chevron" />
            </button>
          ) : (
            copy.heading
          )}
        </h2>
        {children}
      </div>
      {panel}
    </section>
  )
}

function SuggestionRow({
  suggestion,
  onChoose,
  busy,
  copy,
}: {
  suggestion: Suggestion
  onChoose: (qualificationName: string) => void
  busy: boolean
  copy: ReturnType<typeof useCopy>['tspSuggestions']
}) {
  const { qualification, reason } = suggestion
  return (
    <li className="tsp-suggested-item">
      <h3>{qualification.name}</h3>
      <p className="tsp-suggested-reason">{reason}</p>
      <div className="tsp-suggested-actions">
        <button
          type="button"
          className="tsp-primary"
          disabled={busy}
          onClick={() => onChoose(qualification.name)}
        >
          {copy.choose}
        </button>
        <Link
          className="tsp-secondary"
          to={trainingAddress({ qualifications: [qualification.code] }).replace(
            paths.training,
            paths.tspTraining,
          )}
        >
          {copy.centers}
        </Link>
      </div>
    </li>
  )
}
