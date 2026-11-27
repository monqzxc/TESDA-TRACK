/** How much bigger the chat dock is while focused. */
export const FOCUS_SCALE = 1.02
/** The focused dock's top never rises above this, clear of the map's top controls. */
export const TOP_CLEAR = 72

/**
 * The upward move, in px (0 or less), that puts the docked unit in the middle of the window, held at least TOP_CLEAR
 * from the top. `unit.top` is where the unit's top sits while docked.
 */
export function focusedOffset(window: { height: number }, unit: { top: number; height: number }): number {
  const centered = (window.height - unit.height) / 2 - unit.top
  return Math.min(0, Math.max(centered, TOP_CLEAR - unit.top))
}
