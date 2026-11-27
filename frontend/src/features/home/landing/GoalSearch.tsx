import { useRef, useState, type FormEvent } from 'react'
import { FieldError, Input, Label, TextField } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { Icon } from '../../../components/Icon.tsx'
import { useCopy } from '../../../i18n/copy.ts'
import { cx } from '../../../lib/style.ts'
import { paths } from '../../../paths.ts'
import { useExploreStore } from '../../explore/useExplore.ts'
import { GOAL_MAX_LENGTH } from '../../finder/store.ts'
import { landingButton } from './styles.ts'

/**
 * "What can you do?": one line and Find my path. Every way in opens the Career Map (PO, 19 Nov 2026): the goal goes
 * to the finder's store, never the address, and its search runs on arrival.
 */
export function GoalSearch({ id }: { id: string }) {
  const copy = useCopy().landingPage.hero
  const navigate = useNavigate()
  const [goal, setGoal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!goal.trim()) {
      setError(copy.empty)
      field.current?.focus()
      return
    }
    useExploreStore.getState().setDraft(goal.trim())
    void navigate(paths.explore, { state: { focusSearch: true, runSearch: true } })
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[36rem]">
      <TextField
        value={goal}
        onChange={(value) => {
          setGoal(value)
          setError(null)
        }}
        maxLength={GOAL_MAX_LENGTH}
        isRequired
        isInvalid={error !== null}
        validationBehavior="aria"
        className="flex flex-col gap-2"
      >
        <Label htmlFor={id} className="sr-only">
          {copy.label}
        </Label>
        <div
          className={cx(
            'flex items-center gap-2 rounded-full border bg-(--l-surface) p-1.5 pl-5 shadow-[0_10px_30px_-18px_rgb(15_20_30/0.5)] transition-[border-color,box-shadow] duration-150',
            'focus-within:border-(--l-navy) focus-within:shadow-[0_0_0_4px_var(--l-navy-soft)]',
            error ? 'border-[#b42318]' : 'border-(--l-line)',
          )}
        >
          <Icon name="search" size="1.2rem" className="flex-none text-(--l-muted)" />
          <Input
            id={id}
            ref={field}
            placeholder={copy.placeholder}
            autoComplete="off"
            className="min-h-11 w-full min-w-0 border-0 bg-transparent font-text text-16 text-(--l-ink) outline-none placeholder:text-(--l-muted) focus-visible:outline-none"
          />
          <button
            type="submit"
            className={cx(landingButton('solid'), 'flex-none max-[420px]:px-4')}
          >
            <span className="max-[420px]:sr-only">{copy.submit}</span>
            <Icon
              name="arrowRight"
              size="1.1rem"
              className="transition-[translate] duration-200 group-hovered:translate-x-0.5"
            />
          </button>
        </div>
        <FieldError className="pl-5 text-13 font-semibold text-[#b42318] dark:text-[#ff9b9b]">
          {error}
        </FieldError>
      </TextField>
    </form>
  )
}
