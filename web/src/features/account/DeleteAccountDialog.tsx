import { useId, useState, type Ref } from 'react'
import {
  Button,
  CheckboxButton,
  CheckboxField,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components'
import { CheckMark, failureMessage } from '../../auth/fields.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { en } from '../../copy/en.ts'
import formStyles from '../../auth/forms.module.css'
import dialogStyles from '../../auth/SignInDialog.module.css'
import styles from './AccountMenu.module.css'

const copy = en.account.deleteDialog

interface DeleteAccountDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** The account is about to go: the account menu will give way to "Sign in". */
  onDeleting: () => void
  /** Deleting failed: the account is still there. */
  onKept: () => void
  /** The dialog element while it's on the page, including the moment it takes to close. */
  dialogRef?: Ref<HTMLElement>
}

/**
 * Delete my account, confirmed inside the page as in the Streamlit app: the learner ticks "I understand this
 * permanently deletes my account and saved records." before the button works. Once they've pressed it, the dialog
 * stays until the API answers (Escape and a tap outside do nothing), so a failure is always seen.
 */
export function DeleteAccountDialog({
  isOpen,
  onOpenChange,
  onDeleting,
  onKept,
  dialogRef,
}: DeleteAccountDialogProps) {
  const bodyId = useId()
  const [isPending, setPending] = useState(false)
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!isPending}
      isKeyboardDismissDisabled={isPending}
      className={dialogStyles.overlay}
    >
      <Modal className={dialogStyles.modal}>
        <Dialog
          ref={dialogRef}
          role="alertdialog"
          aria-describedby={bodyId}
          className={dialogStyles.dialog}
        >
          <DeleteAccountForm
            bodyId={bodyId}
            isPending={isPending}
            onPendingChange={setPending}
            onDeleting={onDeleting}
            onKept={onKept}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}

interface DeleteAccountFormProps extends Pick<DeleteAccountDialogProps, 'onDeleting' | 'onKept'> {
  bodyId: string
  isPending: boolean
  onPendingChange: (isPending: boolean) => void
}

// Inside the dialog, so the tick and any error start afresh each time it opens.
function DeleteAccountForm({
  bodyId,
  isPending,
  onPendingChange,
  onDeleting,
  onKept,
}: DeleteAccountFormProps) {
  const { deleteAccount } = useAuth()
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    if (isPending) return
    setError(null)
    onPendingChange(true)
    onDeleting()
    try {
      await deleteAccount()
    } catch (failure) {
      onKept()
      onPendingChange(false)
      setError(failureMessage(failure))
    }
  }

  return (
    <>
      <Heading slot="title" className={dialogStyles.title}>
        {copy.heading}
      </Heading>
      <p id={bodyId} className={styles.dialogBody}>
        {copy.body}
      </p>
      <CheckboxField
        isSelected={confirmed}
        onChange={setConfirmed}
        isDisabled={isPending}
        className={formStyles.checkField}
      >
        <CheckboxButton className={formStyles.checkbox}>
          <CheckMark />
          {copy.confirm}
        </CheckboxButton>
      </CheckboxField>
      {error && (
        <p role="alert" className={`${formStyles.error} ${styles.dialogError}`}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button slot="close" isDisabled={isPending} className={styles.secondary}>
          {copy.cancel}
        </Button>
        <Button
          onPress={remove}
          isDisabled={!confirmed}
          className={isPending ? `${styles.danger} ${styles.pending}` : styles.danger}
        >
          {isPending ? copy.pending : copy.submit}
        </Button>
      </div>
    </>
  )
}
