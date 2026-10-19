import { useState, type FormEvent } from 'react'
import { Button, Form } from 'react-aria-components'
import { en } from '../copy/en.ts'
import { failureMessage, Field, fieldText, isEmail } from './fields.tsx'
import { useAuth } from './useAuth.ts'
import { formStyle, submitButton } from './styles.ts'

const copy = en.account.signInForm

interface SignInFormProps {
  defaultEmail?: string
  /** Focus the email field when the form appears (after the learner switched to it). */
  focusFirstField?: boolean
  onSignedIn: () => void
}

/**
 * Email and password, as the Streamlit app asks. A wrong password, a locked account (429) and an unreachable service
 * each show the API's message under the form, as Streamlit does.
 */
export function SignInForm({ defaultEmail, focusFirstField = false, onSignedIn }: SignInFormProps) {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    const form = new FormData(event.currentTarget)
    setError(null)
    setPending(true)
    try {
      await signIn(fieldText(form, 'email').trim(), fieldText(form, 'password'))
    } catch (failure) {
      setPending(false)
      setError(failureMessage(failure))
      return
    }
    onSignedIn()
  }

  return (
    <Form onSubmit={submit} className={formStyle.form}>
      <Field
        name="email"
        type="email"
        // The account's username, as password managers know it: they fill it with the password.
        autoComplete="username"
        isRequired
        focusOnMount={focusFirstField}
        defaultValue={defaultEmail}
        label={copy.email}
        placeholder={copy.emailPlaceholder}
        validate={(value) => (isEmail(value) ? null : copy.missingEmail)}
      />
      <Field
        name="password"
        type="password"
        autoComplete="current-password"
        isRequired
        label={copy.password}
        placeholder={copy.passwordPlaceholder}
        validate={(value) => (value ? null : copy.missingPassword)}
      />
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
