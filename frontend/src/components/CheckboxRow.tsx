import type { ReactNode } from 'react'
import { Checkbox } from 'react-aria-components'
import { cx } from '../lib/style.ts'

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
      className={cx(
        'group flex min-h-8 cursor-pointer items-start gap-[0.7rem] text-15 leading-[1.4] text-navy',
        'data-disabled:cursor-default data-disabled:opacity-60',
        className,
      )}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      {/* A box that fills blue when ticked. */}
      <span
        className={cx(
          'mt-[0.05rem] grid size-5.5 shrink-0 place-items-center rounded-6 border-2 border-hover-border bg-surface text-white',
          'group-data-hovered:border-blue group-data-selected:border-fill group-data-selected:bg-fill',
          'group-data-focus-visible:outline-3 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus',
        )}
        aria-hidden="true"
      >
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
      <span className="flex min-w-0 flex-col gap-[0.15rem]">
        {children}
        {description && <span className="text-13 text-muted">{description}</span>}
      </span>
    </Checkbox>
  )
}
