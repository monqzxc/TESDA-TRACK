import { useEffect, useState, type RefObject } from 'react'

const isHidden = () => document.visibilityState === 'hidden'

/**
 * Whether something that moves on its own should hold still: while its element is out of the window or the tab is
 * hidden, where nobody sees it, and while the learner's pointer or focus is on it, so it stays put for reading
 * (WCAG 2.2.2). Without IntersectionObserver the element counts as in the window.
 */
export function usePaused(ref: RefObject<HTMLElement | null>): boolean {
  const [outOfView, setOutOfView] = useState(false)
  const [hidden, setHidden] = useState(isHidden)
  const [pointedAt, setPointedAt] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const watch =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            setOutOfView(!entries[entries.length - 1].isIntersecting)
          })
        : null
    watch?.observe(element)
    const onVisibility = () => setHidden(isHidden())
    const onEnter = () => setPointedAt(true)
    const onLeave = () => setPointedAt(false)
    const onFocusIn = () => setFocused(true)
    const onFocusOut = (event: FocusEvent) => {
      // Moving between things inside it keeps it still.
      if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) {
        setFocused(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    element.addEventListener('pointerenter', onEnter)
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('focusin', onFocusIn)
    element.addEventListener('focusout', onFocusOut)
    return () => {
      watch?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      element.removeEventListener('pointerenter', onEnter)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('focusin', onFocusIn)
      element.removeEventListener('focusout', onFocusOut)
    }
  }, [ref])

  return outOfView || hidden || pointedAt || focused
}
