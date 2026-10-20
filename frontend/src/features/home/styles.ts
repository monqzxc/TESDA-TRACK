// What Home's sections share (after classic/landing.css): the page width, buttons, section heads, the example cards
// and the navy bands. Their colors are Home's own (styles/home.css).
import { cx } from '../../lib/style.ts'

export const ui = {
  wrap: 'mx-auto w-full max-w-home px-home-gutter',
  section: 'relative py-[clamp(5rem,11vw,9rem)]',
  sectionHead: 'max-w-[48rem]',
  sectionTitle: 'text-home-2xl leading-[1.02] font-[750] tracking-[-0.03em]',
  sectionLead: 'mt-5 max-w-[36rem] text-home-lg leading-[1.5]',
  sectionCta: 'mt-8',
  /**
   * An example card: a piece of the app itself (each carries data-ui), on a surface one tone step off the page,
   * with the app's own small labels.
   */
  card: 'rounded-20 bg-home-surface p-[clamp(1.1rem,2.4vw,1.6rem)]',
  /** A card's small label: what it is, in ink, and a note on the right. */
  cardLabel:
    'flex justify-between gap-4 text-14 font-semibold text-home-muted [&_span:first-child]:text-home-ink',
  /** A navy band: its headings are white. */
  band: 'overflow-hidden bg-home-band text-home-band-body [&_:is(h2,h3)]:text-white',
}

type HomeButton = 'signal' | 'ghost' | 'quiet'

// One fill each: signal yellow for the page's one action (Find my path), a tone step for the rest.
const buttonLooks: Record<HomeButton, string> = {
  signal: 'bg-[#f5b83d] text-[#0c2152] hovered:bg-[#f8c968]',
  /** On a navy band: a step lighter than the band. */
  ghost: 'bg-home-band-2 text-white hovered:bg-[color-mix(in_srgb,var(--home-band-2)_82%,#ffffff)]',
  /** On the page: a soft blue step. */
  quiet:
    'bg-home-blue-soft text-home-blue hovered:bg-[color-mix(in_srgb,var(--home-blue-soft)_86%,var(--home-blue))]',
}

/**
 * Home's buttons: links styled as buttons, and the closing goal box's submit. Flat and fully round, like the ends
 * of the logo's road. Their arrow nudges on hover, and they press in.
 */
export function homeButton(look: HomeButton): string {
  return cx(
    'inline-flex min-h-13 cursor-pointer items-center gap-[0.6rem] rounded-full border-0 px-6 py-[0.85rem] font-text text-home-base leading-none font-bold no-underline',
    '[transition:background-color_0.2s,scale_0.15s_var(--ease-home)] active:scale-97',
    '[&_svg]:size-4.5 [&_svg]:transition-[translate] [&_svg]:duration-250 [&_svg]:ease-home hovered:[&_svg]:translate-x-1',
    buttonLooks[look],
  )!
}
