import { Button } from 'react-aria-components'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import shared from './finder.module.css'

/**
 * A request for one part of a step that failed, in that part's place: what went wrong and Try again. The rest of the
 * step, and the learner's answers, stay as they were (US-14).
 */
export function RequestFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className={shared.failed}>
      <p role="alert" className={cx(shared.notice, shared.warning)}>
        {failureMessage(error)}
      </p>
      <Button className={buttons.button} onPress={onRetry}>
        <Icon name="refresh" />
        {en.unavailable.retry}
      </Button>
    </div>
  )
}
