import type { ReactNode } from 'react'
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { cx } from '../lib/style.ts'
import { Icon } from './Icon.tsx'
import styles from './ModalDialog.module.css'

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
      className={styles.overlay}
    >
      <Modal className={cx(styles.modal, wide && styles.wide)}>
        <Dialog className={styles.dialog} role={role}>
          <Heading slot="title" className={styles.title}>
            {title}
          </Heading>
          <Button
            slot="close"
            className={styles.close}
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
