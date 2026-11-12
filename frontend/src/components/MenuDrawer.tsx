import { Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { useCopy } from '../i18n/copy.ts'
import { MenuButton, SidebarContent, SidebarTitle } from './Nav.tsx'

export interface MenuDrawerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  canManage?: boolean
  /** Called when a link is chosen: a link to the page already open doesn't change the address. */
  onNavigate: () => void
  /** The burger that opened it, where focus goes after a link to the page already open or after signing in. */
  returnFocus: () => HTMLElement | null
}

/**
 * The sidebar over the page from the left edge, as a modal dialog: the phone menu, and the Career Map's menu at every
 * width (it has no sidebar beside it). It slides in and back out, its burger spinning with it. Focus stays inside
 * while it's open, the burger, Escape or a tap outside closes it, and closing returns focus to the burger that opened
 * it. Its own chunk for the phone menu: React Aria's dialog code brings its menus' code with it, which no page needs
 * at first.
 */
export default function MenuDrawer({
  isOpen,
  onOpenChange,
  isAdmin,
  canManage = false,
  onNavigate,
  returnFocus,
}: MenuDrawerProps) {
  const en = useCopy()

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-100 bg-[rgb(var(--track-shadow-rgb)/0.45)] data-entering:animate-fade-in data-exiting:animate-fade-out"
    >
      <Modal className="group fixed top-0 left-0 h-dvh w-[min(17rem,85vw)] overflow-y-auto overscroll-contain bg-surface shadow-dialog data-entering:animate-slide-in data-exiting:animate-slide-out">
        <Dialog
          aria-label={en.nav.menu}
          className="flex min-h-full flex-col px-2 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none"
        >
          <div className="mb-2 flex shrink-0 items-center gap-1">
            <MenuButton
              slot="close"
              label={en.nav.closeMenu}
              iconClassName="group-data-entering:animate-menu-spin-in group-data-exiting:-rotate-180 group-data-exiting:duration-200"
            />
            <SidebarTitle onNavigate={onNavigate} />
          </div>
          <SidebarContent
            isAdmin={isAdmin}
            canManage={canManage}
            onNavigate={onNavigate}
            returnFocus={returnFocus}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
