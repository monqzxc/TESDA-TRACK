import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { Button } from 'react-aria-components'
import type { Learner } from '../../auth/session.ts'
import { loadSignInDialog, useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { en } from '../../copy/en.ts'
import { focusIsLost } from '../../lib/focus.ts'
import { prefetch } from '../../lib/prefetch.ts'
import { reloadPage } from '../../lib/reload.ts'
import { loadSignedInMenu } from './loaders.ts'
import { shownName, type Variant } from './variant.ts'
import { accountButton, accountName, control } from './styles.ts'

const copy = en.account

const SignedInMenu = lazy(loadSignedInMenu)

interface AccountButtonProps {
  learner: Learner
  variant: Variant
  className: string
  isDisabled?: boolean
  onPress?: () => void
}

/** The account menu's button, drawn here while the menu's code comes down (or if it can't). */
function AccountButton({ learner, variant, className, isDisabled, onPress }: AccountButtonProps) {
  return (
    <Button
      isDisabled={isDisabled}
      onPress={onPress}
      className={className}
      aria-label={`${copy.menu.label}: ${learner.full_name}`}
    >
      <Icon name="person" size={variant === 'sidebar' ? '1.45rem' : '1.2rem'} />
      <span className={accountName}>{shownName(learner.full_name, variant)}</span>
    </Button>
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
}: AccountControlProps) {
  const { learner, isChecking, openSignIn, notify } = useAuth()
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

  const buttonClass = [
    variant === 'sidebar' ? accountButton.sidebar : accountButton.header,
    buttonClassName,
  ]
    .filter(Boolean)
    .join(' ')

  const signIn = () => {
    handOver.current = true
    onOpenSignIn?.()
    openSignIn({ returnFocus: returnFocus ?? ownButton })
  }
  // The learner is about to sign in: fetch the dialog's code now.
  const prepareSignIn = () => prefetch(loadSignInDialog)

  return (
    <div ref={wrapper} className={variant === 'sidebar' ? control.sidebar : control.header}>
      {learner ? (
        // The menu's code couldn't be downloaded: the same button says so, and offers to reload.
        <LoadBoundary
          fallback={
            <AccountButton
              learner={learner}
              variant={variant}
              className={buttonClass}
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
                isDisabled
              />
            }
          >
            <SignedInMenu
              learner={learner}
              variant={variant}
              buttonClass={buttonClass}
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
        <Button
          ref={signInButton}
          className={buttonClass}
          onPress={signIn}
          onHoverStart={prepareSignIn}
          onFocus={prepareSignIn}
        >
          <Icon name="person" size={variant === 'sidebar' ? '1.45rem' : '1.2rem'} />
          {copy.signIn}
        </Button>
      )}
    </div>
  )
}
