import { useEffect, useId, type ReactNode, type Ref } from 'react'
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { Icon } from '../components/Icon.tsx'
import { en } from '../copy/en.ts'
import { loadSignedInMenu } from '../features/account/loaders.ts'
import { prefetch } from '../lib/prefetch.ts'
import { AccountForms } from './AccountForms.tsx'
import type { OpenSignInOptions, SignInView } from './useAuth.ts'
import styles from './SignInDialog.module.css'

/** An open sign-in dialog: which form, its message, and what happens after it closes. */
export interface SignInRequest extends Pick<OpenSignInOptions, 'onSignedIn' | 'returnFocus'> {
  /** Which opening of the dialog this is. It stays the same when the learner switches forms. */
  id: number
  view: SignInView
  message?: string
  defaultEmail?: string
}

interface SignInDialogProps {
  request: SignInRequest | null
  onChange: (request: SignInRequest) => void
  onClose: () => void
  /** Signed in from the forms of `request`, which may have closed while the sign-in was on its way. */
  onSignedIn: (request: SignInRequest) => void
  /** The dialog element while it's on the page, including the moment it takes to close. */
  dialogRef?: Ref<HTMLElement>
}

function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <Heading slot="title" className={styles.title}>
      {children}
    </Heading>
  )
}

/**
 * The Streamlit app's account dialog: sign in, or create an account. It's modal: focus moves in and stays inside
 * while it's open; Escape, a tap outside or Close dismisses it, even while a sign-in is on its way; and focus goes
 * back to what opened it (AuthProvider). Signing in here leaves the learner on the page they were on.
 */
export function SignInDialog({
  request,
  onChange,
  onClose,
  onSignedIn,
  dialogRef,
}: SignInDialogProps) {
  const messageId = useId()
  // Someone is about to sign in: fetch the account menu's code too.
  useEffect(() => prefetch(loadSignedInMenu), [])
  return (
    <ModalOverlay
      isOpen={request !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      isDismissable
      className={styles.overlay}
    >
      <Modal className={styles.modal}>
        <Dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-describedby={request?.message ? messageId : undefined}
        >
          <Button slot="close" aria-label={en.account.close} className={styles.close}>
            <Icon name="close" size="1.3rem" />
          </Button>
          {request && (
            <AccountForms
              view={request.view}
              message={request.message}
              messageId={messageId}
              defaultEmail={request.defaultEmail}
              onViewChange={(view, start) =>
                onChange({ ...request, view, message: start?.message, defaultEmail: start?.email })
              }
              onSignedIn={() => onSignedIn(request)}
              Heading={DialogTitle}
            />
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
