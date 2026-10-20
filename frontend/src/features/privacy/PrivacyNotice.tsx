import { useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { hasSeenPrivacyNotice, markPrivacyNoticeSeen } from './notice.ts'

const copy = en.privacy.notice

// One per point, in their order: the finder, the account, the location, and the learner's control of it all.
const POINT_ICONS: readonly IconName[] = ['route', 'person', 'pin', 'check']

// In ModalDialog's card: the four points, each after its icon, then the two actions (stacked on small phones, the
// main one on top).
const actionButton = 'max-xs:w-full'

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
      <p className="mt-0 mb-[0.9rem] leading-[1.55] text-ink">{copy.lead}</p>
      <ul className="mt-0 mb-[1.4rem] flex list-none flex-col gap-[0.7rem] p-0">
        {copy.points.map((point, i) => (
          <li key={point} className="flex items-start gap-3 text-15 leading-[1.55] text-ink">
            <span className="grid size-[34px] flex-none place-items-center rounded-10 bg-soft text-blue">
              <Icon name={POINT_ICONS[i]} size="1.15rem" />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-[0.6rem] max-xs:flex-col-reverse">
        <Link to={paths.privacy} className={cx(button(), actionButton)} onClick={close}>
          {copy.read}
        </Link>
        <Button className={cx(button({ variant: 'primary' }), actionButton)} onPress={close}>
          {copy.accept}
        </Button>
      </div>
    </ModalDialog>
  )
}
