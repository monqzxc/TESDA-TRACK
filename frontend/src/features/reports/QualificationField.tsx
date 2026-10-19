import { useMemo } from 'react'
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
} from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import pickerStyles from '../training/QualificationPicker.module.css'

/**
 * One qualification from the catalog (Streamlit's selectbox): a box that finds it by name as the administrator types,
 * as there are hundreds. Leaving the box puts the chosen name back.
 */
export function QualificationField({
  label,
  catalog,
  value,
  onChange,
}: {
  label: string
  catalog: readonly Qualification[]
  value: string
  onChange: (code: string) => void
}) {
  const items = useMemo(
    () => catalog.map((qualification) => ({ id: qualification.code, name: qualification.name })),
    [catalog],
  )
  return (
    <ComboBox
      className={pickerStyles.field}
      defaultItems={items}
      value={value}
      onChange={(code: Key | null) => {
        if (code !== null) onChange(String(code))
      }}
      menuTrigger="focus"
    >
      <Label className={pickerStyles.label}>{label}</Label>
      <div className={pickerStyles.box}>
        <Icon name="search" className={pickerStyles.icon} />
        <Input className={pickerStyles.input} />
        <Button className={pickerStyles.open}>
          <Icon name="chevron" />
        </Button>
      </div>
      <Popover className={pickerStyles.popover}>
        <ListBox className={pickerStyles.list}>
          {(item: { id: string; name: string }) => (
            <ListBoxItem id={item.id} textValue={item.name} className={pickerStyles.option}>
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  )
}
