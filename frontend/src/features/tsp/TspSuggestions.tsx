import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
import type { Profile } from '../finder/store.ts'
import { trainingAddress } from '../training/address.ts'
import { hasSuggestionSignal, suggestionsQuery, type Suggestion } from './suggestions.ts'

/**
 * The entry page's head start: qualifications worked out from the TSP profile, before the learner types anything.
 *
 * A suggestion is not a match. The learner has given no goal here, so tapping one hands its qualification name to
 * the normal goal flow rather than jumping past it: the matches, readiness and recommendation steps then work from
 * a goal the learner chose, as they do for a typed one. Nothing shows for a profile with no skills behind it.
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
  if (!enabled) return null

  const found = suggestions.data?.suggestions ?? []
  const basis = suggestions.data?.basis ?? []

  return (
    <section className="tsp-suggestions" aria-labelledby="tsp-suggestions-heading">
      <div className="tsp-section-heading">
        <h2 id="tsp-suggestions-heading">{copy.heading}</h2>
        <p>{copy.lead}</p>
      </div>

      {suggestions.isPending ? (
        <p role="status" className="tsp-muted">
          {copy.loading}
        </p>
      ) : suggestions.isError && suggestions.data === undefined ? (
        <div className="tsp-card">
          <p role="alert">{copy.failed}</p>
          <button
            type="button"
            className="tsp-secondary"
            onClick={() => void suggestions.refetch()}
          >
            {copy.retry}
          </button>
        </div>
      ) : found.length === 0 ? (
        <p className="tsp-muted">{copy.none}</p>
      ) : (
        <>
          <ul className="tsp-suggestion-list">
            {found.map((suggestion) => (
              <SuggestionCard
                key={suggestion.qualification.code}
                suggestion={suggestion}
                onChoose={onChoose}
                busy={busy}
                copy={copy}
              />
            ))}
          </ul>
          {basis.length > 0 && (
            <details className="tsp-suggestion-basis">
              <summary>{copy.basis}</summary>
              <ul>
                {basis.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function SuggestionCard({
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
    <li className="tsp-card tsp-suggestion-card">
      <span className="tsp-suggestion-sector">{qualification.sector}</span>
      <h3>{qualification.name}</h3>
      <p className="tsp-match-reason">{reason}</p>
      <div className="tsp-match-actions">
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
