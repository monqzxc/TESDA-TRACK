// Skills Explorer, after classic/skills_bridge_view.py and its cards in classic/styles.css: the sentence box on a card,
// then the occupations two to a row, and the qualifications and an occupation's details as stacked cards.
import { cx } from '../../lib/style.ts'

/** A card's shape, without its border color (a chosen occupation's is blue). */
const cardFrame =
  'flex min-w-0 flex-col gap-[0.4rem] rounded-16 border bg-surface px-5 py-[1.15rem]'

export const ui = {
  cardFrame,
  card: cx(cardFrame, 'border-border')!,
  cardTitle: 'm-0 text-18 leading-[1.35] wrap-anywhere text-navy',
  muted: 'm-0 text-14 leading-[1.55] wrap-anywhere text-muted',
  text: 'm-0 text-15 leading-[1.5] wrap-anywhere text-ink',
  note: 'm-0 rounded-10 bg-warn-bg px-3 py-[0.55rem] text-13 font-semibold text-warn-ink [&_a]:text-inherit',
  level:
    'inline-flex items-center gap-[0.35rem] self-start rounded-full bg-tint px-[0.7rem] py-1 text-13 font-[650] text-blue',
  list: 'm-0 flex list-none flex-col gap-[0.85rem] p-0',
  /** A folded part of a card: its summary line opens it, and its chevron turns. */
  details: 'group mt-2 rounded-12 border border-border bg-surface',
  summary:
    'flex min-h-11 cursor-pointer list-none items-center gap-[0.6rem] px-[0.85rem] py-2 text-15 font-semibold text-navy [&::-webkit-details-marker]:hidden',
  summaryIcon: 'flex-none text-blue',
  chevron:
    'ml-auto flex-none text-muted transition-transform duration-200 ease-[ease] group-open:rotate-180',
  /** Skills to explore, as a plain table. */
  tableBox: 'mt-[0.6rem] overflow-x-auto',
  table: cx(
    'w-full border-collapse text-14',
    '[&_th]:border-b [&_th]:border-border [&_th]:px-[0.6rem] [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted',
    '[&_td]:border-b [&_td]:border-rule [&_td]:px-[0.6rem] [&_td]:py-[0.55rem] [&_td]:text-navy',
  )!,
  caption: 'mb-[0.4rem] text-left font-[650] text-navy',
}
