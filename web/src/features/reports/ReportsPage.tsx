import { useAuth } from '../../auth/useAuth.ts'
import { Placeholder } from '../../components/Placeholder.tsx'
import { en } from '../../copy/en.ts'
import { AccountGate } from '../account/AccountGate.tsx'

const copy = en.account.reports

// Reports, at /reports, for administrators. Task 16. Anyone else gets a "not available" message instead of the page
// (the API refuses their report requests in any case).
export default function ReportsPage() {
  const { isAdmin, isSignedIn } = useAuth()
  if (!isAdmin) {
    return (
      <AccountGate
        page="reports"
        icon="info"
        heading={copy.heading}
        body={isSignedIn ? copy.body : copy.signedOut}
        action={isSignedIn ? undefined : copy.action}
      />
    )
  }
  return <Placeholder needsCatalog />
}
