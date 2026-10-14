import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogTrigger, Modal, ModalOverlay } from 'react-aria-components'
import { useLocation } from 'react-router'
import { en } from '../copy/en.ts'
import { Brand } from './Brand.tsx'
import { Icon } from './Icon.tsx'
import { SidebarContent } from './Nav.tsx'
import styles from './MobileMenu.module.css'

/** Phone width, where the sidebar folds away behind the Menu button. The CSS modules use the same breakpoint. */
const PHONE = '(max-width: 768px)'

/**
 * On phones, the sidebar opens over the page from the Menu button, as Streamlit's does. It's a modal dialog: focus
 * stays inside while it's open, Escape or a tap outside closes it, and closing returns focus to the button.
 */
export function MobileMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const { pathname } = useLocation()
  // The page the menu was opened on: going to another page closes it, by a link or by Back.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const isOpen = openOn === pathname
  const close = () => setOpenOn(null)
  const menuButton = useRef<HTMLButtonElement>(null)

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
    <DialogTrigger isOpen={isOpen} onOpenChange={(open) => setOpenOn(open ? pathname : null)}>
      <Button ref={menuButton} className={styles.menuButton}>
        <Icon name="menu" size="1.4rem" />
        {en.nav.menu}
      </Button>
      <ModalOverlay isDismissable className={styles.overlay}>
        <Modal className={styles.drawer}>
          <Dialog aria-label={en.nav.menu} className={styles.dialog}>
            <div className={styles.top}>
              <Brand />
              <Button slot="close" aria-label={en.nav.closeMenu} className={styles.close}>
                <Icon name="close" size="1.4rem" />
              </Button>
            </div>
            {/* A link to the page already open doesn't change the address, so it closes the menu itself. */}
            <SidebarContent
              isAdmin={isAdmin}
              onNavigate={close}
              returnFocus={() => menuButton.current}
            />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  )
}
