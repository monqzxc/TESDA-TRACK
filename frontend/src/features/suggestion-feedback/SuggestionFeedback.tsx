import { useMutation } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Button } from 'react-aria-components'
import { api } from '../../api/client.ts'
import { ApiError, detailMessage, unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { Icon } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'

type Rating = components['schemas']['SuggestionRating']
type Report = components['schemas']['SuggestionReport']
type Reason = Report['reason']
type Receipt = { id: string; rating?: boolean; report?: boolean }

interface Props {
  kind: Rating['result_kind']
  resultKey: string
  resultName: string
  qualificationCode?: string
  goal?: string | null
  scope?: string
}

const receiptKey = (kind: string, key: string, scope?: string, code?: string) =>
  `tesda-track.suggestion-feedback:${JSON.stringify([scope, kind, key, code])}`

function readReceipt(key: string): Receipt | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null') as Receipt | null
  } catch {
    return null
  }
}

function saveReceipt(key: string, receipt: Receipt) {
  try {
    sessionStorage.setItem(key, JSON.stringify(receipt))
  } catch {
    // The mounted form still retains its receipt when storage is blocked.
  }
}

export function SuggestionFeedback(props: Props) {
  const key = receiptKey(props.kind, props.resultKey, props.scope, props.qualificationCode)
  return <FeedbackForm key={key} storageKey={key} {...props} />
}

function FeedbackSuccess({ children }: { children: string }) {
  return (
    <span
      role="status"
      className="flex min-w-0 items-center gap-2 rounded-12 bg-good-bg px-2.5 py-2 leading-snug font-semibold text-good-ink"
    >
      <Icon name="check" size="1rem" className="shrink-0" />
      <span className="wrap-anywhere">{children}</span>
    </span>
  )
}

function FeedbackForm({
  storageKey,
  kind,
  resultKey,
  resultName,
  qualificationCode,
  goal,
}: Props & { storageKey: string }) {
  const copy = useCopy().suggestionFeedback
  const heading = useId()
  const form = useId()
  const [receipt, setReceipt] = useState(() => readReceipt(storageKey))
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [consent, setConsent] = useState(false)
  useEffect(() => {
    const sync = (event: Event) => setReceipt((event as CustomEvent<Receipt>).detail)
    window.addEventListener(storageKey, sync)
    return () => window.removeEventListener(storageKey, sync)
  }, [storageKey])
  const mutation = useMutation({
    mutationFn: async (body: Rating | Report) => {
      const result = await api.POST('/api/v1/feedback/suggestions', { body })
      if (result.response.status === 404 && detailMessage(result.error) === 'Not Found') {
        throw new ApiError({ message: copy.unavailable, status: 404 })
      }
      if (result.response.status !== 409) await unwrap(Promise.resolve(result))
      // A response may have been lost after the server saved the first submission.
    },
    onSuccess: (_, body) => {
      const next = { ...readReceipt(storageKey), ...receipt, id: body.receipt, [body.action]: true }
      saveReceipt(storageKey, next)
      window.dispatchEvent(new CustomEvent(storageKey, { detail: next }))
      if (body.action === 'report') {
        setOpen(false)
        setConsent(false)
      }
    },
  })
  const submit = (
    answer:
      { action: 'rating'; helpful: boolean } | Pick<Report, 'action' | 'reason' | 'shared_goal'>,
  ) => {
    const current = readReceipt(storageKey) ?? receipt ?? { id: crypto.randomUUID() }
    if (current[answer.action]) {
      setReceipt(current)
      return
    }
    saveReceipt(storageKey, current)
    setReceipt(current)
    mutation.mutate({
      receipt: current.id,
      result_kind: kind,
      result_key: resultKey,
      ...(qualificationCode ? { qualification_code: qualificationCode } : {}),
      ...answer,
    })
  }

  return (
    <section
      aria-label={resultName}
      className="flex min-w-0 flex-col gap-2 border-t border-rule pt-3 text-13 text-muted"
    >
      <span id={heading} className="font-semibold text-ink">
        {copy.question}
      </span>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] gap-2">
        {receipt?.rating ? (
          <FeedbackSuccess>{copy.rated}</FeedbackSuccess>
        ) : (
          <div role="group" aria-labelledby={heading} className="grid min-w-0 grid-cols-2 gap-2">
            {([true, false] as const).map((helpful) => (
              <Button
                key={String(helpful)}
                className={cx(button({ height: 44, text: 13 }), 'min-w-0 px-1! wrap-anywhere')}
                isDisabled={mutation.isPending}
                onPress={() => submit({ action: 'rating', helpful })}
              >
                {helpful ? copy.yes : copy.no}
              </Button>
            ))}
          </div>
        )}
        {receipt?.report ? (
          <FeedbackSuccess>{copy.reported}</FeedbackSuccess>
        ) : (
          <Button
            className={cx(
              button({ height: 44, text: 13, on: open }),
              'min-w-0 px-1! wrap-anywhere',
            )}
            aria-expanded={open}
            aria-controls={open ? form : undefined}
            onPress={() => setOpen(!open)}
          >
            {copy.report}
          </Button>
        )}
      </div>
      {open && !receipt?.report && (
        <div id={form} className="flex flex-col gap-2 rounded-10 bg-panel p-3">
          <SelectField
            label={copy.reason}
            placeholder={copy.chooseReason}
            value={reason}
            onChange={setReason}
            options={(Object.keys(copy.reasons) as Reason[])
              .filter(
                (id) => id !== (kind === 'qualification' ? 'wrong_center' : 'wrong_qualification'),
              )
              .map((id) => ({ id, label: copy.reasons[id] }))}
          />
          {goal && (
            <CheckboxRow isSelected={consent} onChange={setConsent} description={copy.shareHint}>
              {copy.share}
              <span className="block wrap-anywhere italic">“{goal}”</span>
            </CheckboxRow>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className={button({ variant: 'primary', height: 36, text: 13 })}
              isDisabled={!reason || mutation.isPending}
              onPress={() => {
                if (reason)
                  submit({
                    action: 'report',
                    reason,
                    ...(consent && goal ? { shared_goal: { goal, consent: true } } : {}),
                  })
              }}
            >
              {copy.submit}
            </Button>
            <Button
              className={button({ height: 36, text: 13 })}
              isDisabled={mutation.isPending}
              onPress={() => {
                setOpen(false)
                setConsent(false)
                setReason(null)
                mutation.reset()
              }}
            >
              {copy.cancel}
            </Button>
          </div>
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="m-0 text-warn-ink">
          {failureMessage(mutation.error)}
        </p>
      )}
      <p className="m-0">{copy.note}</p>
    </section>
  )
}
