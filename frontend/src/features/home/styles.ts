// What Home's sections share (after classic/landing.css): the page width, eyebrows, buttons, section heads, cards
// and the navy bands. Their colors are Home's own (styles/home.css).
import { cx } from '../../lib/style.ts'

const eyebrowType = 'font-text text-home-xs leading-[1.2] font-bold tracking-[0.14em] uppercase'

export const ui = {
  wrap: 'mx-auto w-full max-w-home px-home-gutter',
  eyebrow: cx(eyebrowType, 'text-home-blue')!,
  /** An eyebrow on a navy band. */
  eyebrowOnBand: cx(eyebrowType, 'text-home-band-accent')!,
  eyebrowType,
  section: 'relative py-[clamp(4.5rem,10vw,8rem)]',
  sectionHead: 'max-w-[46rem]',
  sectionTitle: 'mt-[0.8rem] text-home-2xl leading-[1.04] font-[750] tracking-[-0.025em]',
  sectionLead: 'mt-[1.1rem] max-w-[38rem] text-home-lg leading-[1.55]',
  sectionCta: 'mt-[1.8rem]',
  card: 'rounded-22 bg-home-surface p-[clamp(1.1rem,2.4vw,1.6rem)] shadow-[var(--home-shadow),0_0_0_1px_var(--home-border)]',
  /** A card's small label. Its last part (a note on the right, or the label's only part) is in plain type. */
  cardLabel:
    'flex justify-between gap-4 text-[0.78rem] font-bold tracking-[0.1em] text-home-muted uppercase [&_span:last-child]:font-semibold [&_span:last-child]:tracking-normal [&_span:last-child]:normal-case',
  /** A navy band: its headings are white. */
  band: 'overflow-hidden bg-[radial-gradient(90%_80%_at_10%_0%,var(--home-band-2),var(--home-band)_65%)] text-home-band-body [&_:is(h2,h3)]:text-white',
}

type HomeButton = 'signal' | 'ghost' | 'outline' | 'outlineOnBand'

const buttonLooks: Record<HomeButton, string> = {
  signal:
    'bg-[#f5b83d] text-[#0c2152] shadow-[0_10px_24px_-12px_#f5b83d] hovered:-translate-y-0.5 hovered:shadow-[0_16px_30px_-12px_#f5b83d]',
  ghost:
    'bg-[rgb(255_255_255/0.08)] text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.28)] hovered:bg-[rgb(255_255_255/0.14)]',
  outline:
    'bg-home-surface text-home-blue shadow-[inset_0_0_0_1.5px_var(--home-blue)] hovered:bg-home-blue-soft',
  outlineOnBand:
    'bg-transparent text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4)] hovered:bg-[rgb(255_255_255/0.1)]',
}

/** Home's buttons: links styled as buttons, and the closing goal box's submit. Their arrow nudges on hover. */
export function homeButton(look: HomeButton): string {
  return cx(
    'inline-flex min-h-12 cursor-pointer items-center gap-[0.55rem] rounded-14 border-0 px-[1.3rem] py-3 font-text text-16 leading-none font-bold no-underline',
    '[transition:translate_0.25s_var(--ease-home),box-shadow_0.25s_var(--ease-home),background-color_0.2s]',
    '[&_svg]:size-4.5 [&_svg]:transition-[translate] [&_svg]:duration-250 [&_svg]:ease-home hovered:[&_svg]:translate-x-[3px]',
    buttonLooks[look],
  )!
}
