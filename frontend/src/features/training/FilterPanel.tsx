import { useId, useState, type ReactNode } from 'react'
import {
  Button,
  Input,
  Label,
  Switch,
  Text,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  type Key,
} from 'react-aria-components'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy, getCopy } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import {
  DELIVERY_MODES,
  KINDS,
  NO_FILTERS,
  WINDOWS,
  shortName,
  type CenterKind,
  type DeliveryMode,
  type TrainingFilters,
} from './address.ts'
import { QualificationPicker } from './QualificationPicker.tsx'
import { useTrainingFilters, useTrainingStore } from './state.ts'
import type { CenterResults } from './useCenters.ts'

const badge =
  'inline-block min-w-[1.4rem] rounded-full bg-fill px-[0.45rem] py-[0.05rem] text-center text-12 leading-[1.35] font-bold text-white'
const help = 'm-0 text-13 leading-[1.5] text-muted'
const notice =
  'm-0 flex items-start gap-[0.4rem] rounded-10 bg-warn-bg px-[0.7rem] py-[0.55rem] text-14 font-semibold text-warn-ink'
const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

/**
 * Center types as one joined bar: only the outer corners round, the chosen ones filled. Both chosen, a faint seam
 * keeps the two halves readable.
 */
function kindClass(index: number, bothChosen: boolean): string {
  return cx(
    'inline-flex min-h-11 flex-[1_1_0] cursor-pointer items-center justify-center gap-[0.4rem] border border-border bg-surface px-2 text-13 font-semibold whitespace-nowrap text-navy',
    'data-hovered:bg-soft data-selected:border-fill data-selected:bg-fill data-selected:text-white',
    ring,
    'data-focus-visible:relative data-focus-visible:z-1',
    index === 0
      ? 'rounded-[12px_0_0_12px]'
      : cx(
          'rounded-[0_12px_12px_0]',
          bothChosen ? 'data-selected:border-l-[#ffffff59]' : 'border-l-0',
        ),
  )!
}

/** Whether the panel is folded away, kept for this browser. */
const FOLDED_KEY = 'tesda-track.training-filters'

const ALL = 'all'

/**
 * The filters (classic/training_view.py _filters): they apply as soon as they change, and the panel folds away to
 * free the map. Each section says how many filters it sets, and, folded, what it holds.
 */
export function FilterPanel({ results }: { results: CenterResults }) {
  const en = useCopy()
  const copy = en.training.filters

  const { filters, update } = useTrainingFilters()
  const store = useTrainingStore()
  const [folded, setFolded] = useState(() => {
    const saved = readItem(FOLDED_KEY)
    // On a phone the open panel would fill the screen: it starts folded until the learner opens it.
    return saved ? saved === 'folded' : (window.matchMedia?.('(max-width: 640px)').matches ?? false)
  })
  const headingId = useId()
  const counts = filterCounts(filters, store.useLocation, store.placeText)
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  const fold = (next: boolean) => {
    setFolded(next)
    writeItem(FOLDED_KEY, next ? 'folded' : 'open')
  }
  const clearAll = () => {
    update({ ...NO_FILTERS, sort: filters.sort })
    store.setPlaceText('')
    store.setUseLocation(false)
  }
  // A new filter shows its first result in full again.
  const set = (changes: Partial<TrainingFilters>) => update({ ...changes, center: null })

  const kinds = filters.kinds.length ? filters.kinds : KINDS
  const placeText = store.placeText.trim()
  const where = [
    ...(store.useLocation ? [copy.yourLocation] : []),
    ...(placeText ? [placeText] : []),
  ]
  const regionName =
    results.regions.find((region) => region.code === results.region)?.name ?? results.region

  // After classic/training.css's filter panel: a white card of sections divided by rules.
  return (
    <section
      data-tour="training-filters"
      aria-labelledby={headingId}
      className="flex min-h-0 flex-col rounded-18 border border-border bg-surface px-[1.1rem] pt-[0.35rem] pb-[0.4rem]"
    >
      <div
        className={cx(
          'flex items-center gap-2 pt-[0.55rem] pb-[0.7rem]',
          !folded && 'border-b border-rule',
        )}
      >
        <h2
          id={headingId}
          className="m-0 flex flex-1 items-center gap-2 font-text text-17 font-bold tracking-normal text-navy"
        >
          <Icon name="filter" />
          {copy.heading}
          {total > 0 && (
            <span className={badge}>
              <span aria-hidden="true">{total}</span>
              <span className="sr-only">, {copy.count(total)}</span>
            </span>
          )}
        </h2>
        <Button
          className={button({ variant: 'tertiary', height: 36, text: 14, medium: true })}
          onPress={clearAll}
        >
          {copy.clear}
        </Button>
        {/* Fold the panel away: an icon button with its name for screen readers. */}
        <Button
          className="grid size-9.5 cursor-pointer place-items-center rounded-10 border border-border bg-surface text-navy shadow-[0_1px_3px_rgb(var(--track-shadow-rgb)/0.06)] data-hovered:bg-soft"
          aria-label={folded ? copy.show : copy.hide}
          aria-expanded={!folded}
          onPress={() => fold(!folded)}
        >
          <Icon
            name="chevron"
            className={cx('transition-transform duration-200 ease-[ease]', !folded && 'rotate-180')}
          />
        </Button>
      </div>

      {!folded && (
        <div className="min-h-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain [&>*+*]:border-t [&>*+*]:border-rule">
          <Section
            icon="learn"
            title={copy.type}
            count={counts.type}
            summary={kinds.length === 1 ? en.training.kinds[kinds[0]] : en.training.bothKinds}
            open
          >
            <ToggleButtonGroup
              className="flex"
              aria-label={copy.type}
              selectionMode="multiple"
              selectedKeys={kinds}
              onSelectionChange={(keys: Set<Key>) => {
                const chosen = KINDS.filter((kind) => keys.has(kind))
                // Both, or neither, is every center.
                set({ kinds: chosen.length === 1 ? chosen : [] })
              }}
            >
              {KINDS.map((kind: CenterKind, index) => (
                <ToggleButton
                  key={kind}
                  id={kind}
                  className={kindClass(index, kinds.length === KINDS.length)}
                >
                  <Icon name={kind === 'training' ? 'learn' : 'clipboard'} />
                  {en.training.kinds[kind]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Section>

          <Section
            icon="pin"
            title={copy.location}
            count={counts.location}
            summary={where.join(' · ') || copy.anywhere}
            open
          >
            {/* The location switch: a track with a thumb that slides across. */}
            <Switch
              className="group flex cursor-pointer items-center gap-3 text-15 font-semibold text-navy"
              isSelected={store.useLocation}
              onChange={store.setUseLocation}
            >
              <span
                className="relative h-6 w-[42px] flex-none rounded-full bg-dash transition-[background] duration-200 ease-[ease] group-data-focus-visible:outline-3 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus group-data-selected:bg-fill"
                aria-hidden="true"
              >
                <span className="absolute top-[3px] left-[3px] size-4.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[ease] group-data-selected:translate-x-[18px]" />
              </span>
              {copy.useCurrent}
            </Switch>
            <p className={help}>{copy.locationHelp}</p>
            <LocationStatus />
            <TextField
              className="flex flex-col gap-[0.35rem]"
              value={store.placeText}
              onChange={store.setPlaceText}
              type="search"
            >
              <Label className="text-14 font-semibold text-navy">{copy.place}</Label>
              <div className="relative flex items-center">
                <Icon name="pin" className="pointer-events-none absolute left-3 text-muted" />
                <Input
                  className="min-h-11 w-full rounded-12 border border-hover-border bg-surface py-2 pr-[0.8rem] pl-[2.3rem] text-15 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue"
                  placeholder={copy.placePlaceholder}
                />
              </div>
              <Text slot="description" className={help}>
                {copy.placeHelp}
              </Text>
            </TextField>
            {placeText && !results.place && !results.loading && (
              <p className={notice} role="status">
                {copy.placeNotFound(placeText)}
              </p>
            )}
          </Section>

          <Section
            icon="network"
            title={copy.region}
            count={counts.region}
            summary={regionName ?? copy.allRegions}
          >
            <SelectField
              label={copy.region}
              options={[
                { id: ALL, label: copy.allRegions },
                ...(results.region &&
                !results.regions.some((region) => region.code === results.region)
                  ? [{ id: results.region, label: results.region }]
                  : []),
                ...results.regions.map((region) => ({ id: region.code, label: region.name })),
              ]}
              value={results.region ?? ALL}
              onChange={(code) => set({ region: code === ALL ? null : code, province: null })}
            />
          </Section>

          <Section
            icon="home"
            title={copy.province}
            count={counts.province}
            summary={results.province ?? copy.allProvinces}
          >
            <SelectField
              label={copy.province}
              options={[
                { id: ALL, label: copy.allProvinces },
                ...(results.province && !results.provinceOptions.includes(results.province)
                  ? [{ id: results.province, label: results.province }]
                  : []),
                ...results.provinceOptions.map((name) => ({ id: name, label: name })),
              ]}
              value={results.province ?? ALL}
              onChange={(name) => set({ province: name === ALL ? null : name })}
              isDisabled={!results.provinceOptions.length}
              description={
                results.provinceOptions.length
                  ? undefined
                  : results.region
                    ? copy.noProvincesInRegion
                    : copy.noProvinces
              }
            />
          </Section>

          <Section
            icon="briefcase"
            title={copy.qualification}
            count={counts.qualification}
            summary={
              results.codes.map((code) => shortName(results.names.get(code) ?? code)).join(', ') ||
              copy.anyQualification
            }
            open={results.codes.length > 0}
          >
            <QualificationPicker
              names={results.names}
              chosen={results.codes}
              onChange={(qualifications) => set({ qualifications })}
            />
          </Section>

          <Section
            icon="checklist"
            title={copy.more}
            count={counts.more}
            summary={moreSummary(filters)}
          >
            <SelectField<DeliveryMode | typeof ALL>
              label={copy.mode}
              description={copy.modeHelp}
              options={[
                { id: ALL, label: copy.anyMode },
                ...DELIVERY_MODES.map((mode) => ({ id: mode, label: en.training.delivery[mode] })),
              ]}
              value={filters.mode ?? ALL}
              onChange={(mode) => set({ mode: mode === ALL ? null : mode })}
            />
            <SelectField
              label={copy.availability}
              description={copy.availabilityHelp}
              options={[
                { id: ALL, label: copy.anyTime },
                ...WINDOWS.map((days) => ({
                  id: String(days),
                  label: en.training.availability[String(days) as '30' | '90'],
                })),
              ]}
              value={filters.within ? String(filters.within) : ALL}
              onChange={(days) =>
                set({ within: days === ALL ? null : (Number(days) as (typeof WINDOWS)[number]) })
              }
            />
            <CheckboxRow
              isSelected={filters.scholarship}
              onChange={(scholarship) => set({ scholarship })}
              description={copy.scholarshipHelp}
            >
              {copy.scholarship}
            </CheckboxRow>
          </Section>
        </div>
      )}
    </section>
  )
}

/** A filter section: its title and count, and when folded, what it holds. */
function Section({
  icon,
  title,
  count,
  summary,
  open = false,
  children,
}: {
  icon: IconName
  title: string
  count: number
  summary: string
  open?: boolean
  children: ReactNode
}) {
  const [isOpen, setOpen] = useState(open)
  return (
    <details
      className="group"
      open={isOpen}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 pt-3 pb-[0.65rem] text-navy hovered:text-blue [&::-webkit-details-marker]:hidden">
        <Icon name={icon} className="mt-[0.15rem] flex-none text-[1.3rem]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-[0.4rem] text-17 font-semibold">
            {title}
            {count > 0 && <span className={badge}>{count}</span>}
          </span>
          {/* What a folded section holds, under its title. */}
          {!isOpen && <span className="truncate text-15 text-muted">{summary}</span>}
        </span>
        <Icon
          name="chevron"
          className="mt-[0.15rem] flex-none text-[1.3rem] transition-transform duration-200 ease-[ease] group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-3 pb-[0.85rem]">{children}</div>
    </details>
  )
}

/** Whether the browser is finding the learner's location, or why it couldn't. */
function LocationStatus() {
  const en = useCopy()
  const copy = en.training.filters

  const locating = useTrainingStore((state) => state.locating)
  const error = useTrainingStore((state) => state.locationError)
  if (error) {
    return (
      <p className={notice} role="status">
        <Icon name="pin" />
        {copy.locationErrors[error]}
      </p>
    )
  }
  if (locating) {
    return (
      <p className={help} role="status">
        {copy.locating}
      </p>
    )
  }
  return null
}

/** How many filters each section sets. Both center types together filter nothing. */
export function filterCounts(filters: TrainingFilters, useLocation: boolean, placeText: string) {
  return {
    type: filters.kinds.length === 1 ? 1 : 0,
    location: Number(useLocation) + Number(Boolean(placeText.trim())),
    region: Number(Boolean(filters.region)),
    province: Number(Boolean(filters.province)),
    qualification: filters.qualifications.length,
    more:
      Number(Boolean(filters.mode)) + Number(Boolean(filters.within)) + Number(filters.scholarship),
  }
}

function moreSummary(filters: TrainingFilters): string {
  const en = getCopy()
  const copy = en.training.filters

  const parts: string[] = []
  if (filters.mode) parts.push(en.training.delivery[filters.mode])
  if (filters.within) parts.push(en.training.availability[String(filters.within) as '30' | '90'])
  if (filters.scholarship) parts.push(copy.scholarship)
  return parts.join(' · ') || copy.anyMode
}
