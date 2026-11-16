import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import type { Center } from './centers.ts'

/** Whether a center has no coordinates on file: it is listed, but with no pin, distance or directions (US-0014). */
export const unlocated = (center: Pick<Center, 'latitude' | 'longitude'>) =>
  center.latitude === null || center.longitude === null

/** The "Location not confirmed" tag on a center without coordinates (US-0014). */
export function NoLocationTag({ className }: { className?: string }) {
  const en = useCopy()
  return (
    <span
      className={cx(
        'inline-flex w-fit items-center gap-1 rounded-full bg-warn-bg px-2.5 py-0.5 text-12 leading-[1.5] font-semibold text-warn-ink',
        className,
      )}
    >
      <Icon name="pin" />
      {en.training.center.noLocation}
    </span>
  )
}
