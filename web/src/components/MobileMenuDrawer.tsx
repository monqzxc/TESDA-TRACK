import { Button, Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { en } from '../copy/en.ts'
import { Brand } from './Brand.tsx'
import { Icon } from './Icon.tsx'
import { SidebarContent } from './Nav.tsx'
import styles from './MobileMenu.module.css'

export interface MobileMenuDrawerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  /** Called when a link is chosen: a link to the page already open doesn't change the address. */
  onNavigate: () => void
  /** The Menu button, where focus goes after a link to the page already open. */
  returnFocus: () => HTMLElement | null
}

/**
 * The phone menu's drawer: the sidebar over the page, as a modal dialog. Focus stays inside while it's open, Escape
 * or a tap outside closes it, and closing returns focus to the Menu button. Its own chunk: React Aria's dialog code
 * brings its menus' code with it, which no page needs at first.
 */
export default function MobileMenuDrawer({
  isOpen,
  onOpenChange,
  isAdmin,
  onNavigate,
  returnFocus,
}: MobileMenuDrawerProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={styles.overlay}
    >
      <Modal className={styles.drawer}>
        <Dialog aria-label={en.nav.menu} className={styles.dialog}>
          <div className={styles.top}>
            <Brand />
            <Button slot="close" aria-label={en.nav.closeMenu} className={styles.close}>
              <Icon name="close" size="1.4rem" />
            </Button>
          </div>
          <SidebarContent isAdmin={isAdmin} onNavigate={onNavigate} returnFocus={returnFocus} />
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
