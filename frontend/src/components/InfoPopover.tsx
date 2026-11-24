import { Button, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components'
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
}: {
  label: string
  paragraphs: readonly string[]
  showLabel?: boolean
  className?: string
}) {
  return (
    <DialogTrigger>
      <Button
        aria-label={showLabel ? undefined : label}
        className={cx(
          'inline-flex flex-none cursor-pointer items-center gap-1 rounded-full text-12 font-semibold text-muted transition-colors hover:text-blue data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus data-pressed:text-blue',
          showLabel ? 'min-h-8 px-1' : 'size-8 justify-center',
          className,
        )}
      >
        <Icon name="info" size="1rem" />
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
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
