import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Button, Tooltip, TooltipTrigger } from 'react-aria-components'
import type { Learner } from '../../auth/session.ts'
import { loadSignInDialog, useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { focusIsLost } from '../../lib/focus.ts'
import { prefetch } from '../../lib/prefetch.ts'
import { reloadPage } from '../../lib/reload.ts'
import { loadSignedInMenu } from './loaders.ts'
import { iconSize, shownName, type Variant } from './variant.ts'
import { accountButton, accountName, control, mapTip } from './styles.ts'

const SignedInMenu = lazy(loadSignedInMenu)

interface AccountButtonProps {
  learner: Learner
  variant: Variant
  className: string
  isDisabled?: boolean
  onPress?: () => void
  menuLabel?: string
}

/** The account menu's button, drawn here while the menu's code comes down (or if it can't). */
function AccountButton({
  learner,
  variant,
  className,
  isDisabled,
  onPress,
  menuLabel,
}: AccountButtonProps) {
  const en = useCopy()
  const copy = en.account

  return (
    <Button
      isDisabled={isDisabled}
      onPress={onPress}
      className={className}
      aria-label={`${menuLabel ?? copy.menu.label}: ${learner.full_name}`}
    >
      <Icon name="person" size={iconSize(variant)} />
      <span className={variant === 'map' ? 'sr-only' : accountName}>
        {shownName(learner.full_name, variant)}
      </span>
    </Button>
  )
}

/**
 * A tip under a button that shows only an icon, on hover and on keyboard focus: the button's name, which screen
 * readers get from the button itself. Lined up with the button's right edge, as the map's corner has no room right.
 */
export function MapTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={400} closeDelay={0}>
      {children}
      <Tooltip placement="bottom end" offset={8} className={mapTip}>
        {label}
      </Tooltip>
    </TooltipTrigger>
  )
}

interface AccountControlProps {
  variant: Variant
  /** Extra classes for the button, e.g. the top bar's own link style. */
  buttonClassName?: string
  /** Called before the sign-in dialog opens, e.g. to close the phone menu this sits in. */
  onOpenSignIn?: () => void
  /** Called when a profile link is chosen, including a link to the current page. */
  onNavigate?: () => void
  /** Where focus goes after the sign-in dialog when this control won't be on screen then (the closed phone menu). */
  returnFocus?: () => HTMLElement | null
  /**
   * Names for a second control on the same page (the app's top bar beside the sidebar's), so the two are told
   * apart: read before the name on the menu button, and Sign in's name.
   */
  labels?: { menu: string; signIn: string }
}

/**
 * The account control, where the Streamlit app has its account button: "Sign in" when signed out, and the learner's
 * account menu when signed in. Signing in or out here swaps one button for the other, and focus follows to the new
 * one. The menu's code comes down only when someone may be signed in.
 */
export function AccountControl({
  variant,
  buttonClassName,
  onOpenSignIn,
  onNavigate,
  returnFocus,
  labels,
}: AccountControlProps) {
  const en = useCopy()
  const copy = en.account

  const { learner, isChecking, offersAccounts, openSignIn, notify } = useAuth()
  const wrapper = useRef<HTMLDivElement>(null)
  const signInButton = useRef<HTMLButtonElement>(null)
  // Set when the learner signs in or out with this control: the button that takes the place of its own takes focus
  // as it appears, unless focus has been put somewhere since. The account menu's button comes once its code is in.
  const handOver = useRef(false)

  const ownButton = useCallback(
    () => wrapper.current?.querySelector<HTMLElement>('button') ?? null,
    [],
  )

  const takeFocus = useCallback((button: HTMLElement | null) => {
    if (!handOver.current) return
    handOver.current = false
    if (focusIsLost()) button?.focus()
  }, [])

  // Signed out from the menu here: Sign in is back.
  useEffect(() => {
    if (!learner) takeFocus(signInButton.current)
  }, [learner, takeFocus])

  // Asking the API who is signed in: the menu will probably be needed.
  useEffect(() => {
    if (isChecking) prefetch(loadSignedInMenu)
  }, [isChecking])

  const buttonClass = [accountButton[variant], buttonClassName].filter(Boolean).join(' ')

  const signIn = () => {
    handOver.current = true
    onOpenSignIn?.()
    openSignIn({ returnFocus: returnFocus ?? ownButton })
  }
  // The learner is about to sign in: fetch the dialog's code now.
  const prepareSignIn = () => prefetch(loadSignInDialog)

  return (
    <div ref={wrapper} className={control[variant]}>
      {learner ? (
        // The menu's code couldn't be downloaded: the same button says so, and offers to reload.
        <LoadBoundary
          fallback={
            <AccountButton
              learner={learner}
              variant={variant}
              className={buttonClass}
              menuLabel={labels?.menu}
              onPress={() =>
                notify({
                  tone: 'error',
                  message: copy.unavailable.menu,
                  action: { label: copy.unavailable.retry, onPress: reloadPage },
                })
              }
            />
          }
        >
          {/* While the menu's code comes down: the same button, which can't be used (or focused) yet. */}
          <Suspense
            fallback={
              <AccountButton
                learner={learner}
                variant={variant}
                className={buttonClass}
                menuLabel={labels?.menu}
                isDisabled
              />
            }
          >
            <SignedInMenu
              learner={learner}
              variant={variant}
              buttonClass={buttonClass}
              menuLabel={labels?.menu}
              onNavigate={onNavigate}
              onShown={takeFocus}
              onSessionEnding={() => {
                handOver.current = true
              }}
              onSessionKept={() => {
                handOver.current = false
              }}
            />
          </Suspense>
        </LoadBoundary>
      ) : (
        // Guest-only: no Sign in for learners (see learnerAccounts).
        offersAccounts &&
        (variant === 'map' ? (
          // On the map only the icon shows: the name is read out, and shown in a tip on hover or focus.
          <MapTip label={labels?.signIn ?? copy.signIn}>
            <Button
              ref={signInButton}
              className={buttonClass}
              onPress={signIn}
              onHoverStart={prepareSignIn}
              onFocus={prepareSignIn}
              aria-label={labels?.signIn ?? copy.signIn}
            >
              <Icon name="signIn" size={iconSize(variant)} />
            </Button>
          </MapTip>
        ) : (
          <Button
            ref={signInButton}
            className={buttonClass}
            onPress={signIn}
            onHoverStart={prepareSignIn}
            onFocus={prepareSignIn}
            aria-label={labels?.signIn}
          >
            <Icon name="person" size={iconSize(variant)} />
            {copy.signIn}
          </Button>
        ))
      )}
    </div>
  )
}
