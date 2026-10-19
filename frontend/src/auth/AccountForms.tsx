import { useState, type ComponentType, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { en } from '../copy/en.ts'
import { RegisterForm } from './RegisterForm.tsx'
import { SignInForm } from './SignInForm.tsx'
import type { SignInView } from './useAuth.ts'
import { formStyle } from './styles.ts'

const copy = en.account

export interface AccountFormsProps {
  view: SignInView
  /** Switches between signing in and creating an account, with a message and an email to start the new form. */
  onViewChange: (view: SignInView, start?: { email?: string; message?: string }) => void
  onSignedIn: () => void
  /** A line above the form: why the dialog opened, or what happened. */
  message?: string
  messageId?: string
  defaultEmail?: string
  /** Draws the form's heading: the dialog's title, or the page's h1 on /sign-in. */
  Heading: ComponentType<{ children: ReactNode }>
}

/** Sign in or create an account, for the sign-in dialog and the /sign-in page alike. */
export function AccountForms({
  view,
  onViewChange,
  onSignedIn,
  message,
  messageId,
  defaultEmail,
  Heading,
}: AccountFormsProps) {
  // Once the learner switches forms, the new form's first field takes focus. On opening, the dialog has it.
  const [switched, setSwitched] = useState(false)
  const isSignIn = view === 'signIn'

  const switchTo = (next: SignInView, start?: { email?: string; message?: string }) => {
    setSwitched(true)
    onViewChange(next, start)
  }

  return (
    <>
      <Heading>{isSignIn ? copy.signInForm.heading : copy.registerForm.heading}</Heading>
      {isSignIn && <p className={formStyle.lead}>{copy.signInForm.lead}</p>}
      {message && (
        <p id={messageId} role="status" className={formStyle.message}>
          {message}
        </p>
      )}
      {isSignIn ? (
        <SignInForm
          defaultEmail={defaultEmail}
          focusFirstField={switched}
          onSignedIn={onSignedIn}
        />
      ) : (
        <RegisterForm
          focusFirstField={switched}
          onSignedIn={onSignedIn}
          onCreatedNotSignedIn={(email) =>
            switchTo('signIn', { email, message: copy.registerForm.createdNotSignedIn })
          }
        />
      )}
      <div className={formStyle.switch}>
        <Button
          className={formStyle.textButton}
          onPress={() => switchTo(isSignIn ? 'register' : 'signIn')}
        >
          {isSignIn ? copy.signInForm.toRegister : copy.registerForm.toSignIn}
        </Button>
      </div>
      <p className={formStyle.note}>
        <strong>{copy.exploring.heading}</strong> {copy.exploring.body}
      </p>
    </>
  )
}
