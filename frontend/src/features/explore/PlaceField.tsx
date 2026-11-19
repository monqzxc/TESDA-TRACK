import { useMemo } from 'react'
import {
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
} from 'react-aria-components'
import { useCopy } from '../../i18n/copy.ts'
import { combo } from '../training/QualificationPicker.tsx'
import { gazetteer, suggestPlaces, type PlaceOption } from '../training/places.ts'
import { useTrainingStore } from '../training/state.ts'

/**
 * "Or type a city or province", suggesting places as the learner types. Picking one measures from its town center
 * (a province from its capital); text typed without picking is still looked up, as before suggestions existed.
 */
export function PlaceField({ text }: { text: string }) {
  const copy = useCopy().explore.location
  const { setPlaceText, choosePlace } = useTrainingStore.getState()
  // Once a place is picked, the box holds its name: nothing more to suggest until the learner types again.
  const chosen = useTrainingStore((state) => state.placePoint?.label === text && text !== '')
  const options = useMemo(() => (chosen ? [] : suggestPlaces(text, gazetteer())), [text, chosen])

  return (
    <ComboBox
      className="flex flex-col gap-1"
      items={options}
      inputValue={text}
      onInputChange={setPlaceText}
      value={null}
      onChange={(id: Key | null) => {
        const option = options.find((item) => item.id === id)
        if (option) choosePlace(option)
      }}
      allowsCustomValue
      menuTrigger="input"
    >
      <Label className="text-13 font-semibold text-ink">{copy.place}</Label>
      <Input
        className="min-h-10 rounded-10 border border-hover-border bg-surface px-3 text-15 text-navy placeholder:text-muted data-focused:border-blue"
        placeholder={copy.placePlaceholder}
      />
      <Popover className={combo.popover}>
        <ListBox className={combo.list} aria-label={copy.placeSuggestions}>
          {(option: PlaceOption) => (
            <ListBoxItem id={option.id} textValue={option.label} className={combo.option}>
              <span className="block">{option.label}</span>
              {option.capital && (
                <span className="block text-12 text-muted">
                  {copy.placeCapital(option.capital)}
                </span>
              )}
            </ListBoxItem>
          )}
        </ListBox>
        {/* GeoNames' town points are CC BY 4.0: credited where they're offered. */}
        <p className="m-0 border-t border-rule px-3 py-1.5 text-11 text-muted">
          {copy.placeCredit}{' '}
          <a
            href="https://www.geonames.org/"
            target="_blank"
            rel="noreferrer"
            className="text-blue"
          >
            GeoNames
          </a>{' '}
          · PSA PSGC
        </p>
      </Popover>
    </ComboBox>
  )
}
