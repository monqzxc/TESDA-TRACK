// What My Progress's sections share, after classic/app.py show_progress: the records in cards.
export const ui = {
  card: 'min-w-0 rounded-16 border border-border bg-surface px-5 py-[1.15rem]',
  /** A section's heading, which the card at the top can bring into view and focus (it shows no ring). */
  sectionHeading: 'mt-0 mb-[0.6rem] scroll-mt-4 text-[1.3rem] text-navy focus:outline-none',
  muted: 'm-0 text-14 leading-[1.55] wrap-anywhere text-muted',
  empty:
    'mt-1 mb-3 rounded-12 border border-dashed border-dash bg-empty px-4 py-[0.85rem] text-14 text-muted',
  note: 'mt-[0.4rem] mb-0 rounded-10 bg-warn-bg px-3 py-[0.55rem] text-13 font-semibold text-warn-ink [&_a]:text-inherit',
  records: 'm-0 flex list-none flex-col gap-[0.6rem] p-0',
  record:
    'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-12 border border-border px-[0.9rem] py-3',
  recordBody: 'min-w-0 flex-[1_1_14rem]',
  recordTitle:
    'my-[0.1rem] flex flex-wrap items-center gap-x-[0.6rem] gap-y-[0.35rem] font-text text-15 font-bold tracking-normal wrap-anywhere text-navy',
  /** A score as a bar; its fill's width is --score percent. */
  bar: 'block h-2 flex-[0_1_8rem] overflow-hidden rounded-full bg-bar',
  barFill: 'block h-full w-[calc(var(--score)*1%)] rounded-[inherit] bg-blue',
}
