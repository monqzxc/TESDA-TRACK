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
import { Icon } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy, getCopy } from '../../i18n/copy.ts'
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

/** How many filters a section sets: a small grey count beside its title. */
const badge =
  'inline-block min-w-[1.4rem] rounded-full bg-chip px-[0.45rem] py-[0.05rem] text-center text-12 leading-[1.35] font-bold text-navy tabular-nums'
const help = 'm-0 text-13 leading-[1.5] text-muted'
const notice =
  'm-0 flex items-start gap-[0.4rem] rounded-10 bg-warn-bg px-[0.7rem] py-[0.55rem] text-14 font-semibold text-warn-ink'
const ring =
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

/**
 * Center types as toggle cards, so they read as choices rather than a legend: each has a tick box in its map pin's
 * colour (an outline when off, filled and ticked when on), and a chosen card takes that colour's border and tint.
 */
const kindClass = cx(
  'group inline-flex min-h-11 flex-[1_1_auto] cursor-pointer items-center gap-2 rounded-12 border-2 border-border bg-surface py-1.5 pr-3 pl-2.5 text-left text-14 leading-[1.25] font-semibold text-navy',
  'shadow-[0_1px_2px_rgb(16_24_40/0.06)] transition-[background,border-color,transform] duration-150 ease-[ease]',
  'data-hovered:border-hover-border data-hovered:bg-panel data-pressed:scale-[0.98]',
  ring,
)!

const KIND_CARDS: Record<CenterKind, { card: string; box: string }> = {
  training: {
    card: 'data-selected:border-[#175cd3] data-selected:bg-[#175cd3]/8 data-selected:data-hovered:bg-[#175cd3]/14',
    box: 'border-[#175cd3] group-data-selected:bg-[#175cd3]',
  },
  assessment: {
    card: 'data-selected:border-[#0d9488] data-selected:bg-[#0d9488]/8 data-selected:data-hovered:bg-[#0d9488]/14',
    box: 'border-[#0d9488] group-data-selected:bg-[#0d9488]',
  },
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
  const where = [
    ...(store.useLocation ? [copy.yourLocation] : []),
    ...(placeText ? [placeText] : []),
    ...(radiusKm ? [copy.withinRadius(radiusKm)] : []),
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
          className="m-0 flex flex-1 items-center gap-2 font-text text-16 font-bold tracking-normal text-navy"
        >
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
          className="grid size-9.5 cursor-pointer place-items-center rounded-10 border border-border bg-surface text-navy data-hovered:bg-panel"
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
            title={copy.type}
            count={counts.type}
            summary={kinds.length === 1 ? en.training.kinds[kinds[0]] : en.training.bothKinds}
            open
          >
            <p className={help}>{copy.typeHelp}</p>
            <ToggleButtonGroup
              className="flex flex-wrap gap-2"
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
                <ToggleButton key={kind} id={kind} className={cx(kindClass, KIND_CARDS[kind].card)}>
                  {/* A tick box in the map pin's colour, filled when the type is shown. */}
                  <span
                    className={cx(
                      'grid size-5 flex-none place-items-center rounded-6 border-2 bg-surface text-white transition-colors duration-150',
                      KIND_CARDS[kind].box,
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
                  {en.training.kinds[kind]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Section>

          <Section
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
            <SelectField
              label={copy.radius}
              options={[
                { id: ALL, label: copy.allDistances },
                ...RADIUS_KM.map((km) => ({ id: String(km), label: copy.withinRadius(km) })),
              ]}
              value={radiusKm ? String(radiusKm) : ALL}
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
              description={results.reference ? copy.radiusHelp : copy.radiusNeedsLocation}
            />
          </Section>

          <Section
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

          <Section title={copy.more} count={counts.more} summary={moreSummary(filters)}>
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
  title,
  count,
  summary,
  open = false,
  children,
}: {
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
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-[0.4rem] text-15 font-semibold">
            {title}
            {count > 0 && <span className={badge}>{count}</span>}
          </span>
          {/* What a folded section holds, under its title. */}
          {!isOpen && <span className="truncate text-14 text-muted">{summary}</span>}
        </span>
        <Icon
          name="chevron"
          className="mt-[0.15rem] flex-none text-muted transition-transform duration-200 ease-[ease] group-open:rotate-180"
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

function moreSummary(filters: TrainingFilters): string {
  const en = getCopy()
  const copy = en.training.filters

  const parts: string[] = []
  if (filters.mode) parts.push(en.training.delivery[filters.mode])
  if (filters.within) parts.push(en.training.availability[String(filters.within) as '30' | '90'])
  if (filters.scholarship) parts.push(copy.scholarship)
  return parts.join(' · ') || copy.anyMode
}
