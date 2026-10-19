import { useId } from 'react'
import { Button } from 'react-aria-components'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import type { PageKey } from '../../lib/navigation.ts'

interface AccountGateProps {
  /** The page, for its heading. */
  page: PageKey
  icon: IconName
  heading: string
  body: string
  /** The sign-in button's label; without it there's no button. */
  action?: string
}

/**
 * A page shown to someone it isn't for yet: its heading, then what they need, with a button that opens the sign-in
 * dialog (after the Streamlit app's empty state on My Progress, and its service-unavailable card). While the app
 * checks who is signed in, it says so.
 */
export function AccountGate({ page, icon, heading, body, action }: AccountGateProps) {
  const { isChecking, openSignIn } = useAuth()
  const headingId = useId()
  return (
    <div className="max-w-[760px]">
      <PageHeading>{en.pages[page].heading}</PageHeading>
      {isChecking ? (
        <p role="status" className="text-17 text-muted">
          {en.account.checking}
        </p>
      ) : (
        <section
          className="my-4 flex flex-col items-center rounded-18 border border-border bg-surface px-6 py-7 text-center max-xs:rounded-14 max-xs:px-[1.1rem] max-xs:py-5"
          aria-labelledby={headingId}
        >
          <span className="mb-[0.9rem] grid size-11.5 place-items-center rounded-13 bg-tint text-blue">
            <Icon name={icon} size={23} />
          </span>
          <h2 id={headingId} className="mb-[0.6rem] text-[1.4rem] text-navy">
            {heading}
          </h2>
          <p className="mb-[1.2rem] max-w-[560px] text-15 leading-[1.7] text-muted">{body}</p>
          {action && (
            <Button
              className="inline-flex min-h-11.5 cursor-pointer items-center gap-2 rounded-12 border border-fill bg-fill px-[1.2rem] py-[0.55rem] font-bold text-white data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:border-fill-hover data-hovered:bg-fill-hover"
              onPress={() => openSignIn()}
            >
              <Icon name="person" size="1.15em" />
              {action}
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
