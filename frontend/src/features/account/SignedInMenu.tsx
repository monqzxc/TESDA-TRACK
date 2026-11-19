import { useEffect, useRef, type Key } from 'react'
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
import { useNavigate } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import type { Learner } from '../../auth/session.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
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
  /** Read before the name instead of "Your account", where another account control is also on the page. */
  menuLabel?: string
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
  menuLabel,
}: SignedInMenuProps) {
  const en = useCopy()
  const copy = en.account

  const { signOut, notify } = useAuth()
  const navigate = useNavigate()
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => onShown(trigger.current), [onShown])

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
    } else if (key === 'signOut') void endSession()
  }

  const name = learner.full_name
  return (
    <>
      <MenuTrigger>
        <Button
          ref={trigger}
          className={buttonClass}
          aria-label={`${menuLabel ?? copy.menu.label}: ${name}`}
        >
          <Icon name="person" size={variant === 'sidebar' ? '1.125rem' : '1.2rem'} />
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
    </>
  )
}
