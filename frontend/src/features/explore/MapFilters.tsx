import { useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { Button, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { useTrainingStore } from '../training/state.ts'
import { CenterFilters, LocationRow, RadiusRow } from './Panels.tsx'
import type { Explore } from './useExplore.ts'

/**
 * The map's Filters button, at the top of its button column above Locate and zoom: Share my location (or a typed
 * place), the radius, region and province, and Scholarships, in one popover. Its badge counts the filters that are
 * on. A refused location opens it, so the learner sees why.
 */
export function MapFilters({
  explore,
  filters,
  active,
  tabletUp,
  className,
  style,
  children,
}: {
  explore: Explore
  filters: ComponentProps<typeof CenterFilters>
  /** How many filters are on: region, province, scholarships, a typed place, a radius other than Near me. */
  active: number
  tabletUp: boolean
  className?: string
  style?: CSSProperties
  /** Shown first in the popover: the guided layout's view toggles on a phone. */
  children?: ReactNode
}) {
  const copy = useCopy().explore.filters
  const [open, setOpen] = useState(false)
  // A location the browser refused (from Locate on the map, or the switch) opens the popover to say so.
  const locationError = useTrainingStore((state) => state.locationError)
  const [seenError, setSeenError] = useState(locationError)
  if (seenError !== locationError) {
    setSeenError(locationError)
    if (locationError) setOpen(true)
  }

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        aria-label={active ? copy.buttonActive(active) : copy.button}
        className={cx(
          'map-control grid size-10.5 cursor-pointer place-items-center rounded-12 border-0 bg-surface text-navy shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.12)]',
          'transition-[transform,background-color,color] duration-150 ease-out data-hovered:bg-soft data-pressed:bg-chip motion-safe:data-pressed:scale-95',
          'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
          'aria-expanded:bg-navy aria-expanded:text-surface',
          className,
        )}
        style={style}
      >
        <Icon name="sliders" size={18} />
        {active > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-fill px-1 text-11 leading-none font-bold text-white tabular-nums ring-2 ring-surface"
          >
            {active}
          </span>
        )}
      </Button>
      <Popover
        // Beside the button column from a tablet up; under it on a phone, where there's no room to its left.
        placement={tabletUp ? 'start top' : 'bottom end'}
        offset={10}
        className="w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-14 border border-border bg-surface shadow-[0_6px_14px_-4px_rgb(var(--track-shadow-rgb)/0.14),0_18px_40px_-10px_rgb(var(--track-shadow-rgb)/0.34)] outline-none motion-safe:data-entering:animate-pop"
      >
        <Dialog className="flex flex-col outline-none" aria-label={copy.heading}>
          {({ close }) => (
            <>
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                <Heading slot="title" className="m-0 text-15 font-bold text-navy">
                  {copy.heading}
                </Heading>
                <Button
                  onPress={close}
                  aria-label={copy.close}
                  className="-mr-3 grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted transition-colors data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:bg-soft data-hovered:text-navy"
                >
                  <Icon name="close" size="1rem" />
                </Button>
              </div>
              <div className="flex flex-col px-4 pb-3 [&>*+*]:mt-3 [&>*+*]:border-t [&>*+*]:border-rule [&>*+*]:pt-3">
                {children}
                <LocationRow explore={explore} />
                <RadiusRow explore={explore} />
                <CenterFilters {...filters} />
              </div>
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
