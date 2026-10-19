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
import { en } from '../../copy/en.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import utilities from '../../styles/utilities.module.css'
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
import styles from './FilterPanel.module.css'

const copy = en.training.filters

/** Whether the panel is folded away, kept for this browser. */
const FOLDED_KEY = 'tesda-track.training-filters'

const ALL = 'all'

/**
 * The filters (classic/training_view.py _filters): they apply as soon as they change, and the panel folds away to
 * free the map. Each section says how many filters it sets, and, folded, what it holds.
 */
export function FilterPanel({ results }: { results: CenterResults }) {
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
  const regionName = results.regions.find((region) => region.code === results.region)?.name

  return (
    <section aria-labelledby={headingId} className={cx(styles.panel, folded && styles.folded)}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          <Icon name="filter" />
          {copy.heading}
          {total > 0 && (
            <span className={styles.badge}>
              <span aria-hidden="true">{total}</span>
              <span className={utilities.visuallyHidden}>, {copy.count(total)}</span>
            </span>
          )}
        </h2>
        <Button className={cx(buttons.button, buttons.tertiary, styles.clear)} onPress={clearAll}>
          {copy.clear}
        </Button>
        <Button
          className={styles.fold}
          aria-label={folded ? copy.show : copy.hide}
          aria-expanded={!folded}
          onPress={() => fold(!folded)}
        >
          <Icon name="chevron" className={styles.foldIcon} />
        </Button>
      </div>

      {!folded && (
        <div className={styles.sections}>
          <Section
            icon="learn"
            title={copy.type}
            count={counts.type}
            summary={kinds.length === 1 ? en.training.kinds[kinds[0]] : en.training.bothKinds}
            open
          >
            <ToggleButtonGroup
              className={styles.kinds}
              aria-label={copy.type}
              selectionMode="multiple"
              selectedKeys={kinds}
              onSelectionChange={(keys: Set<Key>) => {
                const chosen = KINDS.filter((kind) => keys.has(kind))
                // Both, or neither, is every center.
                set({ kinds: chosen.length === 1 ? chosen : [] })
              }}
            >
              {KINDS.map((kind: CenterKind) => (
                <ToggleButton key={kind} id={kind} className={styles.kind}>
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
            <Switch
              className={styles.switch}
              isSelected={store.useLocation}
              onChange={store.setUseLocation}
            >
              <span className={styles.track} aria-hidden="true">
                <span className={styles.thumb} />
              </span>
              {copy.useCurrent}
            </Switch>
            <p className={styles.help}>{copy.locationHelp}</p>
            <LocationStatus />
            <TextField
              className={styles.place}
              value={store.placeText}
              onChange={store.setPlaceText}
              type="search"
            >
              <Label className={styles.label}>{copy.place}</Label>
              <div className={styles.inputBox}>
                <Icon name="pin" className={styles.inputIcon} />
                <Input className={styles.input} placeholder={copy.placePlaceholder} />
              </div>
              <Text slot="description" className={styles.help}>
                {copy.placeHelp}
              </Text>
            </TextField>
            {placeText && !results.place && !results.loading && (
              <p className={styles.notice} role="status">
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
      className={styles.section}
      open={isOpen}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Icon name={icon} className={styles.sectionIcon} />
        <span className={styles.sectionText}>
          <span className={styles.sectionTitle}>
            {title}
            {count > 0 && <span className={styles.badge}>{count}</span>}
          </span>
          {!isOpen && <span className={styles.summary}>{summary}</span>}
        </span>
        <Icon name="chevron" className={styles.chevron} />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}

/** Whether the browser is finding the learner's location, or why it couldn't. */
function LocationStatus() {
  const locating = useTrainingStore((state) => state.locating)
  const error = useTrainingStore((state) => state.locationError)
  if (error) {
    return (
      <p className={styles.notice} role="status">
        <Icon name="pin" />
        {copy.locationErrors[error]}
      </p>
    )
  }
  if (locating) {
    return (
      <p className={styles.help} role="status">
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
  const parts: string[] = []
  if (filters.mode) parts.push(en.training.delivery[filters.mode])
  if (filters.within) parts.push(en.training.availability[String(filters.within) as '30' | '90'])
  if (filters.scholarship) parts.push(copy.scholarship)
  return parts.join(' · ') || copy.anyMode
}
