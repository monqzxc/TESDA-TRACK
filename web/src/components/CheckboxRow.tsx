import type { ReactNode } from 'react'
import { Checkbox } from 'react-aria-components'
import { cx } from '../lib/style.ts'
import styles from './CheckboxRow.module.css'

interface CheckboxRowProps {
  isSelected: boolean
  onChange: (selected: boolean) => void
  children: ReactNode
  /** A line under the label, read as part of it. */
  description?: ReactNode
  isDisabled?: boolean
  className?: string
}

/** A checkbox and its label (React Aria's Checkbox), drawn as the account forms draw theirs. */
export function CheckboxRow({
  isSelected,
  onChange,
  children,
  description,
  isDisabled,
  className,
}: CheckboxRowProps) {
  return (
    <Checkbox
      className={cx(styles.checkbox, className)}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      <span className={styles.box} aria-hidden="true">
        <svg viewBox="0 0 18 18" focusable="false">
          <polyline points="3.5 9.5 7.5 13.5 14.5 5" />
        </svg>
      </span>
      <span className={styles.text}>
        {children}
        {description && <span className={styles.description}>{description}</span>}
      </span>
    </Checkbox>
  )
}
