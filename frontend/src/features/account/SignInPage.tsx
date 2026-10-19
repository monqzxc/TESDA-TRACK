import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AccountForms } from '../../auth/AccountForms.tsx'
import { safeNextPath } from '../../auth/nextPath.ts'
import { useAuth, type SignInView } from '../../auth/useAuth.ts'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import styles from './SignInPage.module.css'

interface Start {
  view: SignInView
  message?: string
  email?: string
}

/**
 * Sign in, at /sign-in: the address to fall back on for the sign-in dialog, with the same forms. Once signed in, the
 * learner goes on to ?next= when it's one of the app's own addresses, or home.
 */
export default function SignInPage() {
  const { isSignedIn, isChecking } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNextPath(params.get('next'))
  const [start, setStart] = useState<Start>({ view: 'signIn' })

  // Signed in here, in the dialog, or already: carry on. Replacing the entry keeps Back from returning here.
  useEffect(() => {
    if (isSignedIn) void navigate(next, { replace: true })
  }, [isSignedIn, navigate, next])

  if (isSignedIn) return null
  if (isChecking) {
    return (
      <div className={styles.page}>
        <PageHeading>{en.pages.signIn.heading}</PageHeading>
        <p role="status" className={styles.checking}>
          {en.account.checking}
        </p>
      </div>
    )
  }
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <AccountForms
          view={start.view}
          message={start.message}
          defaultEmail={start.email}
          onViewChange={(view, details) =>
            setStart({ view, message: details?.message, email: details?.email })
          }
          // The navigation follows from isSignedIn, above.
          onSignedIn={() => undefined}
          Heading={PageHeading}
        />
      </div>
    </div>
  )
}
