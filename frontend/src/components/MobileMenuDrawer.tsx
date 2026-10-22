import { Button, Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { useCopy } from '../i18n/copy.ts'
import { Brand } from './Brand.tsx'
import { Icon } from './Icon.tsx'
import { SidebarContent } from './Nav.tsx'

export interface MobileMenuDrawerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  canManage?: boolean
  /** Called when a link is chosen: a link to the page already open doesn't change the address. */
  onNavigate: () => void
  /** The Menu button, where focus goes after a link to the page already open. */
  returnFocus: () => HTMLElement | null
}

/**
 * The phone menu's drawer: the sidebar over the page from the left edge, as a modal dialog. Focus stays inside while
 * it's open, Escape or a tap outside closes it, and closing returns focus to the Menu button. Its own chunk: React
 * Aria's dialog code brings its menus' code with it, which no page needs at first.
 */
export default function MobileMenuDrawer({
  isOpen,
  onOpenChange,
  isAdmin,
  canManage = false,
  onNavigate,
  returnFocus,
}: MobileMenuDrawerProps) {
  const en = useCopy()

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-100 bg-[rgb(var(--track-shadow-rgb)/0.45)] data-entering:animate-fade-in"
    >
      <Modal className="fixed top-0 left-0 h-dvh w-[min(20rem,88vw)] overflow-y-auto overscroll-contain border-r border-border bg-surface shadow-dialog data-entering:animate-slide-in">
        <Dialog
          aria-label={en.nav.menu}
          className="flex min-h-full flex-col px-4 pt-[1.1rem] pb-[max(1.5rem,env(safe-area-inset-bottom))] focus:outline-none"
        >
          <div className="flex shrink-0 items-start justify-between gap-2">
            <Brand />
            <Button
              slot="close"
              aria-label={en.nav.closeMenu}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-12 border border-border bg-surface text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:bg-soft"
            >
              <Icon name="close" size="1.4rem" />
            </Button>
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
