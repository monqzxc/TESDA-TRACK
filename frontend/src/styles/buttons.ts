// The pages' buttons and button-styled links, after the Streamlit app's button types (classic/styles.css): primary
// is filled blue, secondary outlined, tertiary a quiet text button, plus the finder's big pills and small chips.
// They work on React Aria's Button (data-hovered, data-pressed, data-disabled) and on links (:hover). Focus shows
// base.css's ring.
//
// Each variant sets its own colors and size, and the options replace a part outright (never stacked on top), so no
// two classes compete for the same property. Margins and alignment go after, as the caller's own classes.
import { cx } from '../lib/style.ts'

export type ButtonVariant = 'secondary' | 'primary' | 'tertiary' | 'pill' | 'chip'

export interface ButtonStyle {
  variant?: ButtonVariant
  /** Minimum height in pixels, in place of the variant's own (44, or 40 for tertiary and chip, 48 for pill). */
  height?: 36 | 38 | 44 | 48
  /** Font size in pixels, in place of 15 (14 for chip). */
  text?: 13 | 14
  /** Medium weight, in place of the variant's semibold or bold. */
  medium?: boolean
  /** Side padding of 1rem, in place of the variant's own. */
  snug?: boolean
  /** Full width. */
  wide?: boolean
  /** Drawn disabled whatever its state, for an element that isn't a button (the pager's ends). */
  inert?: boolean
  /** Drawn switched on, for a toggle that's selected (a saved center's bookmark): tinted, its icon filled. */
  on?: boolean
}

const shared =
  'inline-flex items-center justify-center gap-2 border leading-[1.3] text-center no-underline ' +
  'transition-[background,border-color,color] duration-150 ease-[ease] ' +
  '[&_svg]:flex-none [&_svg]:size-[1.2em] data-pressed:translate-y-px ' +
  'data-pending:cursor-progress data-pending:opacity-85'

const disabled =
  'data-disabled:border-border data-disabled:bg-disabled-bg data-disabled:text-disabled-ink ' +
  'data-disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg ' +
  'disabled:text-disabled-ink disabled:cursor-not-allowed'

const inertLook = 'border-border bg-disabled-bg text-disabled-ink cursor-not-allowed'

const onLook = 'border-hover-border bg-tint text-blue [&_svg_path]:fill-current'

const colors: Record<ButtonVariant, string> = {
  secondary: 'border-border bg-surface text-navy hovered:border-hover-border hovered:bg-soft',
  primary:
    'border-fill bg-fill text-white hovered:border-fill-hover hovered:bg-fill-hover hovered:text-white',
  tertiary:
    'border-transparent bg-transparent text-blue hovered:border-transparent hovered:bg-soft',
  pill:
    'border-pill-border bg-pill text-blue hovered:border-pill-hover-border hovered:bg-pill-hover ' +
    'hovered:text-pill-hover-ink',
  chip:
    'border-transparent bg-chip text-ink [&_svg]:text-blue hovered:border-chip-hover-border ' +
    'hovered:bg-chip-hover',
}

const heights = {
  36: 'min-h-9',
  38: 'min-h-[38px]',
  40: 'min-h-10',
  44: 'min-h-11',
  48: 'min-h-12',
} as const

const sizes: Record<ButtonVariant, { height: keyof typeof heights; rest: string; padX: string }> = {
  secondary: { height: 44, rest: 'rounded-12 py-2', padX: 'px-[1.1rem]' },
  primary: { height: 44, rest: 'rounded-12 py-2', padX: 'px-[1.1rem]' },
  tertiary: { height: 40, rest: 'rounded-12 py-2', padX: 'px-2' },
  // The finder's big example pills, a little smaller on phones.
  pill: {
    height: 48,
    rest: 'rounded-full py-[0.55rem] max-xs:min-h-11 max-xs:py-[0.45rem] max-xs:px-4',
    padX: 'px-[1.35rem]',
  },
  // Small grey chips, like the finder's sample goals.
  chip: { height: 40, rest: 'rounded-full py-[0.3rem]', padX: 'px-[0.95rem]' },
}

// Written out whole: Tailwind only generates the class names it finds in the source.
const textSizes = { 13: 'text-13', 14: 'text-14' } as const

const weights: Record<ButtonVariant, string> = {
  secondary: 'font-[650]',
  primary: 'font-[650]',
  tertiary: 'font-[650]',
  pill: 'font-bold',
  chip: 'font-medium',
}

/** The classes for a button or a button-styled link. */
export function button({
  variant = 'secondary',
  height,
  text,
  medium = false,
  snug = false,
  wide = false,
  inert = false,
  on = false,
}: ButtonStyle = {}): string {
  const size = sizes[variant]
  return cx(
    shared,
    inert ? inertLook : cx('cursor-pointer', on ? onLook : colors[variant], disabled),
    heights[height ?? size.height],
    size.rest,
    snug ? 'px-4' : size.padX,
    text ? textSizes[text] : variant === 'chip' ? 'text-14' : 'text-15',
    medium ? 'font-medium' : weights[variant],
    wide && 'w-full',
  )!
}
