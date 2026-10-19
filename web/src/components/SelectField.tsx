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
import utilities from '../styles/utilities.module.css'
import { Icon } from './Icon.tsx'
import styles from './SelectField.module.css'

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
}

/**
 * A labelled single choice from a list (React Aria's Select): a button that opens the list, with the keyboard and
 * screen-reader support of a native select.
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
}: SelectFieldProps<K>) {
  const ids = new Set<Key>(options.map((option) => option.id))
  return (
    <Select
      className={cx(styles.field, className)}
      value={value}
      onChange={(key) => {
        // Only the options' own ids come back; the cast names their type.
        if (key !== null && ids.has(key)) onChange(key as K)
      }}
      placeholder={placeholder}
      isDisabled={isDisabled}
    >
      <Label className={labelHidden ? utilities.visuallyHidden : styles.label}>{label}</Label>
      <Button className={styles.button}>
        <SelectValue className={styles.value} />
        <Icon name="chevron" size="1.1rem" className={styles.chevron} />
      </Button>
      {description && (
        <Text slot="description" className={styles.help}>
          {description}
        </Text>
      )}
      <Popover className={styles.popover}>
        <ListBox className={styles.list} items={options}>
          {(option) => (
            <ListBoxItem id={option.id} className={styles.option} textValue={option.label}>
              {({ isSelected }) => (
                <>
                  <span>{option.label}</span>
                  {isSelected && <Icon name="tick" size="1.05rem" className={styles.tick} />}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  )
}
