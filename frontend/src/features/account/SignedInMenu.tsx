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
import { Link, useNavigate } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import type { Learner } from '../../auth/session.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { returnFocus } from '../../lib/focus.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { ThemeSwitch } from '../../theme/ThemeSwitch.tsx'
import { DeleteAccountDialog } from './DeleteAccountDialog.tsx'
import { downloadMyData } from './exportData.ts'
import { shownName, type Variant } from './variant.ts'
import { accountName, menu } from './styles.ts'

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
  /** Closes the phone navigation when opening the profile. */
  onNavigate?: () => void
}

/**
 * Signed in: the learner's name opens a menu laid out as the Streamlit account panel: who they're signed in as,
 * account actions and display settings. Loaded only once someone signs in, since most visitors never do
 * (AccountControl).
 */
export default function SignedInMenu({
  learner,
  variant,
  buttonClass,
  onShown,
  onSessionEnding,
  onSessionKept,
  onNavigate,
}: SignedInMenuProps) {
  const en = useCopy()
  const copy = en.account

  const { signOut, notify } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const trigger = useRef<HTMLButtonElement>(null)
  const deleteDialog = useRef<HTMLElement>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    if (key === 'profile') {
      onNavigate?.()
      void navigate(paths.profile)
    } else if (key === 'settings') setSettingsOpen(true)
    else if (key === 'signOut') void endSession()
  }

  const name = learner.full_name
  return (
    <>
      <MenuTrigger>
        <Button ref={trigger} className={buttonClass} aria-label={`${copy.menu.label}: ${name}`}>
          <Icon name="person" size={variant === 'sidebar' ? '1.45rem' : '1.2rem'} />
          <span className={accountName}>{shownName(name, variant)}</span>
        </Button>
        <Popover
          placement={variant === 'header' ? 'bottom end' : 'bottom start'}
          className={menu.popover}
        >
          <Menu onAction={onAction} className={menu.menu}>
            {/* A section's Header is read as the name of its group, before the items in it. The spaces between
                its lines keep the words apart there; they don't show, as the lines are flex items. */}
            <MenuSection className={menu.section}>
              <Header className={menu.who}>
                <span className={menu.whoName}>{name}</span>{' '}
                <span className={menu.whoEmail}>{learner.email}</span>{' '}
              </Header>
              <MenuItem id="profile" className={menu.item}>
                {copy.menu.profile}
              </MenuItem>
              <MenuItem id="settings" className={menu.item}>
                {copy.menu.settings}
              </MenuItem>
            </MenuSection>
            <Separator className={menu.separator} />
            <MenuSection className={menu.section}>
              <MenuItem id="signOut" className={menu.item}>
                {copy.menu.signOut}
              </MenuItem>
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
      <ModalDialog
        isOpen={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          if (!open) trigger.current?.focus()
        }}
        title={copy.menu.settings}
        closeLabel={copy.menu.closeSettings}
      >
        <section className="border-b border-border py-5" aria-labelledby="account-profile">
          <h3 id="account-profile" className="mb-3 text-16 font-semibold text-navy">
            {copy.profile.heading}
          </h3>
          <p className="mb-1 font-semibold wrap-anywhere text-navy">{name}</p>
          <p className="mb-4 text-14 wrap-anywhere text-muted">{learner.email}</p>
          <Link
            to={paths.profile}
            className={button()}
            onClick={() => {
              setSettingsOpen(false)
              onNavigate?.()
            }}
          >
            <Icon name="person" />
            {copy.profile.view}
          </Link>
        </section>
        <section className="py-5" aria-labelledby="account-appearance">
          <h3 id="account-appearance" className="mb-3 text-16 font-semibold text-navy">
            {copy.menu.appearance}
          </h3>
          <ThemeSwitch />
        </section>
        <details className="border-t border-border pt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-16 font-semibold text-navy">
            {copy.menu.data.heading}
          </summary>
          <p className="mt-2 mb-4 text-14 text-muted">{copy.menu.data.body}</p>
          <div className="flex flex-col gap-2">
            <Button
              className={menu.item}
              onPress={() => {
                setSettingsOpen(false)
                trigger.current?.focus()
                void downloadMyData(queryClient, notify)
              }}
            >
              {copy.menu.download}
            </Button>
            <Button
              className={`${menu.item} text-warn-ink`}
              onPress={() => {
                setSettingsOpen(false)
                setDeleting(true)
              }}
            >
              {copy.menu.delete}
            </Button>
          </div>
        </details>
      </ModalDialog>
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
