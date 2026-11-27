import { ToggleButton, Tooltip, TooltipTrigger } from 'react-aria-components'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import type { View } from './ExplorePage.tsx'

/** The guided layout's plain icon buttons: 40px, one thin border, no shadow; navy when on. */
export const plainIcon = cx(
  'grid size-10 cursor-pointer place-items-center rounded-12 border border-border bg-surface text-navy',
  'transition-colors duration-150 data-hovered:bg-soft',
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
  'data-selected:border-navy data-selected:bg-navy data-selected:text-surface',
)

/**
 * Training, assessment and demand as three icon toggles: they only filter what the map shows. Pressing the one that
 * is on goes back to everything.
 */
export function ViewToggles({
  view,
  onView,
  vertical = true,
  className,
}: {
  view: View
  onView: (view: View) => void
  vertical?: boolean
  className?: string
}) {
  const copy = useCopy().explore.chips
  const toggles = [
    { view: 'training', label: copy.training, icon: 'learn' },
    { view: 'assessment', label: copy.assessment, icon: 'award' },
    { view: 'demand', label: copy.demand, icon: 'briefcase' },
  ] as const
  return (
    <div
      role="group"
      aria-label={copy.label}
      className={cx('flex gap-2', vertical ? 'flex-col' : 'flex-row', className)}
    >
      {toggles.map((toggle) => (
        <TooltipTrigger key={toggle.view} delay={300}>
          <ToggleButton
            aria-label={toggle.label}
            isSelected={view === toggle.view}
            onChange={(on) => onView(on ? toggle.view : 'all')}
            className={plainIcon}
          >
            <Icon name={toggle.icon} size={18} />
          </ToggleButton>
          <Tooltip
            placement={vertical ? 'start' : 'bottom'}
            offset={8}
            className="rounded-8 bg-navy px-2 py-1 text-12 font-semibold text-surface"
          >
            {toggle.label}
          </Tooltip>
        </TooltipTrigger>
      ))}
    </div>
  )
}
