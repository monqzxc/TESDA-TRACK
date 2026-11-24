import type { ReactNode } from 'react'
import { Button, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components'
import { useCopy } from '../i18n/copy.ts'
import { cx } from '../lib/style.ts'
import { Icon } from './Icon.tsx'

/**
 * Background a reader needs only now and then (how a ranking works, where travel times come from, that a result is a
 * suggestion), folded behind a small "i" button instead of sitting on screen as a paragraph. `label` names the button
 * and heads the popover; with `showLabel` it is also written beside the icon.
 */
export function InfoPopover({
  label,
  paragraphs,
  showLabel = false,
  className,
  children,
}: {
  label: string
  paragraphs: readonly string[]
  showLabel?: boolean
  className?: string
  /** Shown after the paragraphs, such as a link to the source. */
  children?: ReactNode
}) {
  const closeLabel = useCopy().account.close
  return (
    <DialogTrigger>
      <Button
        aria-label={showLabel ? undefined : label}
        className={cx(
          // Amber marks every "i" as a disclaimer (estimates, sample data, suggestions). No border, ring or fill
          // behind the disc: only the keyboard focus outline is drawn around it.
          'inline-flex flex-none cursor-pointer appearance-none items-center gap-1 rounded-full border-0 bg-transparent text-12 font-semibold text-[#d97706] shadow-none outline-none ring-0 transition-colors hover:text-[#b45309] data-pressed:text-[#b45309] data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
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
      {/* Set apart from the page in the amber of its "i", so it reads as a note laid over the screen, not part of it. */}
      <Popover
        placement="bottom end"
        offset={6}
        className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-12 border border-[#d97706]/45 bg-warn-bg shadow-[0_14px_36px_-6px_rgb(var(--track-shadow-rgb)/0.45)] outline-none"
      >
        <Dialog className="relative flex flex-col gap-2 border-l-4 border-[#d97706] py-3.5 pr-11 pl-4 outline-none">
          {({ close }) => (
            <>
              <Heading slot="title" className="m-0 text-14 leading-[1.35] font-bold text-warn-ink">
                {label}
              </Heading>
              {paragraphs.map((text) => (
                <p key={text} className="m-0 text-13 leading-[1.55] text-ink">
                  {text}
                </p>
              ))}
              {children}
              <Button
                onPress={close}
                aria-label={closeLabel}
                className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-warn-ink outline-none transition-colors data-hovered:bg-[#d97706]/15 data-pressed:bg-[#d97706]/25 data-focus-visible:outline-3 data-focus-visible:outline-focus"
              >
                <Icon name="close" size="1rem" />
              </Button>
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
