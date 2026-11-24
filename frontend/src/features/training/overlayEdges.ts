import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface OverlayEdges {
  /** How far a panel of the page reaches in over the map's left edge. */
  left: number
  /** How far the page's own bars reach down over the map's top edge. */
  top: number
  /** How far a card or sheet of the page reaches up over the map's bottom edge. */
  bottom: number
  /** How far a card of the page reaches in over the map's right edge, controls included. */
  right: number
}

const NONE: OverlayEdges = { left: 0, top: 0, bottom: 0, right: 0 }

/**
 * A page that floats panels, bars and cards over the map says how far they reach, on the map's wrapper:
 * --map-overlay-inset (from the left), --map-overlay-top, --map-overlay-bottom and --map-overlay-right. The map's own buttons, legend and
 * credits move clear of them in CSS; this reads the same lengths for the camera, again whenever the map's box
 * changes size or the wrapper's style does (a panel that opens, a card that grows as its content arrives).
 */
export function useOverlayEdges(shell: RefObject<HTMLElement | null>): OverlayEdges {
  const [edges, setEdges] = useState(NONE)
  useEffect(() => {
    const element = shell.current
    if (!element) return
    const read = () => {
      const style = getComputedStyle(element)
      const length = (name: string) => parseFloat(style.getPropertyValue(name)) || 0
      const next = {
        left: length('--map-overlay-inset'),
        top: length('--map-overlay-top'),
        bottom: length('--map-overlay-bottom'),
        right: length('--map-overlay-right'),
      }
      setEdges((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.bottom === next.bottom &&
        current.right === next.right
          ? current
          : next,
      )
    }
    read()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    resize?.observe(element)
    const wrapper = element.parentElement
    const restyle = typeof MutationObserver === 'undefined' ? null : new MutationObserver(read)
    if (wrapper) restyle?.observe(wrapper, { attributes: true, attributeFilter: ['style'] })
    return () => {
      resize?.disconnect()
      restyle?.disconnect()
    }
  }, [shell])
  return edges
}

/**
 * The other way round: where the map's status line ends, from the top of the map, for a page that floats a card
 * under it ("Around you"). 0 while there is no status line. Returns the ref for the line.
 */
export function useStatusReach(onReach: ((bottom: number) => void) | undefined) {
  const report = useRef(onReach)
  useEffect(() => {
    report.current = onReach
  }, [onReach])
  const observer = useRef<ResizeObserver | null>(null)
  useEffect(
    () => () => {
      observer.current?.disconnect()
      report.current?.(0)
    },
    [],
  )
  return useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) {
      report.current?.(0)
      return
    }
    const read = () => report.current?.(node.offsetTop + node.offsetHeight)
    read()
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(read)
      observer.current.observe(node)
    }
  }, [])
}
