import { useMemo, useState } from 'react'
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Tag,
  TagGroup,
  TagList,
  type Key,
} from 'react-aria-components'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { shortName } from './address.ts'
import styles from './QualificationPicker.module.css'

const copy = en.training.filters

interface QualificationPickerProps {
  /** Every qualification in the catalog, by code. */
  names: ReadonlyMap<string, string>
  chosen: readonly string[]
  onChange: (codes: string[]) => void
}

/**
 * The qualifications to filter by (Streamlit's multiselect): the chosen ones as chips that can be removed, and a box
 * that finds more by name as the learner types. There are hundreds, so a plain list would be too long to read.
 */
export function QualificationPicker({ names, chosen, onChange }: QualificationPickerProps) {
  const [text, setText] = useState('')
  const options = useMemo(
    () =>
      [...names]
        .filter(([code]) => !chosen.includes(code))
        .map(([code, name]) => ({ id: code, name })),
    [names, chosen],
  )

  return (
    <div className={styles.picker}>
      {chosen.length > 0 && (
        <TagGroup
          aria-label={copy.qualification}
          onRemove={(keys) => onChange(chosen.filter((code) => !keys.has(code)))}
        >
          <TagList className={styles.tags}>
            {chosen.map((code) => {
              const name = shortName(names.get(code) ?? code)
              return (
                <Tag
                  key={code}
                  id={code}
                  textValue={names.get(code) ?? code}
                  className={styles.tag}
                >
                  {name}
                  <Button
                    slot="remove"
                    className={styles.remove}
                    aria-label={copy.removeQualification(names.get(code) ?? code)}
                  >
                    <Icon name="close" />
                  </Button>
                </Tag>
              )
            })}
          </TagList>
        </TagGroup>
      )}
      <ComboBox
        className={styles.field}
        items={options}
        inputValue={text}
        onInputChange={setText}
        value={null}
        onChange={(code: Key | null) => {
          if (code === null) return
          onChange([...chosen, String(code)])
          setText('')
        }}
        menuTrigger="focus"
      >
        <Label className={styles.label}>{copy.addQualification}</Label>
        <div className={styles.box}>
          <Icon name="search" className={styles.icon} />
          <Input className={styles.input} placeholder={en.training.filters.anyQualification} />
          <Button className={styles.open}>
            <Icon name="chevron" />
          </Button>
        </div>
        <Popover className={styles.popover}>
          <ListBox className={styles.list}>
            {(option: { id: string; name: string }) => (
              <ListBoxItem id={option.id} textValue={option.name} className={styles.option}>
                {option.name}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
    </div>
  )
}
