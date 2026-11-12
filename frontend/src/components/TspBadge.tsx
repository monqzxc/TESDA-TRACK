import { cx } from '../lib/style.ts'

/** TSP's mark, as on the map-first finder's screens: its letters on a navy disc. */
export function TspBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid flex-none place-items-center rounded-full bg-[#0b2a5b] font-bold tracking-[0.02em] text-white',
        small ? 'size-6 text-[0.5625rem]' : 'size-9 text-12',
      )}
    >
      TSP
    </span>
  )
}
