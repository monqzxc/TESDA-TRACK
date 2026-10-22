import { useEffect, useRef } from 'react'
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField,
  type TextFieldProps,
} from 'react-aria-components'
import { ApiError } from '../api/errors.ts'
import { getCopy } from '../i18n/copy.ts'
import { formStyle } from './styles.ts'

// The account forms' text fields and checks. Fields validate the way React Aria does by default ("native"): the
// messages show when the form is sent, then follow the learner's typing. Every message is our own copy.

/**
 * HTML's rule for type="email" (the browser's own check), so an address this accepts never fails the browser's check
 * with the browser's wording. The API checks more (a dot in the domain) and says so if it refuses one.
 */
const EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

/** The API's limits (backend/tesda_track/schemas/accounts.py). */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128
export const NAME_MAX = 150

/** A form field's text, from the form's data. */
export function fieldText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** The message to show for a failed account request. ApiError messages are written for learners. */
export function failureMessage(error: unknown): string {
  const en = getCopy()

  return error instanceof ApiError ? error.message : en.service.requestFailed
}

type FieldProps = Omit<TextFieldProps, 'className' | 'children' | 'autoFocus'> & {
  label: string
  description?: string
  placeholder?: string
  /**
   * Take focus when the field appears. Only for a form the learner just asked for (switching from sign in to create
   * an account), never when a page or dialog opens.
   */
  focusOnMount?: boolean
}

/** The drawn box of a CheckboxButton (with formStyle.checkbox): a box that fills blue when ticked. */
export function CheckMark() {
  return (
    <span className={formStyle.box} aria-hidden="true">
      <svg
        viewBox="0 0 18 18"
        focusable="false"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="invisible size-3.5 fill-none stroke-current stroke-[2.6] group-data-selected:visible"
      >
        <polyline points="3.5 9.5 7.5 13.5 14.5 5" />
      </svg>
    </span>
  )
}

/** A labelled text field with its help text and its error message, both tied to the input for screen readers. */
export function Field({
  label,
  description,
  placeholder,
  focusOnMount = false,
  ...props
}: FieldProps) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusOnMount) input.current?.focus()
  }, [focusOnMount])
  return (
    <TextField {...props} className={formStyle.field}>
      <Label className={formStyle.label}>{label}</Label>
      <Input ref={input} className={formStyle.input} placeholder={placeholder} />
      {description && (
        <Text slot="description" className={formStyle.help}>
          {description}
        </Text>
      )}
      <FieldError className={formStyle.fieldError} />
    </TextField>
  )
}
