import { useId } from 'react'
import { Button } from 'react-aria-components'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import type { PageKey } from '../../lib/navigation.ts'
import styles from './AccountGate.module.css'

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
 * dialog (after the Streamlit app's empty state on My Progress). While the app checks who is signed in, it says so.
 */
export function AccountGate({ page, icon, heading, body, action }: AccountGateProps) {
  const { isChecking, openSignIn } = useAuth()
  const headingId = useId()
  return (
    <div className={styles.page}>
      <PageHeading>{en.pages[page].heading}</PageHeading>
      {isChecking ? (
        <p role="status" className={styles.checking}>
          {en.account.checking}
        </p>
      ) : (
        <section className={styles.prompt} aria-labelledby={headingId}>
          <span className={styles.icon}>
            <Icon name={icon} size={23} />
          </span>
          <h2 id={headingId} className={styles.heading}>
            {heading}
          </h2>
          <p className={styles.body}>{body}</p>
          {action && (
            <Button className={styles.action} onPress={() => openSignIn()}>
              <Icon name="person" size="1.15em" />
              {action}
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
