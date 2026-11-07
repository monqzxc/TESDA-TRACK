import { useId, useState, type ReactNode } from 'react'
import {
  Button,
  Input,
  Label,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  type Key,
} from 'react-aria-components'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import {
  ANY_DISTANCE,
  DELIVERY_MODES,
  KINDS,
  NO_FILTERS,
  RADIUS_KM,
  WINDOWS,
  shortName,
  type CenterKind,
  type DeliveryMode,
  type RadiusKm,
  type TrainingFilters,
} from './address.ts'
import { QualificationPicker } from './QualificationPicker.tsx'
import { useTrainingFilters, useTrainingStore } from './state.ts'
import type { CenterResults } from './useCenters.ts'

/** How many filters are on: a small grey count beside the heading. */
const badge =
  'inline-block min-w-[1.4rem] rounded-full bg-chip px-[0.45rem] py-[0.05rem] text-center text-12 leading-[1.35] font-bold text-navy tabular-nums'
const help = 'm-0 text-13 leading-[1.5] text-muted'
const notice =
  'm-0 flex items-start gap-[0.4rem] rounded-10 bg-warn-bg px-[0.7rem] py-[0.55rem] text-14 font-semibold text-warn-ink'
const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'
/** A group of filters, divided from the next by a rule. */
const group = 'flex flex-col gap-3 py-4'
const groupTitle =
  'm-0 flex items-center gap-2.5 font-text text-16 font-bold tracking-normal text-navy'

/**
 * Center types as tick-box buttons, so they read as choices rather than a legend: a chosen one fills indigo with its
 * box ticked white, the other stays white with an empty box. The two sit side by side in equal columns.
 */
const kindClass = cx(
  'group flex min-h-12 min-w-0 cursor-pointer items-center gap-2.5 rounded-14 border px-3.5 py-2 text-left text-15 leading-[1.25] font-semibold',
  'shadow-[0_1px_2px_rgb(16_24_40/0.06)] transition-[background,border-color,color,transform] duration-150 ease-[ease] data-pressed:scale-[0.98]',
  'border-border bg-surface text-navy data-hovered:border-blue data-hovered:bg-soft',
  'data-selected:border-fill data-selected:bg-fill data-selected:text-white data-selected:data-hovered:border-fill-hover data-selected:data-hovered:bg-fill-hover',
  ring,
)!

/**
 * The panel's own indigo accent, in place of the app's blue: its fills, switches, links and focus borders take it.
 * The theme inlines its colors as var(--track-*), so those are what change here. Lists that open from the panel sit
 * outside it, so they keep the app's blue.
 */
const indigo =
  '[--track-fill:#4f46e5] [--track-fill-hover:#4338ca] [--track-blue:#4f46e5] dark:[--track-fill:#6366f1] dark:[--track-fill-hover:#4f46e5] dark:[--track-blue:#a5b4fc]'

/** Whether the panel is folded away, kept for this browser. */
const FOLDED_KEY = 'tesda-track.training-filters'

const ALL = 'all'

/**
 * The filters (classic/training_view.py _filters): they apply as soon as they change, and the panel folds away to
 * free the map. Center type and location come first, then a row per list, each showing its choice on the right.
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
  const [qualificationsOpen, setQualificationsOpen] = useState(
    () => filters.qualifications.length > 0,
  )
  const headingId = useId()
  const qualificationsId = useId()
  const locationHelpId = useId()
  const scholarshipHelpId = useId()
  // The radius in use, or the one chosen and waiting for a place to measure from.
  const radiusKm = results.radiusKm ?? (typeof filters.radius === 'number' ? filters.radius : null)
  const counts = filterCounts(filters, store.useLocation, store.placeText, radiusKm)
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
  const qualificationNames = results.codes
    .map((code) => shortName(results.names.get(code) ?? code))
    .join(', ')

  // A white card: the heading, then groups of filters divided by rules, then a button that folds it to the results.
  return (
    <section
      data-tour="training-filters"
      aria-labelledby={headingId}
      className={cx(
        'flex min-h-0 flex-col rounded-[1.5rem] border border-border/70 bg-surface px-5 shadow-[0_12px_32px_rgb(16_24_40/0.12)]',
        indigo,
      )}
    >
      <div className={cx('flex items-center gap-2 py-4', !folded && 'border-b border-rule')}>
        <h2
          id={headingId}
          className="m-0 flex flex-1 items-center gap-3 font-text text-[1.35rem] font-bold tracking-normal text-navy"
        >
          <Icon name="sliders" size="1.5rem" />
          {copy.heading}
          {total > 0 && (
            <span className={badge}>
              <span aria-hidden="true">{total}</span>
              <span className="sr-only">, {copy.count(total)}</span>
            </span>
          )}
        </h2>
        <Button
          className={button({ variant: 'tertiary', height: 36, medium: true })}
          onPress={clearAll}
        >
          {copy.clear}
        </Button>
        {/* Fold the panel away, or open it again: an icon button with its name for screen readers. */}
        <Button
          className="grid size-10 cursor-pointer place-items-center rounded-12 border border-border bg-surface text-navy data-hovered:bg-panel"
          aria-label={folded ? copy.show : copy.hide}
          aria-expanded={!folded}
          onPress={() => fold(!folded)}
        >
          <Icon name={folded ? 'chevron' : 'close'} size="1.15rem" />
        </Button>
      </div>

      {!folded && (
        <>
          <div className="min-h-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain [&>*+*]:border-t [&>*+*]:border-rule">
            <div className={group}>
              <GroupTitle icon="grid">{copy.type}</GroupTitle>
              <ToggleButtonGroup
                className="grid grid-cols-2 gap-2"
                aria-label={copy.type}
                selectionMode="multiple"
                // One type always stays on: unticking the last would otherwise show every center again.
                disallowEmptySelection
                selectedKeys={kinds}
                onSelectionChange={(keys: Set<Key>) => {
                  const chosen = KINDS.filter((kind) => keys.has(kind))
                  // Both is every center.
                  set({ kinds: chosen.length === 1 ? chosen : [] })
                }}
              >
                {KINDS.map((kind: CenterKind) => (
                  <ToggleButton key={kind} id={kind} className={kindClass}>
                    <TickBox />
                    {en.training.kinds[kind]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </div>

            <div className={group}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <GroupTitle icon="pin">{copy.location}</GroupTitle>
                <Toggle
                  isSelected={store.useLocation}
                  onChange={store.setUseLocation}
                  describedBy={locationHelpId}
                >
                  {copy.useCurrent}
                </Toggle>
              </div>
              {/* What sharing a location means, read with the switch. */}
              <p id={locationHelpId} className="sr-only">
                {copy.locationHelp}
              </p>
              <LocationStatus />
              <TextField
                className="flex flex-col gap-[0.35rem]"
                value={store.placeText}
                onChange={store.setPlaceText}
                type="search"
              >
                <Label className="sr-only">{copy.place}</Label>
                <div className="relative flex items-center">
                  <Icon
                    name="search"
                    size="1.2rem"
                    className="pointer-events-none absolute left-3.5 text-muted"
                  />
                  <Input
                    className="min-h-12 w-full rounded-12 border border-border bg-soft py-2 pr-[0.8rem] pl-[2.6rem] text-15 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-focused:bg-surface data-hovered:border-hover-border"
                    placeholder={copy.placePlaceholder}
                  />
                </div>
              </TextField>
              {placeText && !results.place && !results.loading && (
                <p className={notice} role="status">
                  {copy.placeNotFound(placeText)}
                </p>
              )}
              <SelectField
                icon="locate"
                label={copy.radius}
                options={[
                  { id: ALL, label: copy.allDistances },
                  ...RADIUS_KM.map((km) => ({ id: String(km), label: copy.radiusOption(km) })),
                ]}
                value={radiusKm ? String(radiusKm) : ALL}
                active={radiusKm !== null}
                onChange={(radius) =>
                  set({
                    radius:
                      radius === ALL
                        ? // Every distance is the default only around a searched place.
                          results.reference?.mine
                          ? ANY_DISTANCE
                          : null
                        : (Number(radius) as RadiusKm),
                  })
                }
                isDisabled={!results.reference}
                description={results.reference ? undefined : copy.radiusNeedsLocation}
              />
            </div>

            <div className={group}>
              <SelectField
                icon="globe"
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
                active={Boolean(results.region)}
                onChange={(code) => set({ region: code === ALL ? null : code, province: null })}
              />
              <SelectField
                icon="pinFilled"
                label={copy.province}
                options={[
                  { id: ALL, label: copy.allProvinces },
                  ...(results.province && !results.provinceOptions.includes(results.province)
                    ? [{ id: results.province, label: results.province }]
                    : []),
                  ...results.provinceOptions.map((name) => ({ id: name, label: name })),
                ]}
                value={results.province ?? ALL}
                active={Boolean(results.province)}
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

              {/* Hundreds of qualifications: the row opens a box that finds them by name. */}
              <div className="flex flex-col gap-3">
                <Button
                  className={cx(
                    'flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-12 border border-border bg-surface px-[0.85rem] py-2 text-left text-15 text-navy shadow-[0_1px_2px_rgb(16_24_40/0.05)]',
                    'data-focus-visible:border-blue data-hovered:border-blue data-pressed:border-blue',
                  )}
                  aria-expanded={qualificationsOpen}
                  aria-controls={qualificationsOpen ? qualificationsId : undefined}
                  onPress={() => setQualificationsOpen(!qualificationsOpen)}
                >
                  <Icon name="star" size="1.25rem" className="flex-none" />
                  <span className="mr-auto min-w-0 leading-tight">{copy.qualification}</span>
                  <span
                    className={cx(
                      'max-w-[45%] min-w-0 truncate text-right',
                      qualificationNames ? 'font-medium text-navy' : 'text-muted',
                    )}
                  >
                    {qualificationNames || copy.anyQualification}
                  </span>
                  <Icon
                    name="chevron"
                    size="1.1rem"
                    className={cx(
                      'flex-none text-muted transition-transform duration-200 ease-[ease]',
                      qualificationsOpen && 'rotate-180',
                    )}
                  />
                </Button>
                {qualificationsOpen && (
                  <div id={qualificationsId}>
                    <QualificationPicker
                      names={results.names}
                      chosen={results.codes}
                      onChange={(qualifications) => set({ qualifications })}
                    />
                  </div>
                )}
              </div>

              <SelectField<DeliveryMode | typeof ALL>
                icon="briefcase"
                label={copy.mode}
                options={[
                  { id: ALL, label: copy.anyMode },
                  ...DELIVERY_MODES.map((mode) => ({
                    id: mode,
                    label: en.training.delivery[mode],
                  })),
                ]}
                value={filters.mode ?? ALL}
                active={Boolean(filters.mode)}
                onChange={(mode) => set({ mode: mode === ALL ? null : mode })}
              />
              <SelectField
                icon="calendar"
                label={copy.availability}
                options={[
                  { id: ALL, label: copy.anyTime },
                  ...WINDOWS.map((days) => ({
                    id: String(days),
                    label: en.training.availability[String(days) as '30' | '90'],
                  })),
                ]}
                value={filters.within ? String(filters.within) : ALL}
                active={Boolean(filters.within)}
                onChange={(days) =>
                  set({ within: days === ALL ? null : (Number(days) as (typeof WINDOWS)[number]) })
                }
              />
            </div>

            <div className={group}>
              <Toggle
                className="w-full flex-row-reverse justify-between"
                isSelected={filters.scholarship}
                onChange={(scholarship) => set({ scholarship })}
                describedBy={scholarshipHelpId}
              >
                <span className="flex min-w-0 items-center gap-3 text-16 font-bold">
                  <Icon name="learn" size="1.5rem" className="flex-none" />
                  {copy.scholarship}
                </span>
              </Toggle>
              <p id={scholarshipHelpId} className="sr-only">
                {copy.scholarshipHelp}
              </p>
            </div>
          </div>

          {/* The filters are already applied: this folds the panel to show what they found. */}
          <div className="pt-2 pb-5">
            <Button
              className={cx(
                button({ variant: 'primary', height: 48, wide: true }),
                'min-h-14 rounded-14 text-16 shadow-[0_6px_16px_rgb(79_70_229/0.3)]',
              )}
              onPress={() => fold(true)}
            >
              {copy.apply}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

/** A group's title, after its icon. */
function GroupTitle({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <h3 className={groupTitle}>
      <Icon name={icon} size="1.35rem" />
      {children}
    </h3>
  )
}

/** A center type's box: empty, or white and ticked when the type is chosen. */
function TickBox() {
  return (
    <span
      className={cx(
        'grid size-5.5 flex-none place-items-center rounded-6 border-2 border-hover-border bg-surface text-fill transition-colors duration-150',
        'group-data-hovered:border-blue group-data-selected:border-white group-data-selected:bg-white',
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
  )
}

/** An on/off switch: a track with a thumb that slides across, before its label. */
function Toggle({
  isSelected,
  onChange,
  className,
  describedBy,
  children,
}: {
  isSelected: boolean
  onChange: (selected: boolean) => void
  className?: string
  /** The id of a note read after the switch's label. */
  describedBy?: string
  children: ReactNode
}) {
  return (
    <Switch
      className={cx('group flex cursor-pointer items-center gap-2.5 text-14 text-navy', className)}
      isSelected={isSelected}
      onChange={onChange}
      aria-describedby={describedBy}
    >
      <span
        className="relative h-7 w-12 flex-none rounded-full border border-hover-border bg-chip transition-[background,border-color] duration-200 ease-[ease] group-data-focus-visible:outline-3 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus group-data-selected:border-fill group-data-selected:bg-fill"
        aria-hidden="true"
      >
        <span className="absolute top-[2px] left-[2px] size-[1.375rem] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[ease] group-data-selected:translate-x-5" />
      </span>
      {children}
    </Switch>
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

/** How many filters each part sets. Both center types together filter nothing. */
export function filterCounts(
  filters: TrainingFilters,
  useLocation: boolean,
  placeText: string,
  radiusKm: number | null,
) {
  return {
    type: filters.kinds.length === 1 ? 1 : 0,
    location: Number(useLocation) + Number(Boolean(placeText.trim())) + Number(radiusKm !== null),
    region: Number(Boolean(filters.region)),
    province: Number(Boolean(filters.province)),
    qualification: filters.qualifications.length,
    more:
      Number(Boolean(filters.mode)) + Number(Boolean(filters.within)) + Number(filters.scholarship),
  }
}
