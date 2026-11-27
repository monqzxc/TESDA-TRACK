import { cx } from '../../../lib/style.ts'

/** The landing page's shared pieces: its width, its section rhythm and its two buttons. */
export const wrap = 'mx-auto w-full max-w-[1440px] px-[clamp(1.5rem,8.334vw,7.5rem)] max-sm:px-6'

export const section = 'py-[clamp(4rem,8.334vw,7.5rem)]'

export const kicker =
  'text-12 leading-4 font-semibold tracking-[0.08em] text-[#123e80] dark:text-[#a9caff] uppercase'

export const sectionTitle =
  'text-[clamp(2rem,3.056vw,2.75rem)] leading-[1.14] font-medium tracking-[-0.025em] [text-wrap:wrap]'

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
