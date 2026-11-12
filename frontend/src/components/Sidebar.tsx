import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router'
import { useCopy } from '../i18n/copy.ts'
import { cx } from '../lib/style.ts'
import { MenuButton, SidebarContent, SidebarTitle } from './Nav.tsx'
import { useSidebarStore } from './sidebarState.ts'

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The app's sidebar, over the page from the left edge on every page and at every width: a burger opens it (the top
 * bar's, or the Career Map's search bar's), and it slides in over the dimmed page, its own burger spinning with it.
 * Its burger, Escape or a press on the dimmed page closes it, sliding back out, and focus goes back to the burger
 * that opened it. While it's open it's a modal dialog: focus stays inside and the page doesn't scroll.
 *
 * It stays in the page while closed, hidden (invisible and inert once it has slid out), so it slides both ways and
 * the account's own dialogs and menus keep their place in it. Signing in opens the dialog over it.
 */
export function Sidebar({ isAdmin, canManage }: { isAdmin: boolean; canManage: boolean }) {
  const en = useCopy()
  const open = useSidebarStore((state) => state.open)
  const { closeMenu } = useSidebarStore.getState()
  const { pathname } = useLocation()
  const closeButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Opening moves focus in, to the burger that closes it.
  useEffect(() => {
    if (open) closeButton.current?.focus()
  }, [open])

  // Another page (a link, or Back): it closes, and the new page's heading takes focus (useFocusOnNavigation).
  useEffect(() => {
    useSidebarStore.getState().closeMenu({ restoreFocus: false })
  }, [pathname])

  // The page doesn't scroll behind it.
  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = before
    }
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      closeMenu()
      return
    }
    // Tab from the last control comes round to the first, and Shift+Tab from the first to the last.
    if (event.key !== 'Tab' || !panel.current) return
    const controls = [...panel.current.querySelectorAll<HTMLElement>(focusable)]
    const first = controls[0]
    const last = controls.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => closeMenu()}
        className={cx(
          'fixed inset-0 z-[95] bg-[rgb(var(--track-shadow-rgb)/0.45)] transition-[opacity,visibility] duration-200 motion-reduce:transition-none',
          open ? 'opacity-100 ease-out' : 'invisible opacity-0 ease-in',
        )}
      />
      <div
        ref={panel}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        aria-label={open ? en.nav.menu : undefined}
        inert={!open}
        onKeyDown={onKeyDown}
        className={cx(
          'fixed top-0 left-0 z-[95] flex h-dvh w-[min(17rem,85vw)] flex-col overflow-y-auto overscroll-contain bg-surface px-2 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-dialog motion-reduce:transition-none',
          // In: the phone menu's slide. Out: a little quicker, and hidden only once it has slid out.
          open
            ? 'translate-x-0 transition-[translate] duration-[240ms] ease-[cubic-bezier(0.2,0.75,0.2,1)]'
            : 'invisible -translate-x-full transition-[translate,visibility] duration-200 ease-in',
        )}
      >
        <div className="mb-2 flex shrink-0 items-center gap-1">
          <MenuButton
            ref={closeButton}
            label={en.nav.closeMenu}
            turned={!open}
            onPress={() => closeMenu()}
          />
          <SidebarTitle onNavigate={() => closeMenu()} />
        </div>
        <SidebarContent isAdmin={isAdmin} canManage={canManage} onNavigate={() => closeMenu()} />
      </div>
    </>
  )
}
