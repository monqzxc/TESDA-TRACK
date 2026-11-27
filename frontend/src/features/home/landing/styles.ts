import { cx } from '../../../lib/style.ts'

/** The landing page's shared pieces: its width, its section rhythm and its two buttons. */
export const wrap = 'mx-auto w-full max-w-[1180px] px-[clamp(16px,4vw,40px)]'

export const section = 'py-[clamp(4rem,9vw,7.5rem)]'

export const kicker =
  'text-12 font-bold tracking-[0.14em] text-(--l-muted) uppercase [font-feature-settings:"ss01"]'

export const sectionTitle =
  'mt-3 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] leading-[1.02] font-extrabold tracking-[-0.035em]'

/** Navy is for actions: the solid button. The quiet one is outlined in grey. */
export function landingButton(kind: 'solid' | 'quiet' = 'solid') {
  return cx(
    'group inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-3 text-15 font-bold whitespace-nowrap no-underline',
    'transition-[background-color,border-color,scale] duration-150 ease-out active:scale-97',
    kind === 'solid'
      ? 'border-0 bg-(--l-navy) text-white dark:text-[#0b1630] hovered:bg-(--l-navy-hover)'
      : 'border border-(--l-line) bg-(--l-surface) text-(--l-ink) hovered:border-(--l-faint)',
  )
}
