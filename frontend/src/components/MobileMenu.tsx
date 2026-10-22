import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { useCopy } from '../i18n/copy.ts'
import { prefetch } from '../lib/prefetch.ts'
import { reloadPage } from '../lib/reload.ts'
import { Icon } from './Icon.tsx'
import { LoadBoundary } from './LoadBoundary.tsx'

/** Phone width, where the sidebar folds away behind the Menu button. The classes use the same one (max-md:). */
const PHONE = '(max-width: 768px)'

const loadDrawer = () => import('./MobileMenuDrawer.tsx')
const MobileMenuDrawer = lazy(loadDrawer)

/**
 * On phones, the sidebar opens over the page from the Menu button, as Streamlit's does (MobileMenuDrawer). The
 * drawer's code comes down once the page is idle on a phone, or at the first press.
 */
export function MobileMenu({
  isAdmin = false,
  canManage = false,
}: {
  isAdmin?: boolean
  canManage?: boolean
}) {
  const en = useCopy()

  const { pathname } = useLocation()
  const { notify } = useAuth()
  // The page the menu was opened on: going to another page closes it, by a link or by Back.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const isOpen = openOn === pathname
  const close = () => setOpenOn(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  // Once opened, the drawer stays in the page, so it can animate out and hand focus back as it closes.
  const [wanted, setWanted] = useState(false)
  const [failed, setFailed] = useState(false)

  // The drawer's code couldn't be downloaded: say so, and offer to reload.
  const sayUnavailable = () =>
    notify({
      tone: 'error',
      message: en.nav.menuUnavailable,
      action: { label: en.account.unavailable.retry, onPress: reloadPage },
    })

  // On a phone, the drawer will be wanted: fetch it once the page has settled.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia(PHONE).matches) return
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = idle(() => prefetch(loadDrawer))
    return () => cancel(handle)
  }, [])

  // Wider than a phone, the sidebar shows in the page, so the menu closes.
  useEffect(() => {
    if (!isOpen || typeof window.matchMedia !== 'function') return
    const phone = window.matchMedia(PHONE)
    const onChange = () => {
      if (!phone.matches) setOpenOn(null)
    }
    phone.addEventListener('change', onChange)
    return () => phone.removeEventListener('change', onChange)
  }, [isOpen])

  return (
    <>
      <Button
        ref={menuButton}
        data-tour="mobile-menu"
        className={
          'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-12 border border-border bg-surface py-[0.4rem] pr-[0.9rem] pl-[0.7rem] font-semibold text-navy ' +
          'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:bg-soft ' +
          // The sidebar shows in the page above phone width.
          'md:hidden'
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onHoverStart={() => prefetch(loadDrawer)}
        onPress={() => {
          if (failed) return sayUnavailable()
          setWanted(true)
          setOpenOn(pathname)
        }}
      >
        <Icon name="menu" size="1.4rem" />
        {en.nav.menu}
      </Button>
      {wanted && (
        <LoadBoundary
          fallback={null}
          onError={() => {
            setFailed(true)
            close()
            sayUnavailable()
          }}
        >
          <Suspense fallback={null}>
            <MobileMenuDrawer
              isOpen={isOpen}
              onOpenChange={(open) => setOpenOn(open ? pathname : null)}
              isAdmin={isAdmin}
              canManage={canManage}
              onNavigate={close}
              returnFocus={() => menuButton.current}
            />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  )
}
