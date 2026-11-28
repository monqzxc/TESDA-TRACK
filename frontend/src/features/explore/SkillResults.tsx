import { useState } from 'react'
import { Button, ToggleButton } from 'react-aria-components'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import type { Match } from '../finder/api.ts'
import type { CenterKind } from '../training/address.ts'
import type { Center } from '../training/centers.ts'
import type { View } from './ExplorePage.tsx'
import { offers, roundKm, strength } from './explore.ts'
import { readable } from './jobDisplay.ts'
import { OutlookAnalysis } from './OutlookBrief.tsx'
import type { AreaOutlook, Outlook } from './outlookApi.ts'
import type { Explore } from './useExplore.ts'

// The classic panel after a search (the UI/UX team's layout, 2026-11-27): the skills the search was read as, the
// view pills, Best for you (the top place in demand, training center and assessment center, each in its own color,
// with the full analysis one press away), then one section per kind of center (each qualification with its nearest
// center), centers that do both, and where the skills are in demand. Small type, so the whole answer fits a scroll
// or two.

/** At most this many qualifications per section, and this many places hiring. */
const PER_SECTION = 3
const PLACES = 4
const MAX_SKILLS = 6
/** Training and assessment sites this close (km) are one place. */
const SAME_PLACE_KM = 0.15
/** Fewer records say nothing about demand (MIN_RECORDS in qualification_outlook.py). */
const MIN_RECORDS = 3

const REASON_PREFIXES = [/^Matched your words:\s*/i, /^Matched \d+ of your \d+ skills or jobs:\s*/i]

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The skills the search was read as: the matched qualifications' competencies the server picked (those the words name,
 * then CORE units). Without them, a skills search's own terms, the goal reading's skills, and the words each match was
 * found by. Never the qualifications themselves.
 */
export function skillTerms(explore: Pick<Explore, 'search'>): string[] {
  const result = explore.search?.result
  if (!result) return []
  if (result.skills?.length) return result.skills.slice(0, MAX_SKILLS)
  const fromReasons = result.matches.flatMap((match) => {
    const prefix = REASON_PREFIXES.find((pattern) => pattern.test(match.reason))
    return prefix ? match.reason.replace(prefix, '').split(',') : []
  })
  const all = [
    ...(result.search?.terms ?? []),
    ...(result.profile.existing_skills ?? []),
    ...fromReasons,
  ]
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of all) {
    const term = raw.trim().replace(/\.$/, '')
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    terms.push(capital(term))
  }
  return terms.slice(0, MAX_SKILLS)
}

const nearestFirst = (a: Center, b: Center) =>
  (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name)

const samePlace = (a: Center, b: Center) => {
  if (a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) return true
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null)
    return false
  // Close enough for an equirectangular estimate.
  const dx = (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180) * 111.32
  const dy = (a.latitude - b.latitude) * 110.57
  return Math.hypot(dx, dy) <= SAME_PLACE_KM
}

interface Row {
  match: Match
  center: Center | null
}

/** Each qualification with its nearest center of the kind, strongest first; those without one are left out. */
function rowsFor(kind: CenterKind, matches: readonly Match[], centers: readonly Center[]): Row[] {
  return matches
    .map((match) => ({
      match,
      center:
        centers
          .filter((center) => center.kind === kind && offers(center, match.qualification.code))
          .sort(nearestFirst)[0] ?? null,
    }))
    .filter((row) => row.center !== null)
    .slice(0, PER_SECTION)
}

/** Qualifications a learner can both train for and be assessed in at one place: the training site of that place. */
function bothRows(matches: readonly Match[], centers: readonly Center[]): Row[] {
  const rows: Row[] = []
  for (const match of matches) {
    const code = match.qualification.code
    const training = centers.filter((c) => c.kind === 'training' && offers(c, code))
    const assessment = centers.filter((c) => c.kind === 'assessment' && offers(c, code))
    const both = training.filter((t) => assessment.some((a) => samePlace(t, a))).sort(nearestFirst)
    if (both[0]) rows.push({ match, center: both[0] })
    if (rows.length === PER_SECTION) break
  }
  return rows
}

/** The skills the search was read as, as plain chips above the view pills. */
export function SkillChips({ explore, className }: { explore: Explore; className?: string }) {
  const copy = useCopy().explore.skillList
  const terms = skillTerms(explore)
  if (!terms.length) return null
  return (
    <div className={cx('pointer-events-auto flex min-w-0 flex-col gap-1.5', className)}>
      <p className="m-0 text-12 text-muted">{copy.readAs}</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {terms.map((term) => (
          <li
            key={term}
            className="rounded-full bg-chip px-2.5 py-1 text-12 leading-tight font-semibold text-navy"
          >
            {term}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** All | Assess | Train | Demand, as pills. */
export function ViewPills({ view, onView }: { view: View; onView: (view: View) => void }) {
  const en = useCopy().explore
  const pills: { view: View; label: string }[] = [
    { view: 'all', label: en.results.tabs.all },
    { view: 'assessment', label: en.results.tabs.assess },
    { view: 'training', label: en.results.tabs.train },
    { view: 'demand', label: en.results.tabs.demand },
  ]
  return (
    <div role="group" aria-label={en.skillList.views} className="flex flex-wrap gap-1.5">
      {pills.map((pill) => (
        <ToggleButton
          key={pill.view}
          isSelected={view === pill.view}
          onChange={() => onView(pill.view)}
          className={cx(
            'inline-flex min-h-9 cursor-pointer items-center rounded-full border border-border bg-surface px-3.5 text-13 font-semibold text-navy',
            'transition-colors duration-150 data-hovered:border-navy',
            'data-selected:border-fill data-selected:bg-fill data-selected:text-white',
            'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
          )}
        >
          {pill.label}
        </ToggleButton>
      ))}
    </div>
  )
}

// Each kind keeps one color everywhere: blue to train, teal to be assessed, amber where the work is. `card` is a
// whole Best for you card in that color.
const sectionTone = {
  training: { icon: 'lightbulb', ink: 'text-blue', box: 'bg-tint', card: 'bg-tint border-blue/30' },
  assessment: {
    icon: 'award',
    ink: 'text-teal',
    box: 'bg-good-bg',
    card: 'bg-good-bg border-teal/35',
  },
  both: { icon: 'learn', ink: 'text-teal', box: 'bg-soft', card: 'bg-soft border-border' },
  work: {
    icon: 'briefcase',
    ink: 'text-[#b45309]',
    box: 'bg-warn-bg',
    card: 'bg-warn-bg border-[#b45309]/35',
  },
  best: { icon: 'thumbUp', ink: 'text-blue', box: 'bg-tint', card: 'bg-tint border-blue/30' },
} as const

/** A Best for you card, lifted off the page a little. */
const pickCard = 'shadow-[0_2px_10px_-4px_rgb(var(--track-shadow-rgb)/0.28)]'

function SectionHead({
  tone,
  heading,
  note,
}: {
  tone: keyof typeof sectionTone
  heading: string
  note: string
}) {
  const { icon, ink } = sectionTone[tone]
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={cx('mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-soft', ink)}
      >
        <Icon name={icon as IconName} size="0.95rem" />
      </span>
      <div className="min-w-0">
        <h3 className="m-0 text-14 leading-[1.35] font-bold text-navy">{heading}</h3>
        <p className="m-0 mt-0.5 text-12 leading-[1.45] text-muted">{note}</p>
      </div>
    </div>
  )
}

/** A Best for you card's first line: what the pick is, in its kind's color. */
function PickLabel({ tone, label }: { tone: keyof typeof sectionTone; label: string }) {
  const { icon, ink } = sectionTone[tone]
  return (
    <span
      className={cx(
        'mb-1 flex items-center gap-1 text-11 font-bold tracking-[0.04em] uppercase',
        ink,
      )}
    >
      <Icon name={icon as IconName} size="0.8rem" />
      {label}
    </span>
  )
}

const strengthTag = {
  strong: 'bg-tint text-blue',
  good: 'bg-good-bg text-good-ink',
  weak: 'bg-chip text-muted',
} as const
const strengthOnCard = {
  strong: 'bg-surface text-blue',
  good: 'bg-surface text-good-ink',
  weak: 'bg-surface text-muted',
} as const

function QualificationRow({
  row,
  tone,
  first,
  pick,
  onSelect,
}: {
  row: Row
  tone: 'training' | 'assessment' | 'both'
  first: boolean
  /** In Best for you: what the pick is, over the card, and the whole card in its kind's color. */
  pick?: string
  onSelect: (id: string, code: string) => void
}) {
  const copy = useCopy().explore.skillList
  const { match, center } = row
  const level = strength(match)
  const code = match.qualification.code
  const town = center ? (center.city ?? center.province ?? center.region) : null
  const km = center?.distanceKm == null ? null : roundKm(center.distanceKm)
  return (
    <li
      className={cx(
        'rounded-12 border p-2.5',
        pick ? [pickCard, sectionTone[tone].card].join(' ') : 'border-border bg-surface',
      )}
    >
      {pick && <PickLabel tone={tone} label={pick} />}
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 min-w-0 text-13 leading-[1.35] font-bold text-navy">
          {match.qualification.name}
        </p>
        <span
          className={cx(
            'flex-none rounded-full px-2 py-0.5 text-11 font-semibold whitespace-nowrap',
            // On a colored card the tag sits on white, so it doesn't fade into the card.
            pick ? strengthOnCard[level] : strengthTag[level],
          )}
        >
          {copy.strength[level]}
        </span>
      </div>
      {match.reason && (
        <p className="m-0 mt-0.5 text-12 leading-[1.4] text-muted">{match.reason}</p>
      )}
      {center ? (
        <Button
          onPress={() => onSelect(center.id, code)}
          className={cx(
            'mt-2 flex w-full cursor-pointer items-start gap-2 rounded-8 border-0 px-2 py-1.5 text-left',
            pick ? 'bg-surface' : first ? sectionTone[tone].box : 'bg-transparent',
            'transition-colors duration-150 data-hovered:bg-soft',
            'data-focus-visible:outline-3 data-focus-visible:outline-focus',
          )}
        >
          <Icon
            name="pin"
            size="0.9rem"
            className={cx('mt-0.5 flex-none', sectionTone[tone].ink)}
          />
          <span className="min-w-0">
            <span className="block text-12 leading-[1.35] font-semibold text-navy">
              {center.name}
            </span>
            {(km !== null || town) && (
              <span className="block text-11 text-muted">{copy.trip(km, town)}</span>
            )}
          </span>
        </Button>
      ) : (
        <p className="m-0 mt-1.5 text-12 text-muted">{copy.none}</p>
      )}
    </li>
  )
}

function CenterSection({
  tone,
  rows,
  onSelect,
}: {
  tone: 'training' | 'assessment' | 'both'
  rows: Row[]
  onSelect: (id: string, code: string) => void
}) {
  const all = useCopy().explore.skillList
  const copy = all[tone]
  // Centers that do both are a bonus: without one the section isn't there.
  if (!rows.length && tone === 'both') return null
  return (
    <section className="flex flex-col gap-2">
      <SectionHead tone={tone} heading={copy.heading} note={copy.note} />
      {!rows.length && <p className="m-0 text-12 text-muted">{all.none}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row, index) => (
          <QualificationRow
            key={row.match.qualification.code}
            row={row}
            tone={tone}
            first={index === 0}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  )
}

type Level = 'high' | 'moderate' | 'low'

/** An area's level as the server words its home region's: its share against an even share across the regions. */
function areaLevel(share: number | null, regions: number): Level {
  const ratio = (share ?? 0) * Math.max(regions, 1)
  return ratio >= 1.5 ? 'high' : ratio >= 0.5 ? 'moderate' : 'low'
}

const levelTag: Record<Level, string> = {
  high: 'bg-[#b45309] text-white',
  moderate: 'bg-warn-bg text-warn-ink',
  low: 'bg-chip text-muted',
}
const levelOnCard: Record<Level, string> = {
  high: levelTag.high,
  moderate: 'bg-surface text-warn-ink',
  low: 'bg-surface text-muted',
}

function jobsLine(titles: readonly string[], fallback: string) {
  const named = titles.slice(0, 2).map(readable)
  return named.length ? named.join(' and ') : fallback
}

/**
 * Where the qualification in focus is wanted: the learner's own area, the places hiring most besides it, and how many
 * regions the levels are judged against.
 */
function demandPicture(explore: Explore) {
  const data: Outlook | undefined = explore.outlook.data
  const home = data?.home_demand ?? null
  const regions =
    home?.ranked_of || (data?.areas.filter((area) => area.posting_count > 0).length ?? 0)
  const places = (data?.areas ?? [])
    .filter((area) => area.region_code !== home?.region_code && area.posting_count >= MIN_RECORDS)
    .sort((a, b) => b.posting_count - a.posting_count)
    .slice(0, PLACES)
  const homeArea = data?.areas.find((area) => area.region_code === home?.region_code)
  const name = data?.qualification.name ?? explore.focusName ?? ''
  const weak = Boolean(home && (home.level === 'low' || home.level === 'none' || home.limited))
  return { data, home, regions, places, homeArea, name, weak }
}

/** The one place to point at: the learner's own area when it is hiring, otherwise the place hiring most. */
function topDemand(explore: Explore): AreaOutlook | null {
  const { homeArea, places, weak } = demandPicture(explore)
  if (homeArea && !weak && homeArea.posting_count >= MIN_RECORDS) return homeArea
  return places[0] ?? null
}

function AreaButton({
  area,
  level,
  jobs,
  pick,
  onArea,
}: {
  area: AreaOutlook
  level: Level
  jobs: string
  /** In Best for you: what the pick is, over the card, and the whole card amber. */
  pick?: string
  onArea: (regionCode: string) => void
}) {
  const copy = useCopy().explore.skillList.work
  return (
    <Button
      aria-label={copy.open(area.name)}
      onPress={() => onArea(area.region_code)}
      className={cx(
        'flex w-full cursor-pointer flex-col rounded-12 border p-2.5 text-left',
        'transition-colors duration-150 data-hovered:border-navy',
        'data-focus-visible:outline-3 data-focus-visible:outline-focus',
        pick ? [pickCard, sectionTone.work.card].join(' ') : 'border-border bg-surface',
      )}
    >
      {pick && <PickLabel tone="work" label={pick} />}
      <span className="flex w-full items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-13 leading-[1.35] font-bold text-navy">{area.name}</span>
          <span className="block text-11 leading-[1.4] text-muted">{jobs}</span>
        </span>
        <span
          className={cx(
            'flex-none rounded-full px-2 py-0.5 text-11 font-semibold whitespace-nowrap',
            pick ? levelOnCard[level] : levelTag[level],
          )}
        >
          {copy.level[level]}
        </span>
      </span>
    </Button>
  )
}

/**
 * Signed in: qualifications that fit the learner's Skill Passport skills (Kuya Manuel's Driving and Cooking) that the
 * search did not show, each a search of its own on press. A guest has no passport, so nothing is shown.
 */
function SkillPicks({
  explore,
  onQualification,
}: {
  explore: Explore
  onQualification: (code: string, name: string) => void
}) {
  const copy = useCopy().explore.skillList.work.also
  if (explore.passportStatus !== 'loaded' || !explore.skillPicks.length) return null
  return (
    <div role="group" aria-label={copy.heading} className="flex flex-col gap-2 pt-1">
      <p className="m-0 flex items-center gap-1.5 text-12 font-bold text-navy">
        <Icon name="lightbulb" size="0.9rem" className={sectionTone.work.ink} />
        {copy.heading}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {explore.skillPicks.map(({ skill, qualification }) => (
          <li key={qualification.code}>
            <Button
              aria-label={copy.open(qualification.name)}
              onPress={() => onQualification(qualification.code, qualification.name)}
              className={cx(
                'flex w-full cursor-pointer items-center justify-between gap-2 rounded-12 border border-dashed p-2.5 text-left',
                'border-[#b45309]/40 bg-surface transition-colors duration-150 data-hovered:border-navy',
                'data-focus-visible:outline-3 data-focus-visible:outline-focus',
              )}
            >
              <span className="min-w-0">
                <span className="block text-13 leading-[1.35] font-bold text-navy">
                  {qualification.name}
                </span>
                <span className="block text-11 leading-[1.4] text-muted">
                  {copy.because(skill)}
                </span>
              </span>
              <Icon name="arrowRight" size="0.9rem" className="flex-none text-muted" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkSection({
  explore,
  onArea,
  onQualification,
}: {
  explore: Explore
  onArea: (regionCode: string) => void
  onQualification: (code: string, name: string) => void
}) {
  const copy = useCopy().explore.skillList.work
  const outlook = explore.outlook
  const signedIn = explore.passportStatus === 'loaded'
  const { data, home, regions, places, homeArea, name, weak } = demandPicture(explore)
  const homeName = home ? (homeArea?.name ?? home.name) : null

  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        tone="work"
        heading={copy.heading}
        note={signedIn ? `${copy.note} ${copy.tsp}` : copy.note}
      />
      {outlook.isPending && explore.demandCode ? (
        <p role="status" className="m-0 text-12 text-muted">
          {copy.loading}
        </p>
      ) : outlook.isError ? (
        <p role="alert" className="m-0 text-12 text-warn-ink">
          {copy.failed}
        </p>
      ) : !data || (!home && !places.length) ? (
        <p className="m-0 text-12 text-muted">{copy.empty}</p>
      ) : (
        <>
          {home && homeName && (
            <div
              className={cx(
                'flex items-start gap-2 rounded-12 px-3 py-2.5',
                weak ? 'bg-warn-bg text-warn-ink' : 'bg-good-bg text-good-ink',
              )}
            >
              <Icon name="info" size="0.95rem" className="mt-0.5 flex-none" />
              <div className="min-w-0">
                <p className="m-0 text-12 leading-[1.4] font-bold">
                  {weak ? copy.low(homeName) : copy.good(homeName, copy.levelWord[home.level])}
                </p>
                <p className="m-0 mt-0.5 text-12 leading-[1.4]">
                  {(weak ? copy.lowBody : copy.goodBody)(jobsLine(homeArea?.titles ?? [], name))}
                </p>
              </div>
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {places.map((area) => (
              <li key={area.region_code}>
                <AreaButton
                  area={area}
                  level={areaLevel(area.demand_share, regions)}
                  jobs={jobsLine(area.titles, name)}
                  onArea={onArea}
                />
              </li>
            ))}
          </ul>
          {data.demand_is_sample && <p className="m-0 text-11 text-muted">{copy.modelled}</p>}
        </>
      )}
      <SkillPicks explore={explore} onQualification={onQualification} />
    </section>
  )
}

/**
 * Best for you, at the top of All: the place hiring most for these skills, the best training center and the best
 * assessment center (the first of each section below), each card in its section's color. The Analysis button under them opens
 * the full supply and demand analysis in a dialog: the strip over the map that opens it is hidden on phones.
 */
function BestSection({
  explore,
  training,
  assessment,
  view,
  onView,
  onSelect,
  onArea,
}: {
  explore: Explore
  training: Row | undefined
  assessment: Row | undefined
  view: View
  onView: (view: View) => void
  onSelect: (id: string, code: string) => void
  onArea: (regionCode: string) => void
}) {
  const copy = useCopy().explore
  const best = copy.skillList.best
  const [open, setOpen] = useState(false)
  const demand = topDemand(explore)
  const { regions, name } = demandPicture(explore)
  if (!demand && !training && !assessment) return null
  const canAnalyse = Boolean(explore.demandCode && explore.outlook.data)
  return (
    <section className="flex flex-col gap-2">
      <SectionHead tone="best" heading={best.heading} note={best.note} />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {demand && (
          <li>
            <AreaButton
              area={demand}
              level={areaLevel(demand.demand_share, regions)}
              jobs={jobsLine(demand.titles, name)}
              pick={best.demand}
              onArea={onArea}
            />
          </li>
        )}
        {training && (
          <QualificationRow
            row={training}
            tone="training"
            first
            pick={best.training}
            onSelect={onSelect}
          />
        )}
        {assessment && (
          <QualificationRow
            row={assessment}
            tone="assessment"
            first
            pick={best.assessment}
            onSelect={onSelect}
          />
        )}
      </ul>
      {/* Under the picks: the numbers behind them. */}
      {canAnalyse && (
        <Button
          aria-haspopup="dialog"
          onPress={() => setOpen(true)}
          className={cx(button({ variant: 'secondary', height: 44, text: 14 }), 'w-full')}
        >
          <Icon name="growth" />
          {best.analysis}
        </Button>
      )}
      <ModalDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={copy.outlook.label}
        closeLabel={best.close}
        wide
      >
        <OutlookAnalysis
          explore={explore}
          view={view}
          inModal
          // Its buttons lead back to the map: the dialog gets out of the way.
          onBack={() => setOpen(false)}
          onView={(next) => {
            setOpen(false)
            onView(next)
          }}
        />
      </ModalDialog>
    </section>
  )
}

/**
 * The list under the pills: Best for you, Training centers, Assessment centers, Both, then Work. Assess and Train narrow it to one
 * kind; Demand shows only Work.
 */
export function SkillResults({
  explore,
  view,
  onView,
  onSelect,
  onArea,
  onQualification,
}: {
  explore: Explore
  view: View
  onView: (view: View) => void
  onSelect: (id: string, code: string) => void
  onArea: (regionCode: string) => void
  /** A qualification suggested from the learner's skills, searched as one chosen from the library. */
  onQualification: (code: string, name: string) => void
}) {
  const copy = useCopy().explore.results
  const { matches, centers, search } = explore
  if (!search) return null
  if (!matches.length) {
    return (
      <p role="status" className="m-0 rounded-12 bg-panel p-3 text-13 leading-[1.5] text-ink">
        {copy.noMatch}
      </p>
    )
  }
  const training = rowsFor('training', matches, centers)
  const assessment = rowsFor('assessment', matches, centers)
  const both = bothRows(matches, centers)
  return (
    <div className="flex flex-col gap-5">
      {view === 'all' && (
        <BestSection
          explore={explore}
          training={training[0]}
          assessment={assessment[0]}
          view={view}
          onView={onView}
          onSelect={onSelect}
          onArea={onArea}
        />
      )}
      {(view === 'all' || view === 'training') && (
        <CenterSection tone="training" rows={training} onSelect={onSelect} />
      )}
      {(view === 'all' || view === 'assessment') && (
        <CenterSection tone="assessment" rows={assessment} onSelect={onSelect} />
      )}
      {view === 'all' && <CenterSection tone="both" rows={both} onSelect={onSelect} />}
      {(view === 'all' || view === 'demand') && (
        <WorkSection explore={explore} onArea={onArea} onQualification={onQualification} />
      )}
    </div>
  )
}
