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
import { combo } from '../training/QualificationPicker.tsx'

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
      className={combo.field}
      defaultItems={items}
      value={value}
      onChange={(code: Key | null) => {
        if (code !== null) onChange(String(code))
      }}
      menuTrigger="focus"
    >
      <Label className={combo.label}>{label}</Label>
      <div className={combo.box}>
        <Icon name="search" className={combo.icon} />
        <Input className={combo.input} />
        <Button className={combo.open}>
          <Icon name="chevron" />
        </Button>
      </div>
      <Popover className={combo.popover}>
        <ListBox className={combo.list}>
          {(item: { id: string; name: string }) => (
            <ListBoxItem id={item.id} textValue={item.name} className={combo.option}>
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  )
}
