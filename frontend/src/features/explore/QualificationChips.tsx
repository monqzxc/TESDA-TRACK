import { ToggleButton } from 'react-aria-components'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import type { Match } from '../finder/api.ts'
import { MAX_PICKED } from './explore.ts'
import { useExploreStore } from './useExplore.ts'

/**
 * The search's qualifications under the search box, to pick from (optional): those picked narrow the map and the
 * results, and are compared side by side. Nothing to pick between with one match, or when the learner chose the
 * qualification from the library.
 */
export function QualificationChips({
  matches,
  chosen,
  className,
}: {
  matches: readonly Match[]
  chosen?: boolean
  className?: string
}) {
  const copy = useCopy().explore.compare
  const picked = useExploreStore((state) => state.picked)
  const togglePicked = useExploreStore((state) => state.togglePicked)
  if (chosen || matches.length < 2) return null
  const full = picked.length >= MAX_PICKED
  return (
    <div className={cx('pointer-events-auto min-w-0', className)}>
      <p className="m-0 mb-1.5 text-12 font-semibold text-muted">{copy.narrowLabel}</p>
      <div
        role="group"
        aria-label={copy.narrowLabel}
        // One row that scrolls sideways inside itself: the page never scrolls sideways on a phone.
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {matches.map(({ qualification }) => {
          const on = picked.includes(qualification.code)
          return (
            <ToggleButton
              key={qualification.code}
              isSelected={on}
              isDisabled={full && !on}
              onChange={() => togglePicked(qualification.code)}
              className={cx(
                'inline-flex min-h-9 flex-none cursor-pointer items-center rounded-full border px-3 text-13 leading-tight font-semibold whitespace-nowrap',
                'transition-[background-color,border-color] duration-200 ease-out',
                'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
                'border-border bg-surface text-navy data-hovered:border-hover-border',
                'data-selected:border-navy data-selected:bg-navy data-selected:text-surface',
                'data-disabled:cursor-not-allowed data-disabled:opacity-50',
              )}
            >
              {qualification.name}
            </ToggleButton>
          )
        })}
      </div>
      {full && <p className="m-0 mt-1 text-12 text-muted">{copy.maxHint}</p>}
    </div>
  )
}
