import { CancelledError, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/errors.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { exportQuery, type AccountExport } from '../../auth/session.ts'
import type { Notice } from '../../auth/useAuth.ts'
import { en } from '../../copy/en.ts'

const copy = en.account

// How long the file's address lasts. Revoking it as soon as the link is clicked can cancel the download in some
// browsers, which read the file afterwards. FileSaver.js waits as long.
const REVOKE_AFTER_MS = 40_000

/** Saves `data` as a JSON file, laid out as the Streamlit app's export is (two-space indents). */
export function saveJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/**
 * Download my data: everything the API keeps about the learner (GET /api/v1/me/export), saved as
 * tesda-track-my-data.json like Streamlit's "Download my data (JSON)". If the learner signs out (or someone else
 * signs in) before it arrives, the request is cancelled and nothing is saved.
 */
export async function downloadMyData(
  queryClient: QueryClient,
  notify: (notice: Notice | null) => void,
): Promise<void> {
  notify({ tone: 'info', message: copy.downloading })
  let data: AccountExport
  try {
    data = await queryClient.fetchQuery(exportQuery)
  } catch (failure) {
    // Cancelled by the session ending. An ended session also opens the sign-in dialog, which says so.
    const ended =
      failure instanceof CancelledError || (failure instanceof ApiError && failure.status === 401)
    notify(ended ? null : { tone: 'error', message: failureMessage(failure) })
    return
  }
  saveJson(data, copy.exportFileName)
  notify({ tone: 'success', message: copy.downloaded })
}
