import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type Key } from 'react'
import {
  Button,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
} from 'react-aria-components'
import { failureMessage } from '../../auth/fields.tsx'
import type { Learner } from '../../auth/session.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { returnFocus } from '../../lib/focus.ts'
import { DeleteAccountDialog } from './DeleteAccountDialog.tsx'
import { downloadMyData } from './exportData.ts'
import { shownName, type Variant } from './variant.ts'
import styles from './AccountMenu.module.css'

const copy = en.account

export interface SignedInMenuProps {
  learner: Learner
  variant: Variant
  buttonClass: string
  /** Called with the menu button once it's on the page, so it can take focus from the button it replaced. */
  onShown: (button: HTMLElement | null) => void
  /** The session is about to end (signing out, deleting): the menu button will give way to "Sign in". */
  onSessionEnding: () => void
  /** It didn't end after all. */
  onSessionKept: () => void
}

/**
 * Signed in: the learner's name opens a menu laid out as the Streamlit account panel: who they're signed in as and
 * Sign out, then "Your data & privacy" with Download my data and Delete my account. Loaded only once someone signs
 * in, since most visitors never do (AccountControl).
 */
export default function SignedInMenu({
  learner,
  variant,
  buttonClass,
  onShown,
  onSessionEnding,
  onSessionKept,
}: SignedInMenuProps) {
  const { signOut, notify } = useAuth()
  const queryClient = useQueryClient()
  const trigger = useRef<HTMLButtonElement>(null)
  const deleteDialog = useRef<HTMLElement>(null)
  const [isDeleting, setDeleting] = useState(false)
  const deleteWasOpen = useRef(false)

  useEffect(() => onShown(trigger.current), [onShown])

  // After the delete dialog closes without deleting, back to the menu button. The menu item that opened it is gone.
  useEffect(() => {
    if (isDeleting) {
      deleteWasOpen.current = true
      return
    }
    if (!deleteWasOpen.current) return
    deleteWasOpen.current = false
    returnFocus(trigger.current, deleteDialog.current)
  }, [isDeleting])

  const endSession = async () => {
    onSessionEnding()
    try {
      await signOut()
    } catch (failure) {
      onSessionKept()
      notify({ tone: 'error', message: failureMessage(failure) })
    }
  }

  const onAction = (key: Key) => {
    if (key === 'download') void downloadMyData(queryClient, notify)
    else if (key === 'delete') setDeleting(true)
    else if (key === 'signOut') void endSession()
  }

  const name = learner.full_name
  return (
    <>
      <MenuTrigger>
        <Button ref={trigger} className={buttonClass} aria-label={`${copy.menu.label}: ${name}`}>
          <Icon name="person" size={variant === 'sidebar' ? '1.45rem' : '1.2rem'} />
          <span className={styles.name}>{shownName(name, variant)}</span>
        </Button>
        <Popover
          placement={variant === 'header' ? 'bottom end' : 'bottom start'}
          className={styles.popover}
        >
          <Menu onAction={onAction} className={styles.menu}>
            {/* A section's Header is read as the name of its group, before the items in it. The spaces between
                its lines keep the words apart there; they don't show, as the lines are flex items. */}
            <MenuSection className={styles.section}>
              <Header className={styles.who}>
                <span className={styles.whoName}>{name}</span>{' '}
                <span className={styles.whoEmail}>{learner.email}</span>{' '}
                <span className={styles.role}>
                  {learner.role === 'admin' ? copy.menu.admin : copy.menu.learner}
                </span>
              </Header>
              <MenuItem id="signOut" className={styles.item}>
                {copy.menu.signOut}
              </MenuItem>
            </MenuSection>
            <Separator className={styles.separator} />
            <MenuSection className={styles.section}>
              <Header className={styles.dataHeader}>
                <span className={styles.dataHeading}>{copy.menu.data.heading}</span>{' '}
                <span className={styles.dataBody}>{copy.menu.data.body}</span>
              </Header>
              <MenuItem id="download" className={styles.item}>
                {copy.menu.download}
              </MenuItem>
              <MenuItem id="delete" className={styles.item}>
                {copy.menu.delete}
              </MenuItem>
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
      <DeleteAccountDialog
        dialogRef={deleteDialog}
        isOpen={isDeleting}
        onOpenChange={setDeleting}
        onDeleting={onSessionEnding}
        onKept={onSessionKept}
      />
    </>
  )
}
