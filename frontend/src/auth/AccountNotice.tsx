import { Button } from 'react-aria-components'
import { Icon, type IconName } from '../components/Icon.tsx'
import { useCopy } from '../i18n/copy.ts'
import { cx } from '../lib/style.ts'
import type { Notice } from './useAuth.ts'

const ICONS: Record<Notice['tone'], IconName> = { info: 'clock', success: 'check', error: 'info' }
const BORDERS: Record<Notice['tone'], string> = {
  info: 'border-border',
  success: 'border-good-ink',
  error: 'border-warn-ink',
}
const ICON_COLORS: Record<Notice['tone'], string> = {
  info: 'text-blue',
  success: 'text-good-ink',
  error: 'text-warn-ink',
}

const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

/**
 * What happened after an account action ("Your account and saved records were deleted."), at the foot of the
 * screen until dismissed, like the Streamlit app's flash messages: fixed there, above the page and below dialogs. The
 * live region is always there, so screen readers announce each new notice. It's a top layer for React Aria, so an
 * open dialog or menu (the phone menu, where the account actions also are) doesn't hide it from screen readers.
 */
export function AccountNotice({
  notice,
  onDismiss,
}: {
  notice: Notice | null
  onDismiss: () => void
}) {
  const en = useCopy()

  return (
    <div
      aria-live="polite"
      data-react-aria-top-layer="true"
      className="pointer-events-none fixed right-4 bottom-4 left-4 z-90 flex justify-center"
    >
      {notice && (
        <div
          className={cx(
            'pointer-events-auto flex max-w-[560px] animate-notice items-center gap-3 rounded-14 border bg-surface py-[0.6rem] pr-[0.6rem] pl-4 text-navy shadow-[0_18px_40px_-16px_rgb(var(--track-shadow-rgb)/0.45)]',
            BORDERS[notice.tone],
          )}
          data-tone={notice.tone}
        >
          <Icon
            name={ICONS[notice.tone]}
            size="1.25rem"
            className={cx('shrink-0', ICON_COLORS[notice.tone])}
          />
          <p className="m-0 text-15 leading-[1.45] font-medium">{notice.message}</p>
          {notice.action && (
            <Button
              onPress={notice.action.onPress}
              className={cx(
                'min-h-10 shrink-0 cursor-pointer rounded-10 border border-border bg-surface px-[0.9rem] py-[0.4rem] font-semibold text-navy data-hovered:border-hover-border data-hovered:bg-soft',
                ring,
              )}
            >
              {notice.action.label}
            </Button>
          )}
          <Button
            aria-label={en.account.dismiss}
            onPress={onDismiss}
            className={cx(
              'grid size-10 shrink-0 cursor-pointer place-items-center rounded-10 border-0 bg-transparent text-muted data-hovered:bg-soft data-hovered:text-navy',
              ring,
            )}
          >
            <Icon name="close" size="1.1rem" />
          </Button>
        </div>
      )}
    </div>
  )
}
