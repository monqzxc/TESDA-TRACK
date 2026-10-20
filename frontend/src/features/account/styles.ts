// The account control, its menu and the delete dialog (AccountMenu, SignedInMenu, DeleteAccountDialog).
import { cx } from '../../lib/style.ts'

const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

// The control: a row in the sidebar like the page links (Nav's, after Streamlit's .st-key-sidebar_account), or a
// plain button in Home's top bar, which brings its own colors.
export const control = {
  sidebar: 'flex flex-col',
  header: 'inline-flex min-w-0',
}

export const accountButton = {
  sidebar: cx(
    'flex min-h-[54px] w-full cursor-pointer items-center gap-4 rounded-12 border border-border bg-surface px-[1.2rem] py-2 text-left text-16 leading-[1.3] font-medium text-navy [&_svg]:shrink-0',
    'data-hovered:border-hover-border data-hovered:bg-soft data-pressed:border-hover-border data-pressed:bg-soft',
    ring,
  ),
  header:
    'inline-flex min-h-11 max-w-[12rem] cursor-pointer items-center gap-[0.45rem] border-0 bg-transparent',
}

export const accountName = 'min-w-0 truncate'

/** The menu. */
export const menu = {
  popover:
    'max-w-[calc(100vw_-_32px)] min-w-[16rem] overflow-auto rounded-16 border border-border bg-surface shadow-[0_24px_48px_-16px_rgb(var(--track-shadow-rgb)/0.4)] data-entering:animate-pop',
  menu: 'p-[0.4rem] outline-none',
  section: 'flex flex-col',
  who: 'flex flex-col gap-[0.1rem] px-3 pt-[0.6rem] pb-3 wrap-anywhere',
  whoName: 'font-bold text-navy',
  whoEmail: 'text-14 text-muted',
  role: 'mt-[0.4rem] self-start rounded-full bg-chip px-[0.6rem] py-[0.1rem] text-13 font-semibold text-navy',
  /** "Your data & privacy", after the Streamlit panel's expander and its caption. */
  dataHeader: 'flex flex-col gap-[0.2rem] px-3 pt-[0.6rem] pb-2',
  dataHeading: 'text-14 font-bold text-navy',
  dataBody: 'max-w-[18rem] text-13 leading-[1.45] text-muted',
  item: cx(
    'flex min-h-11 cursor-pointer items-center rounded-10 px-3 py-2 font-medium text-navy outline-none',
    'data-focused:bg-soft data-hovered:bg-soft',
    'data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-focus data-focus-visible:outline-solid',
  ),
  separator: 'mx-[0.4rem] my-[0.35rem] h-px bg-border',
  settings: 'mx-[0.4rem] border-t border-border px-[0.6rem] pt-3 pb-[0.7rem]',
  settingsHeading: 'mt-0 mb-2 text-14 font-bold text-navy',
}

/** The delete dialog. */
const dialogButton =
  'inline-flex min-h-11.5 items-center justify-center rounded-12 border px-[1.1rem] py-[0.55rem] font-bold'

export const deleteDialog = {
  body: 'mb-4 text-ink',
  error: 'mt-4',
  actions: 'mt-[1.4rem] flex flex-wrap justify-end gap-[0.6rem]',
  cancel: cx(
    dialogButton,
    'cursor-pointer border-border bg-surface text-navy data-hovered:border-hover-border data-hovered:bg-soft',
    ring,
  ),
}

/** Delete: not blue, so it doesn't read as the way forward. */
export function deleteButton(isPending: boolean): string {
  return cx(
    dialogButton,
    'border-warn-ink bg-warn-bg text-warn-ink data-hovered:border-2 data-hovered:px-[calc(1.1rem_-_1px)]',
    'data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:bg-disabled-bg data-disabled:text-disabled-ink',
    ring,
    isPending ? 'cursor-progress' : 'cursor-pointer',
  )!
}
