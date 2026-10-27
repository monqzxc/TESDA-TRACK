import type { Driver } from 'driver.js'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { useCopy, useLanguage } from '../../i18n/copy.ts'
import { useCurrentPage, type PageKey } from '../../lib/navigation.ts'

// React Aria intentionally omits aria-modal; include its dialog roles as well as native modals.
function openDialog(): HTMLElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"]:not(.driver-popover), [role="alertdialog"], dialog[open], [aria-modal="true"]:not(.driver-popover)',
    ),
  ).find((dialog) => {
    if (dialog.closest('[hidden], [inert]')) return false
    for (let element: HTMLElement | null = dialog; element; element = element.parentElement) {
      const style = window.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  })
}

/** One Help control in either layout. Changing page or account cancels a pending or active tour. */
export function GuidedHelp() {
  const language = useLanguage()
  const location = useLocation()
  const page = useCurrentPage()
  const { learner } = useAuth()
  return <PageHelp key={`${location.key}:${learner?.id ?? 'guest'}:${language}`} page={page} />
}

function PageHelp({ page }: { page: PageKey | undefined }) {
  const en = useCopy()

  const { notify } = useAuth()
  const trigger = useRef<HTMLButtonElement>(null)
  const tour = useRef<Driver | null>(null)
  const modalObserver = useRef<MutationObserver | null>(null)
  const mounted = useRef(false)
  const starting = useRef(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      modalObserver.current?.disconnect()
      tour.current?.destroy()
      tour.current = null
    }
  }, [])

  const start = async () => {
    if (starting.current || tour.current?.isActive()) return
    starting.current = true
    setPending(true)
    try {
      // The library, tour definitions and styles download only when help is requested.
      const { startTour } = await import('./startTour.ts')
      // A dialog may have opened while the chunk was downloading. Its focus scope takes priority.
      if (!mounted.current || openDialog()) return
      tour.current = startTour(page, () => {
        modalObserver.current?.disconnect()
        modalObserver.current = null
        tour.current = null
        queueMicrotask(() => {
          if (mounted.current && !openDialog()) {
            trigger.current?.focus({ preventScroll: true })
          }
        })
      })
      // A delayed privacy notice or account dialog can arrive after the tour has started.
      // Let that dialog take over and preserve the focus chosen by its own focus scope.
      modalObserver.current = new MutationObserver(() => {
        const modal = openDialog()
        if (!modal) return
        const focused = document.activeElement
        const returnTo = focused instanceof HTMLElement && modal.contains(focused) ? focused : modal
        tour.current?.destroy()
        returnTo.focus({ preventScroll: true })
      })
      modalObserver.current.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-modal', 'role', 'hidden'],
      })
    } catch {
      if (mounted.current) notify({ tone: 'error', message: en.help.unavailable })
    } finally {
      starting.current = false
      if (mounted.current) setPending(false)
    }
  }

  return (
    <aside
      aria-label={en.help.regionLabel}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40"
    >
      <button
        ref={trigger}
        type="button"
        data-tour="help"
        aria-label={en.help.buttonLabel}
        aria-busy={pending || undefined}
        aria-disabled={pending || undefined}
        title={en.help.buttonTitle}
        onClick={() => void start()}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-hover-border bg-surface px-4 py-2 text-15 font-bold text-blue shadow-[0_4px_18px_rgb(var(--track-shadow-rgb)/0.18)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus hovered:bg-soft"
      >
        <Icon name="lightbulb" size="1.25rem" />
        {pending ? en.help.loading : en.help.label}
      </button>
    </aside>
  )
}
