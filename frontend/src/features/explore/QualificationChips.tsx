import { ToggleButton } from 'react-aria-components'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { qualificationFacts, type QualificationFacts } from './qualificationFacts.ts'
import { useExploreStore, type Explore } from './useExplore.ts'

const MAX_JOBS = 2

/**
 * The search's matched qualifications under the search box. Selecting one (optional) narrows the map and the results
 * to it and explains it in a line or two below. Shown even for a single match, so the learner still sees what the search found;
 * hidden only when the learner chose the qualification from the library.
 */
export function QualificationChips({
  explore,
  className,
}: {
  explore: Explore
  className?: string
}) {
  const copy = useCopy().explore.matched
  const picked = useExploreStore((state) => state.picked)
  const togglePicked = useExploreStore((state) => state.togglePicked)
  const matches = explore.allMatches
  if (explore.search?.chosen || matches.length === 0) return null
  const label = matches.length === 1 ? copy.labelOne : copy.label
  const selected = matches.find((match) => picked.includes(match.qualification.code))
  const [facts] = selected
    ? qualificationFacts({
        matches: [selected],
        centers: explore.centers,
        rangeKm: explore.rangeKm,
        hasReference: explore.reference !== null,
        fits: explore.fits,
        catalog: explore.catalog,
      })
    : []

  // The search's highest scoring match (the first on a tie), marked so the learner sees where to start.
  const best =
    matches.length > 1
      ? matches.reduce((top, match) => (match.score > top.score ? match : top)).qualification.code
      : null

  return (
    <div className={cx('pointer-events-auto flex min-w-0 flex-col gap-1.5', className)}>
      <p className="m-0 text-12 text-muted">
        <span className="font-semibold text-navy">{label}</span>{' '}
        <span className="ml-0.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-navy px-1.5 align-middle text-11 leading-none font-bold text-surface tabular-nums">
          {matches.length.toLocaleString()}
        </span>{' '}
        · {copy.hint}
      </p>
      {/* Every match on screen at once: the chips wrap onto more lines rather than scroll sideways. */}
      <div role="group" aria-label={label} className="flex min-w-0 flex-wrap gap-1.5">
        {matches.map(({ qualification }) => {
          const isBest = qualification.code === best
          return (
            <ToggleButton
              key={qualification.code}
              isSelected={picked.includes(qualification.code)}
              onChange={() => togglePicked(qualification.code)}
              className={cx(
                'group inline-flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-left text-13 leading-tight font-semibold',
                'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.08)] transition-[background-color,border-color,color] duration-200 ease-out',
                'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
                isBest
                  ? // The best match in green, like the app's "Strong match" tags, so it stands out from the rest.
                    'border-good-fill bg-good-bg text-good-ink data-hovered:brightness-95 data-pressed:brightness-90'
                  : // Blue tint and blue ink, like the app's other pressable pills, so the chips read as buttons, not tags.
                    'border-pill-border bg-pill text-blue data-hovered:border-pill-hover-border data-hovered:bg-pill-hover data-hovered:text-pill-hover-ink data-pressed:bg-pill-hover',
                isBest
                  ? 'data-selected:border-good-fill data-selected:bg-good-fill data-selected:text-white data-selected:brightness-100 data-selected:data-hovered:brightness-110'
                  : 'data-selected:border-fill data-selected:bg-fill data-selected:text-white data-selected:data-hovered:border-fill-hover data-selected:data-hovered:bg-fill-hover data-selected:data-hovered:text-white',
              )}
            >
              {isBest && (
                <span
                  className={cx(
                    'inline-flex flex-none items-center gap-1 rounded-full bg-good-fill px-1.5 py-0.5 text-11 leading-none font-bold text-white',
                    'group-data-selected:bg-white/20',
                  )}
                >
                  <svg
                    viewBox="0 0 20 20"
                    width="11"
                    height="11"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
                  </svg>
                  {copy.best}
                </span>
              )}
              <span className="min-w-0">{qualification.name}</span>
            </ToggleButton>
          )
        })}
      </div>
      {facts && <QualificationNote facts={facts} hasPassport={Boolean(explore.passport)} />}
    </div>
  )
}

/** The selected qualification in two short lines: what it leads to and involves near the learner, then their fit. */
function QualificationNote({
  facts,
  hasPassport,
}: {
  facts: QualificationFacts
  hasPassport: boolean
}) {
  const copy = useCopy().explore.matched
  const { hours, jobs, trainNear, assessNear, fit } = facts
  const near = trainNear === null || assessNear === null ? null : trainNear + assessNear
  // Only what a source lists: a missing fact is left out rather than guessed.
  const parts = [
    jobs.length ? jobs.slice(0, MAX_JOBS).join(', ') : null,
    hours
      ? hours.min === hours.max
        ? copy.hours(hours.min)
        : copy.hoursRange(hours.min, hours.max)
      : null,
    near === null ? null : near === 1 ? copy.nearOne : copy.near(near),
  ].filter((part): part is string => part !== null)
  const step = hasPassport && fit ? copy.step[fit.next_step] : null

  return (
    <div
      role="note"
      aria-label={facts.name}
      className="rounded-12 border border-l-4 border-border border-l-navy bg-surface px-3 py-2 shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.08),0_6px_16px_-4px_rgb(var(--track-shadow-rgb)/0.18)]"
    >
      <p className="m-0 text-13 font-semibold text-navy">{facts.name}</p>
      <p className="m-0 text-13 leading-[1.45] text-ink">
        {parts.length ? parts.join(' · ') : copy.none}
      </p>
      {step && <p className="m-0 text-13 leading-[1.45] font-semibold text-blue">{step}</p>}
    </div>
  )
}
