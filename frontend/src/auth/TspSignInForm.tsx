import { useState, type FormEvent } from 'react'
import { Button, Form } from 'react-aria-components'
import { api } from '../api/client.ts'
import { unwrap } from '../api/errors.ts'
import {
  postConsent,
  postSession,
  type Outcome,
  type TspConsentSummary,
} from '../features/tsp/useTspSignIn.ts'
import { useCopy } from '../i18n/copy.ts'
import { button } from '../styles/buttons.ts'
import { failureMessage, Field, fieldText, isEmail } from './fields.tsx'
import { formStyle, submitButton } from './styles.ts'
import { useAuth } from './useAuth.ts'

/**
 * "Sign in with TSP" against the mock TSP (docs/tsp-mock.md). The mock plays TSP: a synthetic account's email and
 * password get a one-time handoff code. From there it's the WebView's sign-in: the code goes to
 * POST /api/v1/auth/tsp/session, a first visit asks for consent, and the session cookie is set.
 */
export function TspSignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const en = useCopy()
  const copy = en.account.tsp
  const form = en.account.signInForm
  const consentCopy = en.tspSignIn.consent

  const { adoptSession } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setPending] = useState(false)
  const [consent, setConsent] = useState<{ pendingId: string; summary: TspConsentSummary } | null>(
    null,
  )

  const settle = async (outcome: Outcome) => {
    if ('signedIn' in outcome) {
      await adoptSession(outcome.signedIn)
      onSignedIn()
      return
    }
    setPending(false)
    if ('consent' in outcome) return setConsent(outcome.consent)
    setConsent(null)
    if ('declined' in outcome) return setError(copy.declined)
    setError(
      outcome.error === 'handoff_expired' || outcome.error === 'pending_expired'
        ? copy.expired
        : copy.unavailable,
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    const fields = new FormData(event.currentTarget)
    setError(null)
    setPending(true)
    try {
      const handoff = await unwrap(
        api.POST('/api/v1/tsp-mock/handoff', {
          body: {
            username: fieldText(fields, 'username').trim(),
            password: fieldText(fields, 'password'),
          },
        }),
      )
      await settle(await postSession(handoff.data.code))
    } catch (failure) {
      setPending(false)
      setError(failureMessage(failure))
    }
  }

  const answer = async (accept: boolean) => {
    if (isPending || !consent) return
    setPending(true)
    try {
      await settle(await postConsent(consent.pendingId, accept))
    } catch (failure) {
      setPending(false)
      setError(failureMessage(failure))
    }
  }

  if (consent) {
    return (
      <div className={formStyle.form}>
        <div className={formStyle.privacy}>
          <p className={formStyle.privacyTitle}>{consentCopy.heading}</p>
          <p className={formStyle.privacyText}>{consentCopy.greeting(consent.summary.name)}</p>
          <p className={formStyle.privacyText}>{consentCopy.lead}</p>
          <ul className="my-2 pl-5 text-14 leading-[1.55] text-ink">
            <li>{consentCopy.always}</li>
            {consent.summary.keeps.map((kept) => (
              <li key={kept}>{consentCopy.keeps[kept]}</li>
            ))}
          </ul>
          <p className={formStyle.privacyText}>{consentCopy.privacy}</p>
        </div>
        {error && (
          <p role="alert" className={formStyle.error}>
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            className={button({ variant: 'secondary' })}
            isDisabled={isPending}
            onPress={() => void answer(false)}
          >
            {consentCopy.decline}
          </Button>
          <Button
            className={button({ variant: 'primary' })}
            isDisabled={isPending}
            onPress={() => void answer(true)}
          >
            {consentCopy.accept}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Form onSubmit={submit} className={formStyle.form}>
      <Field
        name="username"
        type="email"
        autoComplete="username"
        isRequired
        label={copy.username}
        placeholder={copy.usernamePlaceholder}
        validate={(value) => (isEmail(value) ? null : copy.missingUsername)}
      />
      <Field
        name="password"
        type="password"
        autoComplete="current-password"
        isRequired
        label={form.password}
        placeholder={form.passwordPlaceholder}
        validate={(value) => (value ? null : form.missingPassword)}
      />
      {error && (
        <p role="alert" className={formStyle.error}>
          {error}
        </p>
      )}
      <Button type="submit" className={submitButton(isPending)}>
        {isPending ? form.pending : copy.signIn}
      </Button>
    </Form>
  )
}
