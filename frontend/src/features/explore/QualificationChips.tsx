import { ToggleButton } from 'react-aria-components'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { qualificationFacts, type QualificationFacts } from './qualificationFacts.ts'
import { useExploreStore, type Explore } from './useExplore.ts'

const MAX_JOBS = 2

/**
 * The search's matched qualifications under the search box. Selecting one (optional) narrows the map and the results
 * to it and explains it in a line or two below. Nothing to choose between with one match, or when the learner chose
 * the qualification from the library.
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
  if (explore.search?.chosen || matches.length < 2) return null
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

  return (
    <div className={cx('pointer-events-auto flex min-w-0 flex-col gap-1.5', className)}>
      <p className="m-0 text-12 text-muted">
        <span className="font-semibold text-navy">{copy.label}</span> · {copy.hint}
      </p>
      <div
        role="group"
        aria-label={copy.label}
        // One row that scrolls sideways inside itself: the page never scrolls sideways on a phone.
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {matches.map(({ qualification }) => (
          <ToggleButton
            key={qualification.code}
            isSelected={picked.includes(qualification.code)}
            onChange={() => togglePicked(qualification.code)}
            className={cx(
              'inline-flex min-h-9 flex-none cursor-pointer items-center rounded-full border px-3 text-13 leading-tight font-semibold whitespace-nowrap',
              'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.08)] transition-[background-color,border-color] duration-200 ease-out',
              'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
              'border-border bg-surface text-navy data-hovered:border-hover-border',
              'data-selected:border-navy data-selected:bg-navy data-selected:text-surface',
            )}
          >
            {qualification.name}
          </ToggleButton>
        ))}
      </div>
      {facts && <QualificationNote facts={facts} hasPassport={Boolean(explore.passport)} />}
    </div>
  )
}

/** The selected qualification in two short lines: what it leads to and involves near the learner, then their fit. */
function QualificationNote({ facts, hasPassport }: { facts: QualificationFacts; hasPassport: boolean }) {
  const copy = useCopy().explore.matched
  const { hours, jobs, trainNear, assessNear, fit } = facts
  const near = trainNear === null || assessNear === null ? null : trainNear + assessNear
  // Only what a source lists: a missing fact is left out rather than guessed.
  const parts = [
    jobs.length ? jobs.slice(0, MAX_JOBS).join(', ') : null,
    hours ? (hours.min === hours.max ? copy.hours(hours.min) : copy.hoursRange(hours.min, hours.max)) : null,
    near === null ? null : near === 1 ? copy.nearOne : copy.near(near),
  ].filter((part): part is string => part !== null)
  const step = hasPassport && fit ? copy.step[fit.next_step] : null

  return (
    <div
      role="note"
      aria-label={facts.name}
      className="rounded-12 border border-border border-l-4 border-l-navy bg-surface px-3 py-2 shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.08),0_6px_16px_-4px_rgb(var(--track-shadow-rgb)/0.18)]"
    >
      <p className="m-0 text-13 font-semibold text-navy">{facts.name}</p>
      <p className="m-0 text-13 leading-[1.45] text-ink">{parts.length ? parts.join(' · ') : copy.none}</p>
      {step && <p className="m-0 text-13 leading-[1.45] font-semibold text-blue">{step}</p>}
    </div>
  )
}
