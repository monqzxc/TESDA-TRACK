/**
 * Whether focus is free to be put somewhere: it fell to the page itself because its element went away, or it's
 * still inside `closing`, a dialog on its way out. React Aria keeps a closed dialog on the page for one more render
 * (to play an exit animation), so focus is still inside it when the code that closed it runs. Anywhere else, focus
 * was moved on purpose and stays put.
 */
export function focusIsLost(closing?: Element | null): boolean {
  const active = document.activeElement
  if (!active || active === document.body) return true
  return closing ? closing.contains(active) : false
}

/** The focused element, unless focus is on the page itself. */
export function focusedElement(): HTMLElement | null {
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : null
}

/**
 * Puts focus on `target` after a dialog closes, unless focus has been moved on purpose meanwhile (focusIsLost).
 *
 * Call it from a useEffect after the render that closed the dialog, not a useLayoutEffect: while a React Aria modal
 * is open the rest of the page is inert, and focus can't go there. React Aria lifts that in an effect of the same
 * render, and React runs those clean-ups before any effect starts, so by then the page can take focus.
 */
export function returnFocus(
  target: HTMLElement | null | undefined,
  closing?: Element | null,
): void {
  if (target?.isConnected && focusIsLost(closing)) target.focus()
}
