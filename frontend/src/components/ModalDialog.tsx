import type { ReactNode } from 'react'
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { cx } from '../lib/style.ts'
import { Icon } from './Icon.tsx'

interface ModalDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  title: ReactNode
  /** The close button's name. */
  closeLabel: string
  children: ReactNode
  /** Wider than the sign-in dialog, for details. */
  wide?: boolean
  /** While something is being sent: the dialog can't be closed. */
  isPending?: boolean
  role?: 'dialog' | 'alertdialog'
}

/**
 * A dialog over the dimmed page (React Aria's Modal), after the sign-in dialog and Streamlit's st.dialog: its title,
 * a close button, and its content. Escape and the close button close it, and focus goes back to what opened it.
 * It's a centred card; on phones it fills the width, less the gutter.
 */
export function ModalDialog({
  isOpen,
  onOpenChange,
  title,
  closeLabel,
  children,
  wide = false,
  isPending = false,
  role = 'dialog',
}: ModalDialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!isPending}
      isKeyboardDismissDisabled={isPending}
      className="fixed inset-0 z-100 flex items-center justify-center bg-[rgb(var(--track-shadow-rgb)/0.45)] p-4 data-entering:animate-fade-in"
    >
      <Modal
        className={cx(
          'max-h-full overflow-y-auto overscroll-contain rounded-20 border border-border bg-surface shadow-dialog data-entering:animate-rise',
          wide ? 'w-[min(40rem,100%)]' : 'w-[min(30rem,100%)]',
        )}
      >
        <Dialog
          className="relative px-[1.6rem] pt-[1.6rem] pb-[1.4rem] focus:outline-none max-xs:px-[1.1rem] max-xs:pt-[1.2rem] max-xs:pb-[1.1rem]"
          role={role}
        >
          <Heading slot="title" className="mr-12 mb-[0.6rem] text-[1.4rem] text-navy">
            {title}
          </Heading>
          <Button
            slot="close"
            className={cx(
              'absolute top-4 right-4 grid size-11 cursor-pointer place-items-center rounded-12 border border-border bg-surface text-navy max-xs:top-3 max-xs:right-3',
              'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:bg-soft',
              'data-disabled:cursor-default data-disabled:opacity-50',
            )}
            aria-label={closeLabel}
            isDisabled={isPending}
          >
            <Icon name="close" size="1.25rem" />
          </Button>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
