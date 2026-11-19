import { useRef, useState, type FormEvent } from 'react'
import { Button, Form } from 'react-aria-components'
import { api } from '../api/client.ts'
import { ApiError, unwrap } from '../api/errors.ts'
import { Spinner } from '../components/Spinner.tsx'
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
export function TspSignInForm({
  onSignedIn,
  onContinueAsGuest,
}: {
  onSignedIn: () => void
  /** Leaves sign-in for the app as a guest, offered when sign-in can't be reached (US-0002 AC6). */
  onContinueAsGuest?: () => void
}) {
  const en = useCopy()
  const copy = en.account.tsp
  const form = en.account.signInForm
  const consentCopy = en.tspSignIn.consent

  const { adoptSession } = useAuth()
  // `unreachable`: the service couldn't be reached, so the learner may retry or go on as a guest.
  const [error, setFailure] = useState<{ message: string; unreachable: boolean } | null>(null)
  const setError = (message: string | null, unreachable = false) =>
    setFailure(message === null ? null : { message, unreachable })
  // What Retry repeats: the last sign-in or consent answer.
  const lastAttempt = useRef<(() => Promise<void>) | null>(null)
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
    if (outcome.error === 'handoff_expired' || outcome.error === 'pending_expired') {
      return setError(copy.expired)
    }
    setError(copy.unavailable, outcome.error === 'unavailable')
  }

  const fail = (failure: unknown) => {
    setPending(false)
    // A request that never got an answer, or a server that's down: not a refusal the learner can fix.
    const unreachable =
      !(failure instanceof ApiError) || failure.unavailable || failure.status === undefined
    setError(failureMessage(failure), unreachable)
  }

  const run = async (attempt: () => Promise<void>) => {
    lastAttempt.current = attempt
    setError(null)
    setPending(true)
    try {
      await attempt()
    } catch (failure) {
      fail(failure)
    }
  }

  const retry = () => {
    if (isPending || !lastAttempt.current) return
    void run(lastAttempt.current)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    const fields = new FormData(event.currentTarget)
    const body = {
      username: fieldText(fields, 'username').trim(),
      password: fieldText(fields, 'password'),
    }
    await run(async () => {
      const handoff = await unwrap(api.POST('/api/v1/tsp-mock/handoff', { body }))
      await settle(await postSession(handoff.data.code))
    })
  }

  const answer = async (accept: boolean) => {
    if (isPending || !consent) return
    const { pendingId } = consent
    await run(async () => settle(await postConsent(pendingId, accept)))
  }

  const alert = error && (
    <div className="flex flex-col gap-3">
      <p role="alert" className={formStyle.error}>
        {error.message}
      </p>
      {error.unreachable && (
        <div className="flex flex-wrap gap-2">
          <Button
            className={button({ variant: 'secondary' })}
            isDisabled={isPending}
            onPress={retry}
          >
            {copy.retry}
          </Button>
          {onContinueAsGuest && (
            <Button
              className={button({ variant: 'secondary' })}
              isDisabled={isPending}
              onPress={onContinueAsGuest}
            >
              {copy.continueAsGuest}
            </Button>
          )}
        </div>
      )}
    </div>
  )

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
        {alert}
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
            {isPending && <Spinner className="mr-2" />}
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
      {alert}
      <Button type="submit" className={submitButton(isPending)}>
        {isPending && <Spinner />}
        {isPending ? form.pending : copy.signIn}
      </Button>
    </Form>
  )
}
