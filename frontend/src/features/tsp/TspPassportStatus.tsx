import { useCopy } from '../../i18n/copy.ts'
import type { Passport } from './passport.ts'
import type { TspSignInState } from './useTspSignIn.ts'

const SECTIONS = ['skills', 'experience', 'education', 'qualifications', 'credentials'] as const

/**
 * One quiet line on the entry page while TSP signs the learner in: connecting, then fetching their Skill Passport,
 * then connected, with what came back behind "See details". Nothing for a guest.
 */
export function TspPassportStatus({
  signIn,
  passport,
}: {
  signIn: TspSignInState | undefined
  passport: { data?: Passport | null; isPending: boolean; isError: boolean }
}) {
  const copy = useCopy().tspSignIn.passport
  if (signIn === 'signing_in') return <Line busy text={copy.connecting} />
  if (signIn !== 'signed_in') return null
  if (passport.isPending) return <Line busy text={copy.loading} />
  if (passport.isError) return <Line text={copy.unavailable} />
  const data = passport.data
  if (!data) return <Line text={copy.connected} />
  return (
    <details className="tsp-passport">
      <summary>
        <span className="tsp-passport-dot" aria-hidden="true" />
        {copy.connected}
        <span className="tsp-passport-toggle">{copy.details}</span>
      </summary>
      <dl>
        {SECTIONS.map((section) => (
          <div key={section}>
            <dt>{copy.sections[section]}</dt>
            <dd>{data[section].length ? data[section].join(', ') : copy.none}</dd>
          </div>
        ))}
      </dl>
      <p className="tsp-muted">{copy.used}</p>
    </details>
  )
}

function Line({ text, busy = false }: { text: string; busy?: boolean }) {
  return (
    <p className="tsp-passport" role="status">
      <span className={`tsp-passport-dot ${busy ? 'is-busy' : ''}`} aria-hidden="true" />
      {text}
    </p>
  )
}
