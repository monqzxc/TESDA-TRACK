import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AccountForms } from '../../auth/AccountForms.tsx'
import { safeNextPath } from '../../auth/nextPath.ts'
import { useAuth, type SignInView } from '../../auth/useAuth.ts'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'

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
      <div className="max-w-[34rem]">
        <PageHeading>{en.pages.signIn.heading}</PageHeading>
        <p role="status" className="text-17 text-muted">
          {en.account.checking}
        </p>
      </div>
    )
  }
  return (
    <div className="max-w-[34rem]">
      <div className="rounded-20 border border-border bg-surface px-[1.6rem] pt-[1.6rem] pb-[1.4rem] max-xs:rounded-16 max-xs:px-[1.1rem] max-xs:pt-[1.2rem] max-xs:pb-[1.1rem]">
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
