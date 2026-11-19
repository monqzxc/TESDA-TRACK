import { cx } from '../lib/style.ts'

/** A small spinning ring in the current text color, for a request on its way. Hidden from screen readers. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="spinner"
      className={cx(
        'inline-block size-4 flex-none rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin',
        className,
      )}
    />
  )
}
