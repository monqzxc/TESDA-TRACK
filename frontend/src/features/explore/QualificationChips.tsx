import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
      <ScrollRow label={copy.label}>
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
      </ScrollRow>
      {facts && <QualificationNote facts={facts} hasPassport={Boolean(explore.passport)} />}
    </div>
  )
}

const FADE = '2.5rem'

/**
 * One row that scrolls sideways inside itself (the page never scrolls sideways on a phone). The edge with more chips
 * past it fades out and carries a round arrow, so the learner sees the list goes on; the arrow scrolls it along.
 */
function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const el = row.current
    if (!el) return
    // A pixel of slack: fractional widths can leave the last scroll position just short of the end.
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setMore((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    const el = row.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    for (const child of el.children) observer?.observe(child)
    return () => {
      el.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [measure, children])

  const scrollBy = (direction: 1 | -1) => {
    const el = row.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: reduce ? 'auto' : 'smooth' })
  }

  const mask = `linear-gradient(to right, ${more.start ? 'transparent' : '#000'} 0, #000 ${more.start ? FADE : '0px'}, #000 calc(100% - ${more.end ? FADE : '0px'}), ${more.end ? 'transparent' : '#000'} 100%)`

  return (
    <div className="relative -mx-1 min-w-0">
      <div
        ref={row}
        role="group"
        aria-label={label}
        className="flex [scrollbar-width:thin] gap-1.5 overflow-x-auto px-1 pb-1"
        style={more.start || more.end ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        {children}
      </div>
      {more.start && <ScrollArrow side="start" onPress={() => scrollBy(-1)} />}
      {more.end && <ScrollArrow side="end" onPress={() => scrollBy(1)} />}
    </div>
  )
}

/** A pointer shortcut only: keyboard users reach every chip with Tab, which scrolls it into view. */
function ScrollArrow({ side, onPress }: { side: 'start' | 'end'; onPress: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onPress}
      className={cx(
        'absolute top-0 grid size-9 cursor-pointer place-items-center rounded-full border border-border bg-surface text-navy',
        'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.12),0_4px_10px_-2px_rgb(var(--track-shadow-rgb)/0.25)]',
        'transition-colors duration-200 ease-out hover:border-navy hover:bg-navy hover:text-surface',
        side === 'start' ? 'left-0' : 'right-0',
      )}
    >
      <svg
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={side === 'start' ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'} />
      </svg>
    </button>
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
