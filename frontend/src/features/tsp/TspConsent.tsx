import { useState } from 'react'
import { useCopy } from '../../i18n/copy.ts'
import type { TspConsentSummary } from './useTspSignIn.ts'

/**
 * A learner's first sign-in from TESDA Skill Passport: what TESDA-TRACK would keep from their Skill Passport, and
 * their choice. Nothing is kept until they agree; "Not now" leaves them a guest.
 */
export function TspConsent({
  summary,
  onAnswer,
}: {
  summary: TspConsentSummary
  onAnswer: (accept: boolean) => Promise<void>
}) {
  const copy = useCopy().tspSignIn.consent
  const [answering, setAnswering] = useState(false)
  const answer = (accept: boolean) => {
    setAnswering(true)
    void onAnswer(accept).finally(() => setAnswering(false))
  }
  return (
    <section className="tsp-card tsp-consent" aria-labelledby="tsp-consent-heading">
      <h1 id="tsp-consent-heading">{copy.heading}</h1>
      <p>{copy.greeting(summary.name)}</p>
      <p>{copy.lead}</p>
      <ul>
        {summary.keeps.map((kept) => (
          <li key={kept}>{copy.keeps[kept]}</li>
        ))}
      </ul>
      <p className="tsp-muted">{copy.privacy}</p>
      <div className="tsp-bottom-actions">
        <button type="button" className="tsp-secondary" disabled={answering} onClick={() => answer(false)}>
          {copy.decline}
        </button>
        <button type="button" className="tsp-primary" disabled={answering} onClick={() => answer(true)}>
          {copy.accept}
        </button>
      </div>
    </section>
  )
}
