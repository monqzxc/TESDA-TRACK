import { useAuth } from '../../auth/useAuth.ts'
import { Placeholder } from '../../components/Placeholder.tsx'
import { en } from '../../copy/en.ts'
import { AccountGate } from '../account/AccountGate.tsx'

const copy = en.account.progress

// My Progress, at /progress. Task 14. Signed out, it asks the learner to sign in, as the Streamlit page does.
export default function ProgressPage() {
  const { isSignedIn } = useAuth()
  if (!isSignedIn) {
    return (
      <AccountGate
        page="progress"
        icon="growth"
        heading={copy.heading}
        body={copy.body}
        action={copy.action}
      />
    )
  }
  return <Placeholder needsCatalog />
}
