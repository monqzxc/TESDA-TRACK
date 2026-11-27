import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../lib/motion.ts'
import { cx } from '../../lib/style.ts'
import { FOCUS_SCALE, focusedOffset } from './dockOffset.ts'

// The guided layout's chat: a composer with a tray tucked behind its top edge (the cards, the centers, the
// conversation). Docked at the bottom while the learner looks at the map; focused, it grows a little and moves to
// the middle over a dimmed map (docs/superpowers/specs/2026-11-27-explore-guided-cards-design.md, "Layout").

export type DockMode = 'docked' | 'focused'

/** Focus: grow, then move. Dock: move back, then shrink. */
const GROW_MS = 120
const MOVE_MS = 320
const RETURN_MS = 280
/** A drag this far down on a phone's open tray docks it, as the old results sheet closed. */
export const DRAG_DOCK_PX = 48

type Phase = 'rest' | 'grow' | 'center' | 'return'

export function ChatDock({
  mode,
  onMode,
  line,
  tray,
  composer,
  phone,
  className,
  style,
  onHeight,
}: {
  mode: DockMode
  onMode: (mode: DockMode) => void
  /** The tray's one line while docked; also its header while open. */
  line: ReactNode
  tray: ReactNode
  composer: ReactNode
  phone: boolean
  className?: string
  style?: CSSProperties
  /** Hears the unit's height as it changes, for the room it takes over the map. */
  onHeight?: (height: number) => void
}) {
  const unit = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const heard = useRef(onHeight)
  const isOpen = useRef(mode === 'focused')
  useEffect(() => {
    heard.current = onHeight
    isOpen.current = mode === 'focused'
  })
  // The unit's docked place and size. offsetTop and offsetHeight ignore transforms, so the move is always worked
  // out from where it rests, even mid-move.
  const [box, setBox] = useState({ top: 0, height: 0 })
  const [viewport, setViewport] = useState(() => window.innerHeight)
  const [keyboard, setKeyboard] = useState(0)
  const [phase, setPhase] = useState<Phase>(mode === 'focused' ? 'center' : 'rest')
  const reduced = prefersReducedMotion()
  const focused = mode === 'focused'

  // A change of mode starts its move: grow (or go back) now, the second step on a timer below.
  const [seen, setSeen] = useState(focused)
  if (seen !== focused) {
    setSeen(focused)
    setPhase(focused ? (reduced ? 'center' : 'grow') : reduced ? 'rest' : 'return')
  }
  useEffect(() => {
    if (phase !== 'grow' && phase !== 'return') return
    const timer = window.setTimeout(
      () => setPhase(phase === 'grow' ? 'center' : 'rest'),
      phase === 'grow' ? GROW_MS : RETURN_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    const node = unit.current
    if (!node) return
    const measure = () => {
      setBox({ top: node.offsetTop, height: node.offsetHeight })
      setViewport(window.innerHeight)
      // The map keeps clear of the docked unit only: open, it floats over a dimmed map.
      if (!isOpen.current) heard.current?.(node.offsetHeight)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Pressing, focusing or typing in it opens it; Esc docks it and leaves focus where it is.
  useEffect(() => {
    const node = unit.current
    if (!node) return
    const open = () => {
      if (!focused) onMode('focused')
    }
    const focusIn = (event: FocusEvent) => {
      if (!node.contains(event.relatedTarget as Node | null)) open()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && focused) {
        event.stopPropagation()
        onMode('docked')
      }
    }
    node.addEventListener('pointerdown', open, true)
    node.addEventListener('focusin', focusIn)
    node.addEventListener('input', open)
    node.addEventListener('keydown', key)
    return () => {
      node.removeEventListener('pointerdown', open, true)
      node.removeEventListener('focusin', focusIn)
      node.removeEventListener('input', open)
      node.removeEventListener('keydown', key)
    }
  }, [focused, onMode])

  // A press anywhere outside docks it; a popover opened from it (the distance picker) is part of it.
  useEffect(() => {
    if (!focused) return
    const press = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target || unit.current?.contains(target) || target.closest('[role="dialog"]')) return
      onMode('docked')
    }
    document.addEventListener('pointerdown', press, true)
    return () => document.removeEventListener('pointerdown', press, true)
  }, [focused, onMode])

  // On a phone the keyboard takes the bottom of the screen: the bar rides on top of it.
  useEffect(() => {
    const visual = window.visualViewport
    if (!phone || !visual) return
    const update = () =>
      setKeyboard(Math.max(0, window.innerHeight - (visual.height + visual.offsetTop)))
    update()
    visual.addEventListener('resize', update)
    visual.addEventListener('scroll', update)
    return () => {
      visual.removeEventListener('resize', update)
      visual.removeEventListener('scroll', update)
    }
  }, [phone])

  const offset = focusedOffset({ height: viewport }, box)
  const transform = phone
    ? ''
    : phase === 'grow'
      ? `scale(${FOCUS_SCALE})`
      : phase === 'center'
        ? `translateY(${Math.round(offset)}px) scale(${FOCUS_SCALE})`
        : phase === 'return'
          ? `translateY(0px) scale(${FOCUS_SCALE})`
          : ''
  const transition = reduced
    ? 'opacity 150ms ease-out'
    : phase === 'grow'
      ? `transform ${GROW_MS}ms ease-out`
      : phase === 'center'
        ? `transform ${MOVE_MS}ms ease-in-out`
        : phase === 'return'
          ? `transform ${RETURN_MS}ms ease-in-out`
          : `transform ${GROW_MS}ms ease-out`

  const focus = () => {
    if (!focused) onMode('focused')
  }

  return (
    <>
      {focused && !phone && (
        <div
          aria-hidden="true"
          data-testid="chat-dock-scrim"
          className="fixed inset-0 z-[990] bg-[rgb(var(--track-shadow-rgb)/0.2)] motion-safe:animate-fade-in"
          onPointerDown={(event) => {
            // Only docks: the map under it doesn't get the press.
            event.preventDefault()
            event.stopPropagation()
            onMode('docked')
          }}
        />
      )}
      <div
        ref={unit}
        data-testid="chat-dock"
        data-mode={mode}
        // Open, above the map's buttons too (on a phone they would sit over the tray); docked, under them.
        className={cx(
          'pointer-events-auto flex flex-col',
          focused ? 'z-[1001]' : 'z-[995]',
          className,
        )}
        style={{
          ...style,
          transform: transform || undefined,
          transition,
          transformOrigin: 'bottom center',
          ['--dock-keyboard' as string]: `${keyboard}px`,
        }}
      >
        <div className="mx-6 -mb-4 flex min-h-0 flex-col rounded-t-20 bg-soft pb-4">
          <button
            type="button"
            aria-expanded={focused}
            className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-t-20 border-0 bg-transparent px-4 text-left text-13 font-semibold text-navy focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus"
            onClick={focus}
            onPointerDown={(event) => {
              if (phone) drag.current = event.clientY
            }}
            onPointerUp={(event) => {
              const start = drag.current
              drag.current = null
              if (phone && focused && start !== null && event.clientY - start >= DRAG_DOCK_PX)
                onMode('docked')
            }}
          >
            {line}
          </button>
          {/* Always there, so the cards and their scroll survive a dock; folded to nothing while docked. */}
          <div
            inert={!focused}
            className={cx(
              'grid min-h-0 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
              focused ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div
              data-dock-tray
              className={cx(
                'min-h-0 overflow-y-auto overscroll-contain px-3',
                // On a phone, what is left above the keyboard, the composer and the bottom margin.
                phone
                  ? 'max-h-[min(65dvh,calc(100dvh-var(--dock-keyboard,0px)-15rem))]'
                  : 'max-h-[calc(100dvh-16rem)]',
              )}
            >
              <div className="pb-3">{tray}</div>
            </div>
          </div>
        </div>
        <div className="relative rounded-22 border border-border bg-surface shadow-[0_18px_48px_-18px_rgb(var(--track-shadow-rgb)/0.35)]">
          {composer}
        </div>
      </div>
    </>
  )
}
