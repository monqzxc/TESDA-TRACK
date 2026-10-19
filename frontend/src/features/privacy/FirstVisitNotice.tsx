import { lazy, Suspense, useState, type ComponentType } from 'react'
import { hasSeenPrivacyNotice } from './notice.ts'

// The notice's code, downloaded only for a browser that hasn't seen it: not part of the first download for a
// returning visitor. If it can't be downloaded, the page carries on without it, and it shows on the next visit.
const PrivacyNotice = lazy((): Promise<{ default: ComponentType }> =>
  import('./PrivacyNotice.tsx').then(
    (module) => ({ default: module.PrivacyNotice }),
    () => ({ default: () => null }),
  ),
)

/** The privacy notice, on the first page of a first visit (see PrivacyNotice), in every layout (Layout.tsx Root). */
export function FirstVisitNotice() {
  const [unseen] = useState(() => !hasSeenPrivacyNotice())
  if (!unseen) return null
  return (
    <Suspense fallback={null}>
      <PrivacyNotice />
    </Suspense>
  )
}
