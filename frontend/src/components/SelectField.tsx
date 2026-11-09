import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Text,
  type Key,
} from 'react-aria-components'
import { cx } from '../lib/style.ts'
import { Icon, type IconName } from './Icon.tsx'

export interface SelectOption<K extends string> {
  id: K
  label: string
}

interface SelectFieldProps<K extends string> {
  label: string
  options: readonly SelectOption<K>[]
  /** The chosen option, or null for none (the placeholder shows). */
  value: K | null
  onChange: (value: K) => void
  placeholder?: string
  description?: string
  className?: string
  isDisabled?: boolean
  /** The label is read by screen readers but not drawn, where what the list is for shows on screen already. */
  labelHidden?: boolean
  /** Drawn as one row instead: this icon and the label on the left, the choice on the right (the training filters). */
  icon?: IconName
  /** In a row, the choice shows in ink rather than grey: it narrows something, rather than being the default. */
  active?: boolean
}

/**
 * A labelled single choice from a list (React Aria's Select): a button that opens the list, with the keyboard and
 * screen-reader support of a native select. Drawn after the Streamlit app's select boxes, matching the account
 * forms' fields (auth/fields.tsx).
 */
export function SelectField<K extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  description,
  className,
  isDisabled,
  labelHidden = false,
  icon,
  active = false,
}: SelectFieldProps<K>) {
  const ids = new Set<Key>(options.map((option) => option.id))
  return (
    <Select
      className={cx('flex min-w-0 flex-col gap-[0.35rem]', className)}
      value={value}
      onChange={(key) => {
        // Only the options' own ids come back; the cast names their type.
        if (key !== null && ids.has(key)) onChange(key as K)
      }}
      placeholder={placeholder}
      isDisabled={isDisabled}
    >
      <Label className={labelHidden || icon ? 'sr-only' : 'text-15 font-semibold text-navy'}>
        {label}
      </Label>
      <Button
        className={cx(
          'flex w-full cursor-pointer items-center justify-between gap-2 rounded-12 border bg-surface text-left text-navy',
          icon
            ? 'group min-h-12 border-border px-[0.85rem] py-2 text-15 shadow-[0_1px_2px_rgb(16_24_40/0.05)]'
            : 'min-h-11.5 border-hover-border px-[0.8rem] py-[0.55rem] text-16',
          'data-focus-visible:border-blue data-hovered:border-blue data-pressed:border-blue',
          'data-disabled:cursor-not-allowed data-disabled:bg-disabled-bg data-disabled:text-disabled-ink',
        )}
      >
        {icon && (
          <>
            <Icon name={icon} size="1.25rem" className="flex-none" />
            {/* The label drawn in the row; screen readers have it from the Label. */}
            <span className="mr-auto min-w-0 leading-tight" aria-hidden="true">
              {label}
            </span>
          </>
        )}
        <SelectValue
          className={cx(
            'min-w-0 truncate data-placeholder:text-muted',
            icon && 'max-w-[55%] text-right',
            icon && (active ? 'font-medium text-navy' : 'text-muted'),
          )}
        />
        <Icon name="chevron" size="1.1rem" className="flex-none text-muted" />
      </Button>
      {description && (
        <Text slot="description" className="text-14 text-muted">
          {description}
        </Text>
      )}
      <Popover className="max-h-[min(22rem,var(--visual-viewport-height,60vh))] w-(--trigger-width) overflow-auto rounded-12 border border-border bg-surface shadow-popover">
        <ListBox className="p-[0.3rem] outline-none" items={options}>
          {(option) => (
            <ListBoxItem
              id={option.id}
              className={cx(
                'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-8 px-[0.7rem] py-2 text-15 leading-[1.35] text-navy outline-none',
                'data-focused:bg-soft data-hovered:bg-soft data-selected:font-[650]',
                'data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-focus data-focus-visible:outline-solid',
              )}
              textValue={option.label}
            >
              {({ isSelected }) => (
                <>
                  <span>{option.label}</span>
                  {isSelected && (
                    <Icon name="tick" size="1.05rem" className="flex-none text-blue" />
                  )}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  )
}
