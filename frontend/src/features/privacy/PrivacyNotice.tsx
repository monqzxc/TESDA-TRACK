import { useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import { hasSeenPrivacyNotice, markPrivacyNoticeSeen } from './notice.ts'
import styles from './PrivacyNotice.module.css'

const copy = en.privacy.notice

// One per point, in their order: the finder, the account, the location, and the learner's control of it all.
const POINT_ICONS: readonly IconName[] = ['route', 'person', 'pin', 'check']

/**
 * The privacy notice, over the first page of a first visit (RA 10173's right to be informed): what TESDA Track
 * collects, in short, and a link to the policy. Closing it in any way (I understand, Read the privacy policy, the
 * close button, Escape, a tap outside) counts as seen, until the policy's version changes. The policy page doesn't
 * show it: it says all of it.
 */
export function PrivacyNotice() {
  const { pathname } = useLocation()
  const [isOpen, setOpen] = useState(() => !hasSeenPrivacyNotice())
  const close = () => {
    markPrivacyNoticeSeen()
    setOpen(false)
  }
  return (
    <ModalDialog
      isOpen={isOpen && pathname !== paths.privacy}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      title={copy.title}
      closeLabel={copy.close}
      wide
    >
      <p className={styles.lead}>{copy.lead}</p>
      <ul className={styles.points}>
        {copy.points.map((point, i) => (
          <li key={point}>
            <span className={styles.icon}>
              <Icon name={POINT_ICONS[i]} size="1.15rem" />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Link to={paths.privacy} className={buttons.button} onClick={close}>
          {copy.read}
        </Link>
        <Button className={cx(buttons.button, buttons.primary)} onPress={close}>
          {copy.accept}
        </Button>
      </div>
    </ModalDialog>
  )
}
