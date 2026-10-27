import { Button } from 'react-aria-components'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { button } from '../../styles/buttons.ts'
import { failed, notice } from './styles.ts'

/**
 * A request for one part of a step that failed, in that part's place: what went wrong and Try again. The rest of the
 * step, and the learner's answers, stay as they were (US-14).
 */
export function RequestFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const en = useCopy()

  return (
    <div className={failed}>
      <p role="alert" className={notice('warning')}>
        {failureMessage(error)}
      </p>
      <Button className={button()} onPress={onRetry}>
        <Icon name="refresh" />
        {en.unavailable.retry}
      </Button>
    </div>
  )
}
