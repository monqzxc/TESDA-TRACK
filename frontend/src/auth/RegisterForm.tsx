import { useId, useState, type FormEvent } from 'react'
import { Button, CheckboxButton, CheckboxField, FieldError, Form } from 'react-aria-components'
import { Icon } from '../components/Icon.tsx'
import { en } from '../copy/en.ts'
import { paths } from '../paths.ts'
import {
  CheckMark,
  failureMessage,
  Field,
  fieldText,
  isEmail,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from './fields.tsx'
import { SignInAfterRegistrationError } from './session.ts'
import { useAuth } from './useAuth.ts'
import { formStyle, submitButton } from './styles.ts'

const copy = en.account.registerForm

// The form is also in the sign-in dialog, which opens outside the router (AuthProvider): a plain link, with the app's
// base, opening in a new tab so what the learner has typed stays here.
const POLICY_HREF = `${import.meta.env.BASE_URL}${paths.privacy.slice(1)}`

interface RegisterFormProps {
  /** Focus the first field when the form appears (after the learner switched to it). */
  focusFirstField?: boolean
  onSignedIn: () => void
  /** The account was made but signing in failed: the learner should sign in now, not register again. */
  onCreatedNotSignedIn: (email: string) => void
}

function checkPassword(value: string): string | null {
  if (value.length < PASSWORD_MIN) return copy.shortPassword
  if (value.length > PASSWORD_MAX) return copy.longPassword
  return null
}

/**
 * The Streamlit app's registration: full name, email and password, then the privacy notice and the consent the API
 * requires (RA 10173). Nothing is sent until consent is given. Creating the account signs the learner in.
 */
export function RegisterForm({
  focusFirstField = false,
  onSignedIn,
  onCreatedNotSignedIn,
}: RegisterFormProps) {
  const { register } = useAuth()
  const noticeId = useId()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    const form = new FormData(event.currentTarget)
    const email = fieldText(form, 'email').trim()
    setError(null)
    setPending(true)
    try {
      await register({
        fullName: fieldText(form, 'fullName').trim(),
        email,
        password: fieldText(form, 'password'),
        privacyConsent: form.has('consent'),
      })
    } catch (failure) {
      if (failure instanceof SignInAfterRegistrationError) {
        onCreatedNotSignedIn(email)
        return
      }
      setPending(false)
      setError(failureMessage(failure))
      return
    }
    onSignedIn()
  }

  return (
    <Form onSubmit={submit} className={formStyle.form}>
      <Field
        name="fullName"
        autoComplete="name"
        isRequired
        focusOnMount={focusFirstField}
        maxLength={NAME_MAX}
        label={copy.fullName}
        validate={(value) => (value.trim() ? null : copy.missingName)}
      />
      <Field
        name="email"
        type="email"
        // The new account's username: password managers save it with the new password.
        autoComplete="username"
        isRequired
        label={copy.email}
        placeholder={copy.emailPlaceholder}
        validate={(value) => (isEmail(value) ? null : copy.invalidEmail)}
      />
      <Field
        name="password"
        type="password"
        autoComplete="new-password"
        isRequired
        label={copy.password}
        description={copy.passwordHelp}
        validate={checkPassword}
      />
      <div className={formStyle.privacy}>
        <p className={formStyle.privacyTitle}>{copy.privacyHeading}</p>
        <p id={noticeId} className={formStyle.privacyText}>
          {copy.privacyNotice}
        </p>
        <a
          href={POLICY_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className={formStyle.privacyLink}
        >
          {copy.privacyLink}
          <Icon name="external" />
        </a>
      </div>
      <CheckboxField
        name="consent"
        isRequired
        aria-describedby={noticeId}
        validate={(selected) => (selected ? null : copy.consentRequired)}
        className={formStyle.checkField}
      >
        <CheckboxButton className={formStyle.checkbox}>
          <CheckMark />
          {copy.consent}
        </CheckboxButton>
        <FieldError className={formStyle.fieldError} />
      </CheckboxField>
      {error && (
        <p role="alert" className={formStyle.error}>
          {error}
        </p>
      )}
      <Button type="submit" className={submitButton(isPending)}>
        {isPending ? copy.pending : copy.submit}
      </Button>
    </Form>
  )
}
