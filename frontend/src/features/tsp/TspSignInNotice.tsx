import { useCopy } from '../../i18n/copy.ts'

/** Signing in from TSP didn't work: the page still works, as a guest. "Sign in again" only where it can help. */
export function TspSignInNotice({
  canRetry,
  onRetry,
  blocked = false,
}: {
  canRetry: boolean
  onRetry: () => void
  blocked?: boolean
}) {
  const copy = useCopy().tspSignIn.notice
  return (
    <div className="tsp-sign-in-notice" role="status">
      <span>{blocked ? copy.blocked : copy.message}</span>
      {canRetry && (
        <button type="button" className="tsp-secondary" onClick={onRetry}>
          {copy.retry}
        </button>
      )}
    </div>
  )
}
