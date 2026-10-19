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
import { en } from '../copy/en.ts'
import styles from './forms.module.css'

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

/** The drawn box of a CheckboxButton (styled by forms.module.css's .checkbox). */
export function CheckMark() {
  return (
    <span className={styles.box} aria-hidden="true">
      <svg viewBox="0 0 18 18" focusable="false">
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
    <TextField {...props} className={styles.field}>
      <Label className={styles.label}>{label}</Label>
      <Input ref={input} className={styles.input} placeholder={placeholder} />
      {description && (
        <Text slot="description" className={styles.help}>
          {description}
        </Text>
      )}
      <FieldError className={styles.fieldError} />
    </TextField>
  )
}
