// The account forms and dialogs, after the Streamlit app's text inputs, captions, primary buttons and st.dialog.
// Shared by the sign-in and registration forms (auth/), the dialog around them and the /sign-in page, and the
// account deletion dialog (features/account).
import { cx } from '../lib/style.ts'

const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

const notice = 'rounded-12 bg-warn-bg px-[0.9rem] py-[0.7rem] text-15 font-semibold text-warn-ink'

export const formStyle = {
  lead: 'mt-0 mb-[1.1rem] text-15 text-muted',
  /** Why the dialog opened, or what just happened. */
  message: cx('mt-0 mb-[1.1rem]', notice),
  form: 'flex flex-col gap-4',
  field: 'flex flex-col gap-[0.35rem]',
  label: 'text-15 font-semibold text-navy',
  // The ring is base.css's :focus-visible, which text inputs always show.
  input:
    'min-h-11.5 w-full rounded-12 border border-hover-border bg-surface px-[0.8rem] py-[0.55rem] text-16 text-navy ' +
    'placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-hovered:border-blue ' +
    'data-invalid:border-warn-ink',
  help: 'text-14 text-muted',
  /** Words as well as color say what's wrong (US-13). */
  fieldError: 'text-14 font-semibold text-warn-ink',
  error: cx('m-0', notice),

  /** The privacy notice and its consent. */
  privacy: 'rounded-12 border border-panel-border bg-panel px-4 py-[0.85rem]',
  privacyTitle: 'mt-0 mb-[0.3rem] text-14 font-bold text-navy',
  privacyText: 'm-0 text-14 leading-[1.55] text-ink',
  checkField: 'flex flex-col gap-[0.35rem]',
  /** A CheckboxButton; fields.tsx's CheckMark draws its box. */
  checkbox:
    'group flex cursor-pointer items-start gap-[0.7rem] text-15 leading-[1.4] font-semibold text-navy ' +
    'data-disabled:cursor-default data-disabled:opacity-60',
  box: cx(
    'mt-[0.05rem] grid size-5.5 shrink-0 place-items-center rounded-6 border-2 border-hover-border bg-surface text-white',
    'group-data-hovered:border-blue group-data-invalid:border-warn-ink group-data-selected:border-fill group-data-selected:bg-fill',
    'group-data-focus-visible:outline-3 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus',
  ),

  /** "New here? Create an account" and its way back. */
  switch: 'mt-[1.1rem] border-t border-border pt-4',
  textButton: cx(
    'min-h-11 cursor-pointer border-0 bg-transparent px-0 py-[0.4rem] font-bold text-blue underline underline-offset-3',
    'data-focus-visible:rounded-6 data-hovered:decoration-2',
    ring,
  ),
  note: 'mt-[0.6rem] mb-0 rounded-12 bg-soft px-[0.9rem] py-3 text-14 text-ink [&_strong]:text-navy',
}

/** The forms' filled blue button, dimmed while its request is on its way. */
export function submitButton(isPending: boolean): string {
  return cx(
    'mt-1 inline-flex min-h-12 items-center justify-center rounded-12 border border-fill bg-fill px-[1.2rem] py-[0.6rem] font-bold text-white',
    'data-hovered:border-fill-hover data-hovered:bg-fill-hover',
    ring,
    isPending ? 'cursor-progress opacity-85' : 'cursor-pointer',
  )!
}

/** The sign-in dialog's frame: a centred card over the dimmed page. On phones it fills the width, less the gutter. */
export const dialogStyle = {
  overlay:
    'fixed inset-0 z-100 flex items-center justify-center bg-[rgb(var(--track-shadow-rgb)/0.45)] p-4 data-entering:animate-fade-in',
  modal:
    'max-h-full w-[min(30rem,100%)] overflow-y-auto overscroll-contain rounded-20 border border-border bg-surface shadow-dialog data-entering:animate-rise',
  dialog:
    'relative px-[1.6rem] pt-[1.6rem] pb-[1.4rem] focus:outline-none max-xs:px-[1.1rem] max-xs:pt-[1.2rem] max-xs:pb-[1.1rem]',
  title: 'mr-12 mb-[0.4rem] text-24 text-navy',
  close: cx(
    'absolute top-4 right-4 grid size-11 cursor-pointer place-items-center rounded-12 border border-border bg-surface text-navy max-xs:top-3 max-xs:right-3',
    'data-hovered:border-hover-border data-hovered:bg-soft',
    ring,
  ),
}
