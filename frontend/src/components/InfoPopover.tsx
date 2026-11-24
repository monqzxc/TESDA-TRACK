import type { ReactNode } from 'react'
import { Button, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components'
import { cx } from '../lib/style.ts'

/**
 * Background a reader needs only now and then (how a ranking works, where travel times come from, that a result is a
 * suggestion), folded behind a small "i" button instead of sitting on screen as a paragraph. `label` names the button
 * and heads the popover; with `showLabel` it is also written beside the icon.
 */
export function InfoPopover({
  label,
  paragraphs,
  showLabel = false,
  tone = 'muted',
  className,
  children,
}: {
  label: string
  paragraphs: readonly string[]
  showLabel?: boolean
  /** `warn` colors the button amber, for a disclaimer (estimates, sample data) rather than plain background. */
  tone?: 'muted' | 'warn'
  className?: string
  /** Shown after the paragraphs, such as a link to the source. */
  children?: ReactNode
}) {
  return (
    <DialogTrigger>
      <Button
        aria-label={showLabel ? undefined : label}
        className={cx(
          'inline-flex flex-none cursor-pointer items-center gap-1 rounded-full text-12 font-semibold outline-none transition-colors data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
          tone === 'warn'
            ? 'text-[#d97706] hover:text-[#b45309] data-pressed:text-[#b45309]'
            : 'text-muted hover:text-blue data-pressed:text-blue',
          showLabel ? 'min-h-8 px-1' : 'size-8 justify-center',
          className,
        )}
      >
        {/* A filled disc with the "i" cut out in the surface color, so it reads as one solid mark with no ring. */}
        <svg viewBox="0 0 24 24" width="1rem" height="1rem" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path
            d="M12 11v5.5M12 7.6v.4"
            className="stroke-surface"
            fill="none"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </svg>
        {showLabel && label}
      </Button>
      <Popover
        placement="bottom end"
        offset={6}
        className="w-[min(20rem,calc(100vw-2rem))] rounded-12 border border-border bg-surface p-3 shadow-[0_10px_28px_rgb(var(--track-shadow-rgb)/0.2)] outline-none"
      >
        <Dialog className="flex flex-col gap-1.5 outline-none">
          <Heading slot="title" className="m-0 text-13 font-bold text-navy">
            {label}
          </Heading>
          {paragraphs.map((text) => (
            <p key={text} className="m-0 text-13 leading-[1.5] text-ink">
              {text}
            </p>
          ))}
          {children}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
