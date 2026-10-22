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
import { useCopy } from '../../i18n/copy.ts'
import { shortName } from './address.ts'

const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-focus-visible:outline-solid'

/** A box that finds a qualification by name as it's typed, and its list. Reports' QualificationField uses it too. */
export const combo = {
  field: 'flex flex-col gap-[0.35rem]',
  label: 'text-14 font-semibold text-navy',
  box: 'relative flex items-center',
  icon: 'pointer-events-none absolute left-3 text-muted',
  input:
    'min-h-11 w-full rounded-12 border border-hover-border bg-surface py-2 pr-[2.6rem] pl-[2.3rem] text-15 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue',
  open: 'absolute right-1 grid size-9 cursor-pointer place-items-center rounded-9 border-0 bg-transparent text-muted',
  popover:
    'max-h-[min(20rem,var(--visual-viewport-height,60vh))] w-(--trigger-width) overflow-auto rounded-12 border border-border bg-surface shadow-popover',
  list: 'p-[0.3rem] outline-none',
  option:
    'cursor-pointer rounded-8 px-[0.7rem] py-[0.55rem] text-[0.9rem] text-navy outline-none data-focused:bg-soft',
}

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
  const en = useCopy()
  const copy = en.training.filters

  const [text, setText] = useState('')
  const options = useMemo(
    () =>
      [...names]
        .filter(([code]) => !chosen.includes(code))
        .map(([code, name]) => ({ id: code, name })),
    [names, chosen],
  )

  return (
    <div className="flex flex-col gap-[0.6rem]">
      {chosen.length > 0 && (
        <TagGroup
          aria-label={copy.qualification}
          onRemove={(keys) => onChange(chosen.filter((code) => !keys.has(code)))}
        >
          <TagList className="flex flex-wrap gap-[0.4rem]">
            {chosen.map((code) => {
              const name = shortName(names.get(code) ?? code)
              return (
                <Tag
                  key={code}
                  id={code}
                  textValue={names.get(code) ?? code}
                  className={`inline-flex max-w-full items-center gap-[0.3rem] rounded-full border border-pill-border bg-pill py-1 pr-[0.3rem] pl-[0.7rem] text-14 font-semibold text-pill-hover-ink outline-none ${ring}`}
                >
                  {name}
                  <Button
                    slot="remove"
                    className="grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-inherit data-hovered:bg-pill-hover"
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
        className={combo.field}
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
        <Label className={combo.label}>{copy.addQualification}</Label>
        <div className={combo.box}>
          <Icon name="search" className={combo.icon} />
          <Input className={combo.input} placeholder={en.training.filters.anyQualification} />
          <Button className={combo.open}>
            <Icon name="chevron" />
          </Button>
        </div>
        <Popover className={combo.popover}>
          <ListBox className={combo.list}>
            {(option: { id: string; name: string }) => (
              <ListBoxItem id={option.id} textValue={option.name} className={combo.option}>
                {option.name}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
    </div>
  )
}
