import { Button } from 'react-aria-components'
import { Icon, type IconName } from '../components/Icon.tsx'
import { en } from '../copy/en.ts'
import type { Notice } from './useAuth.ts'
import styles from './AccountNotice.module.css'

const ICONS: Record<Notice['tone'], IconName> = { info: 'clock', success: 'check', error: 'info' }

/**
 * What happened after an account action ("Your account and saved records were deleted."), at the foot of the
 * screen until dismissed, like the Streamlit app's flash messages. The live region is always there, so screen
 * readers announce each new notice. It's a top layer for React Aria, so an open dialog or menu (the phone menu,
 * where the account actions also are) doesn't hide it from screen readers.
 */
export function AccountNotice({
  notice,
  onDismiss,
}: {
  notice: Notice | null
  onDismiss: () => void
}) {
  return (
    <div aria-live="polite" data-react-aria-top-layer="true" className={styles.region}>
      {notice && (
        <div className={styles.notice} data-tone={notice.tone}>
          <Icon name={ICONS[notice.tone]} size="1.25rem" className={styles.icon} />
          <p className={styles.message}>{notice.message}</p>
          {notice.action && (
            <Button onPress={notice.action.onPress} className={styles.action}>
              {notice.action.label}
            </Button>
          )}
          <Button aria-label={en.account.dismiss} onPress={onDismiss} className={styles.dismiss}>
            <Icon name="close" size="1.1rem" />
          </Button>
        </div>
      )}
    </div>
  )
}
