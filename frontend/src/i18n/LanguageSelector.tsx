import { useId } from 'react'
import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components'
import { cx } from '../lib/style.ts'
import { setLanguage, useLanguage } from './copy.ts'
import { isLanguage, languages } from './languages.ts'
import { Icon } from '../components/Icon.tsx'

/** `header` is the compact top-bar version, on the navy band; `light` puts it on a light bar (the landing page). */
export function LanguageSelector({
  header = false,
  light = false,
}: {
  header?: boolean
  light?: boolean
}) {
  const language = useLanguage()
  const id = useId()
  if (header && light)
    return (
      <Select
        value={language}
        onChange={(key) => {
          if (typeof key === 'string' && isLanguage(key)) setLanguage(key)
        }}
        className="w-40 min-w-0 font-text max-[431px]:w-32"
      >
        <Label className="sr-only">Language / Wika</Label>
        <Button className="group flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-full border border-(--l-line) bg-(--l-surface) px-3.5 py-2 text-left font-text text-14 leading-5 font-medium text-(--l-ink) transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus hovered:border-(--l-navy) hovered:bg-(--l-panel)">
          <Icon name="globe" size="1.125rem" className="flex-none" />
          <SelectValue className="min-w-0 flex-1 truncate" />
          <Icon
            name="chevron"
            size="0.9rem"
            className="flex-none transition-transform group-data-pressed:rotate-180"
          />
        </Button>
        <Popover
          placement="bottom end"
          offset={8}
          className="landing z-100 max-h-[min(28rem,var(--available-height))] w-[208px] max-w-[calc(100vw-32px)] overflow-auto rounded-16 border border-(--l-line) bg-(--l-surface) p-1.5 font-text shadow-[0_12px_32px_-8px_rgb(15_30_55/0.24)]"
        >
          <ListBox aria-label="Language / Wika" className="outline-none" items={languages}>
            {({ code, name }) => (
              <ListBoxItem
                id={code}
                textValue={name.split(' / ')[0]}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-10 px-3 py-2 text-14 leading-5 text-(--l-ink) outline-none data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-focus data-focused:bg-(--l-panel) data-hovered:bg-(--l-panel) data-selected:bg-(--l-navy-soft) data-selected:font-semibold data-selected:text-(--l-navy)"
              >
                {({ isSelected }) => (
                  <>
                    <span lang={code}>{name.split(' / ')[0]}</span>
                    {isSelected && <Icon name="tick" size="1rem" className="flex-none" />}
                  </>
                )}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </Select>
    )
  return (
    <div className={cx('relative min-w-0', header ? 'w-40 max-[431px]:w-32' : 'w-full')}>
      <label
        htmlFor={id}
        className={header ? 'sr-only' : 'mb-1 block text-14 font-semibold text-navy'}
      >
        Language / Wika
      </label>
      <select
        id={id}
        value={language}
        onChange={(event) => {
          const next = event.target.value
          if (isLanguage(next)) setLanguage(next)
        }}
        className={cx(
          'min-h-11 w-full cursor-pointer rounded-8 border px-2 py-2 text-14 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus',
          header
            ? 'border-white/35 bg-(--band) text-white'
            : 'border-hover-border bg-surface text-navy hovered:border-blue',
        )}
      >
        {languages.map(({ code, name }) => (
          <option key={code} value={code} lang={code}>
            {header ? name.split(' / ')[0] : name}
          </option>
        ))}
      </select>
      {!header && language !== 'en' && (
        <p className="mt-1 mb-2 text-13 leading-relaxed text-muted" lang="en">
          Translations are being expanded. Some text appears in English.
        </p>
      )}
    </div>
  )
}
