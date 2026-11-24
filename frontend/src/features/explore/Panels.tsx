import { useQuery } from '@tanstack/react-query'
import { qualificationsQuery } from '../../api/queries.ts'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Switch, ToggleButton } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { useCopy, useServerText } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { useFinderStore } from '../finder/store.ts'
import { CenterSuggestionFeedback } from '../suggestion-feedback/CenterSuggestionFeedback.tsx'
import { SuggestionFeedback } from '../suggestion-feedback/SuggestionFeedback.tsx'
import { DemandPanel } from './DemandPanel.tsx'
import { PlaceField } from './PlaceField.tsx'
import { offeringsQuery, type ClientConfig } from '../training/api.ts'
import type { CenterKind } from '../training/address.ts'
import { googleMapsDirections, RoutePanel } from '../training/CenterDetail.tsx'
import { placeLabel, type Center, type Point } from '../training/centers.ts'
import { travelTime } from '../training/format.ts'
import { NoLocationTag, unlocated } from '../training/NoLocationTag.tsx'
import { useTrainingStore } from '../training/state.ts'
import type { Match } from '../finder/api.ts'
import type { View } from './ExplorePage.tsx'
import {
  anyScholarship,
  cardsFor,
  estimateMinutes,
  firstKind,
  hasScholarship,
  inRangeOr,
  RANGES_KM,
  relatedWithin,
  roundKm,
  type QualificationCard,
  type Related,
} from './explore.ts'
import type { AssessmentWhy, RankedCenter } from './recommend.ts'
import { useExploreStore, type Explore } from './useExplore.ts'
import { ASSESS_FIRST, type QualificationFit } from '../tsp/passport.ts'
import { splitPhones } from '../../lib/phone.ts'

const heading = 'm-0 text-15 leading-[1.35] font-bold text-navy'
const note = 'm-0 text-13 leading-[1.5] text-muted'
const tag = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-12 font-semibold'
// Solid like the demand levels: the tags a learner scans for first.
const solidTag =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-12 font-bold text-white'
const kindIcon = { training: 'learn', assessment: 'award' } as const
// The map's marker colors (CenterMapLeaflet's COLORS), so a row and its pin read as the same kind.
const kindColor = { training: 'text-blue', assessment: 'text-teal' } as const
const kindFill = { training: 'bg-fill', assessment: 'bg-[#0d9488]' } as const
// The center card's header band: a shade darker for assessment, so its small white text stays readable.
const kindBand = { training: 'bg-fill', assessment: 'bg-[#0f766e]' } as const
// Cards that float over the panel, and lift a little more when hovered.
const floating =
  'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.06),0_4px_12px_-4px_rgb(var(--track-shadow-rgb)/0.16)]'
const lifted =
  'hover:shadow-[0_2px_4px_rgb(var(--track-shadow-rgb)/0.08),0_14px_28px_-8px_rgb(var(--track-shadow-rgb)/0.28)]'
const lift = 'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out'
// A white card on the panel's page tone: the panel's sections all sit on one.
const card = 'rounded-14 border border-border bg-surface'
// A segmented control: a quiet track, the chosen option a solid navy pill.
const segTrack = 'grid gap-1 rounded-12 bg-chip p-1'
const segOption = cx(
  'cursor-pointer rounded-10 border-0 bg-transparent font-semibold text-muted',
  'transition-[background-color,color,box-shadow] duration-150 ease-out',
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
  'data-hovered:bg-surface/70 data-hovered:text-navy',
  'data-selected:bg-navy data-selected:text-surface data-selected:shadow-[0_2px_6px_-2px_rgb(var(--track-shadow-rgb)/0.45)]',
)

/** A qualification whose CORE units the learner's certificates show, and what the server says to do next. */
type Readiness = { qualification: string; fit: QualificationFit }
type NextStepCopy = ReturnType<typeof useCopy>['explore']['tspProfile']['nextStep']
/** How many of the server's reasons a ranked training center shows. */
const SERVER_REASONS_SHOWN = 2
/** How many unit names the note lists before "and N more". */
const UNITS_SHOWN = 3

/**
 * The next step from the learner's Skill Passport (US-0004): ready for assessment, renew, or train for the
 * missing units first. Counts and unit names come from the server's coverage, never from a template.
 */
function NextStepNote({ readiness, copy }: { readiness: Readiness; copy: NextStepCopy }) {
  const { qualification, fit } = readiness
  const coverage = fit.coverage
  const covered = coverage?.covered.length ?? 0
  const total = covered + (coverage?.missing.length ?? 0)
  const missing = coverage?.missing ?? []
  const listed = missing.slice(0, UNITS_SHOWN).join('; ')
  const more = missing.length - UNITS_SHOWN
  const step =
    fit.next_step === 'renew' ? 'renew' : fit.next_step === 'gap_training' ? 'gap' : 'assess'
  const good = step !== 'gap'
  // Kuya Manuel: no certificate, but a job he has done backs a strong fit, so experience is the reason.
  const byExperience = fit.assessment_basis === 'experience'
  const licenses = fit.licenses ?? []
  return (
    <div
      data-testid="may-be-ready"
      data-next-step={fit.next_step}
      className={cx(
        'flex items-start gap-2 rounded-10 px-3 py-2 text-13 leading-[1.5]',
        good ? 'bg-good-bg text-good-ink' : 'bg-soft text-blue',
      )}
    >
      <Icon name={good ? 'award' : 'learn'} className="mt-0.5 flex-none" />
      <div className="grid gap-1">
        <strong className="block">{copy.title[step]}</strong>
        <p className="m-0">
          {step === 'renew'
            ? copy.renew(qualification)
            : byExperience
              ? copy.experience((fit.experience ?? []).join(', '), qualification)
              : copy.units(qualification, covered, total)}
        </p>
        {licenses.length > 0 && <p className="m-0">{copy.licenses(licenses.join(', '))}</p>}
        {step !== 'renew' && !byExperience && missing.length > 0 && (
          <p className="m-0">{more > 0 ? copy.missingMore(listed, more) : copy.missing(listed)}</p>
        )}
        {step === 'gap' && <p className="m-0">{copy.coc}</p>}
        {(coverage?.expired?.length ?? 0) > 0 && step !== 'renew' && (
          <p className="m-0">{copy.expired}</p>
        )}
      </div>
    </div>
  )
}

/** The on/off track of a Switch, drawn the same for every switch in the panel. Put it inside a `group` Switch. */
function SwitchTrack() {
  return (
    <span
      className="relative h-6 w-[42px] flex-none rounded-full bg-dash transition-[background] duration-200 group-data-selected:bg-fill motion-reduce:transition-none"
      aria-hidden="true"
    >
      <span className="absolute top-[3px] left-[3px] size-4.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 group-data-selected:translate-x-[18px] motion-reduce:transition-none" />
    </span>
  )
}

/** Find my pathway, picked up at the readiness check for one qualification: the same goal and reading of it. */
function useOpenPathway() {
  const navigate = useNavigate()
  const search = useExploreStore((state) => state.search)
  if (!search) return null
  return (code: string) => {
    const finder = useFinderStore.getState()
    finder.begin({
      query: search.query,
      profile: search.result.profile,
      sessionId: null,
      sessionOwner: null,
      mode: search.result.search ? 'skills' : 'goal',
    })
    finder.choose(code)
    void navigate(paths.finderReadiness)
  }
}

/** 10.1 km · 28 min · Manila (or 5 hr 30 min, farther away), each behind its icon; without the city where the place is shown already. */
function TripMeta({
  center,
  className = 'text-muted',
  withPlace = true,
}: {
  center: Center
  className?: string
  withPlace?: boolean
}) {
  const copy = useCopy().explore.trip
  const minutes = center.distanceKm === null ? null : estimateMinutes(center.distanceKm)
  const place = withPlace ? center.city || placeLabel(center) : ''
  const item = 'inline-flex items-center gap-1'
  return (
    <span
      className={cx('mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-13 leading-[1.4]', className)}
    >
      {center.distanceKm !== null && (
        <span className={item}>
          <Icon name="distance" />
          {copy.km(roundKm(center.distanceKm))}
        </span>
      )}
      {unlocated(center) && <NoLocationTag />}
      {minutes !== null && (
        <span className={item}>
          <Icon name="car" label={copy.byCar} />
          {travelTime(minutes)}
        </span>
      )}
      {place && (
        <span className={item}>
          <Icon name="pin" />
          {place}
        </span>
      )}
    </span>
  )
}

/**
 * US-0004: what the signed-in learner's Skill Passport says, under "From your TSP profile": skills, licenses and
 * home area. Nothing for a guest or an account without a
 * passport. If the profile can't be loaded, it says so; the place box below (LocationRow) lets the learner go on.
 */
export function TspProfilePanel({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.tspProfile
  const { passport, passportStatus } = explore
  if (passportStatus === 'none') return null
  if (passportStatus === 'loading') {
    return (
      <p role="status" className={note}>
        {copy.loading}
      </p>
    )
  }
  if (passportStatus === 'failed' || !passport) {
    return (
      <p
        role="alert"
        className="m-0 rounded-10 bg-warn-bg px-3 py-2 text-13 leading-[1.5] text-warn-ink"
      >
        {copy.failed}
      </p>
    )
  }
  // The city and province, else the region the search measures from (QA-2026-11-18-D: an API or profile with only a
  // region showed "None listed" here while the location line used that region as the home area).
  const home =
    [passport.municipality, passport.province].filter(Boolean).join(', ') ||
    explore.regions.find((region) => region.code === passport.region_code)?.name ||
    ''
  const rows: [string, string][] = [
    [copy.skills, passport.skills.join(', ') || copy.none],
    [copy.licenses, (passport.licenses ?? []).join(', ') || copy.none],
    [copy.homeArea, home || copy.none],
  ]
  return (
    <section aria-labelledby="tsp-profile-heading" className={cx(card, 'flex flex-col gap-2 p-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="award" className="text-teal" />
        <h2 id="tsp-profile-heading" className={heading}>
          {copy.heading}
        </h2>
        <span className="ml-auto text-11 text-muted">{copy.sample}</span>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-13 leading-[1.45]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-semibold text-ink">{label}</dt>
            <dd className="m-0 text-navy">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Region and province filters, Scholarships only, how many centers they leave, and Clear all (QA: US-0014 AC3). The
 * type filter is the Training/Assessment chips and the place is the box above; Clear all resets those too. All of it
 * is in the address except the typed place, which is never stored.
 */
export function CenterFilters({
  regions,
  provinces,
  region,
  province,
  scholarship,
  count,
  canClear,
  onRegion,
  onProvince,
  onScholarship,
  onClear,
}: {
  regions: { code: string; name: string }[]
  provinces: string[]
  region: string | null
  province: string | null
  /** Only training centers with an open scholarship. */
  scholarship: boolean
  count: number
  canClear: boolean
  onRegion: (code: string | null) => void
  onProvince: (name: string | null) => void
  onScholarship: (on: boolean) => void
  onClear: () => void
}) {
  const copy = useCopy().explore.filters
  const scholarshipHelpId = useId()
  const select =
    'min-h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-10 border border-border bg-page py-2 pr-9 pl-3 text-14 text-navy transition-colors duration-150 hover:border-hover-border focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus'
  return (
    <section aria-label={copy.label} className={cx(card, 'flex flex-col gap-2.5 p-3')}>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-13 font-semibold text-ink">
          {copy.region}
          <span className="relative block">
            <select
              className={select}
              value={region ?? ''}
              onChange={(event) => onRegion(event.target.value || null)}
            >
              <option value="">{copy.allRegions}</option>
              {regions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-13 font-semibold text-ink">
          {copy.province}
          <span className="relative block">
            <select
              className={select}
              value={province ?? ''}
              onChange={(event) => onProvince(event.target.value || null)}
            >
              <option value="">{copy.allProvinces}</option>
              {provinces.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </span>
        </label>
      </div>
      {/* One switch, worded and colored like the Scholarship open tag it filters by. */}
      <div className="flex flex-col border-t border-rule pt-1.5">
        <Switch
          className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-10 text-14 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
          isSelected={scholarship}
          onChange={onScholarship}
          aria-describedby={scholarshipHelpId}
        >
          <span
            aria-hidden="true"
            className={cx(
              'grid size-8 flex-none place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none',
              scholarship
                ? 'bg-scholarship-fill text-white'
                : 'bg-tile-icon-violet text-scholarship-fill',
            )}
          >
            <Icon name="learn" size="1.05rem" />
          </span>
          <span className="flex-1">{copy.scholarship}</span>
          <SwitchTrack />
        </Switch>
        <p id={scholarshipHelpId} className="sr-only">
          {copy.scholarshipHelp}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-rule pt-2">
        <p role="status" className="m-0 text-13 font-semibold text-ink tabular-nums">
          {copy.shown(count)}
        </p>
        <Button
          className={button({ variant: 'tertiary', height: 38, text: 14 })}
          isDisabled={!canClear}
          onPress={onClear}
        >
          {copy.clearAll}
        </Button>
      </div>
    </section>
  )
}

/** Share my location, or type a place: where distances are measured from. Never saved, never in the address. */
export function LocationRow({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.location
  const useLocation = useTrainingStore((state) => state.useLocation)
  const error = useTrainingStore((state) => state.locationError)
  const { setUseLocation, unpinPlace } = useTrainingStore.getState()
  const state = explore.locating
    ? 'locating'
    : explore.location
      ? 'on'
      : explore.reference
        ? 'place'
        : 'off'
  const status =
    state === 'locating'
      ? copy.locating
      : state === 'on'
        ? copy.on
        : explore.reference?.pinned
          ? copy.fromPin(explore.reference.label)
          : explore.reference?.fromProfile
            ? copy.fromProfile(explore.reference.label)
            : explore.reference
              ? copy.fromPlace(explore.reference.label)
              : copy.off
  const tone = {
    locating: 'text-blue',
    on: 'text-good-ink',
    place: 'text-ink',
    off: 'text-muted',
  }[state]

  return (
    <div className={cx(card, 'flex flex-col gap-2 p-3')}>
      <Switch
        className="group flex cursor-pointer items-center gap-3 text-15 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
        isSelected={useLocation}
        onChange={setUseLocation}
      >
        <span
          aria-hidden="true"
          className={cx(
            'grid size-8 flex-none place-items-center rounded-full transition-colors duration-200',
            useLocation ? 'bg-fill text-white' : 'bg-tint text-blue',
          )}
        >
          <Icon name="locate" size="1.05rem" />
        </span>
        <span className="flex-1">{copy.share}</span>
        <SwitchTrack />
      </Switch>
      {/* A status bar under the switch: a spinner while the browser finds the learner, then a dot for on or off. */}
      <p
        role="status"
        className={cx(
          'm-0 flex items-start gap-2 pl-11 text-12 leading-[1.45] transition-colors duration-200',
          tone,
        )}
      >
        {state === 'locating' ? (
          <span
            aria-hidden="true"
            className="mt-[2px] size-3 flex-none rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
          />
        ) : (
          <span
            aria-hidden="true"
            className="mt-[5px] size-1.5 flex-none rounded-full bg-current"
          />
        )}
        {status}
      </p>
      {error && (
        <p role="alert" className="m-0 text-13 text-warn-ink">
          {copy.errors[error]}
        </p>
      )}
      {!explore.location && explore.reference && (
        <div className="flex flex-wrap items-baseline gap-x-2 text-12 leading-[1.45] text-muted">
          <span>{explore.reference.pinned ? copy.pinMoved : copy.pinHint}</span>
          {explore.reference.pinned && (
            <Button
              className="cursor-pointer border-0 bg-transparent p-0 text-12 font-semibold text-blue underline"
              onPress={unpinPlace}
            >
              {copy.unpin}
            </Button>
          )}
        </div>
      )}
      {!explore.location && <PlaceField text={explore.placeText} />}
      {!explore.location && explore.placeNotFound && (
        <p className="m-0 text-13 text-warn-ink">{copy.notFound}</p>
      )}
      {!explore.location && explore.homeArea && (
        <p className="m-0 text-12 leading-[1.45] text-muted">{copy.changeForVisit}</p>
      )}
      {/* How far the learner can go: the lists keep to it, and the map draws it once picked. */}
      <div className="flex flex-col gap-2 border-t border-rule pt-2.5">
        <p
          id="explore-location-range"
          className="m-0 flex items-center gap-1.5 text-13 font-semibold text-navy"
        >
          <Icon name="distance" className="text-blue" />
          {copy.range}
        </p>
        <RangeChips rangeKm={explore.rangeKm} label={copy.range} compact />
        {!explore.reference && <p className={note}>{copy.rangeNeedsPlace}</p>}
      </div>
    </div>
  )
}

/**
 * A center as one row: its kind, its name, the matched qualification it lists, and how far. A strong match is
 * tinted green. Pressed, it opens on the map and in the card.
 */
function CenterRow({
  center,
  code,
  qualification,
  strong = false,
  recommended = false,
  onSelect,
}: {
  center: Center
  code?: string
  /** The matched qualification this center was listed for, named under the center's name. */
  qualification?: string
  strong?: boolean
  /** Recommended to the learner for the qualification in focus: starred, as its pin is. */
  recommended?: boolean
  onSelect: (id: string, code?: string) => void
}) {
  const copy = useCopy().explore
  const search = useExploreStore((state) => state.search)
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col overflow-hidden rounded-12 border',
        strong ? 'border-good-ink/15 bg-good-bg' : 'border-transparent bg-soft',
        lift,
        'hover:border-hover-border hover:bg-surface hover:shadow-[0_8px_20px_-10px_rgb(var(--track-shadow-rgb)/0.4)]',
        'motion-safe:hover:scale-[1.015] motion-safe:active:scale-[0.99]',
      )}
    >
      <Button
        onPress={() => onSelect(center.id, code)}
        className="group flex w-full cursor-pointer items-start gap-3 border-0 bg-transparent px-3 py-2.5 text-left data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-focus"
      >
        <Icon
          name={kindIcon[center.kind]}
          size="1.1rem"
          className={cx('mt-0.5 flex-none', kindColor[center.kind])}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-14 leading-[1.35] font-semibold wrap-anywhere text-navy">
            {center.name}
          </span>
          {qualification && (
            <span className="mt-0.5 flex items-start gap-1 text-13 leading-[1.4] font-semibold text-ink">
              <Icon name="book" className="mt-0.5 flex-none text-muted" />
              {copy.results.offers[center.kind](qualification)}
            </span>
          )}
          <TripMeta center={center} />
          {recommended && (
            <span className={cx(tag, 'mt-1.5 mr-1.5 bg-[#fdecc8] py-1 font-bold text-[#7a4a05]')}>
              <Icon name="star" />
              {copy.outlook.tag}
            </span>
          )}
          {(code
            ? center.kind === 'training' && hasScholarship(center, code)
            : anyScholarship(center)) && (
            <span className={cx(solidTag, 'mt-1.5 bg-scholarship-fill')}>
              <Icon name="learn" />
              {copy.results.scholarship}
            </span>
          )}
        </span>
        <Icon
          name="chevron"
          className="mt-1 flex-none -rotate-90 text-muted transition-transform duration-200 group-data-hovered:translate-x-0.5 group-data-hovered:text-blue"
        />
      </Button>
      <CenterSuggestionFeedback
        compact
        center={center}
        qualificationCode={code}
        goal={search?.chosen ? undefined : search?.query}
        scope={search?.feedbackScope}
      />
    </div>
  )
}

/** Without a search: the nearest training and assessment centers to the learner, or how to see them. */
export function NearbyPanel({
  explore,
  view,
  onSelect,
}: {
  explore: Explore
  view: View
  onSelect: (id: string, code?: string) => void
}) {
  const en = useCopy()
  const copy = en.explore.nearby
  if (view === 'demand') return <DemandPanel explore={explore} />
  if (explore.loading) {
    return (
      <p role="status" className={note}>
        {en.training.results.loading}
      </p>
    )
  }
  if (!explore.reference) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-14 border border-dashed border-dash bg-surface/60 px-4 py-5 text-center">
        <span className="mb-1 grid size-11 place-items-center rounded-12 border border-border bg-surface text-blue">
          <Icon name="compass" size="1.25rem" />
        </span>
        <h2 className={heading}>{copy.emptyHeading}</h2>
        <p className={note}>{copy.emptyBody}</p>
        <p className={note}>{copy.allCenters(explore.centers.length)}</p>
      </div>
    )
  }
  const kinds: CenterKind[] =
    view === 'training' || view === 'assessment' ? [view] : ['training', 'assessment']
  const offered = (center: Center) =>
    new Set([
      ...[...center.programs, ...center.schedules].map((listing) => listing.qualification.code),
      ...center.accredited,
    ]).size
  const recommended = new Set(explore.recommendedIds)
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 flex items-center gap-1.5 text-13 font-semibold text-ink">
        <Icon name="pin" className="text-blue" />
        {copy.eyebrow(explore.reference.mine ? copy.you : explore.reference.label)}
      </p>
      {kinds.map((kind) => {
        const ofKind = explore.centers.filter((center) => center.kind === kind)
        const nearest = inRangeOr(ofKind, explore.rangeKm).slice(0, 3)
        const closest = nearest[0]?.distanceKm
        const outOfRange = closest != null && closest > explore.rangeKm
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h2 className={heading}>{kind === 'training' ? copy.training : copy.assessment}</h2>
            {outOfRange && (
              <p className="m-0 flex items-start gap-1.5 text-13 text-warn-ink">
                <Icon name="info" className="mt-0.5 flex-none" />
                {en.explore.results.noneNear(explore.rangeKm, roundKm(closest))}
              </p>
            )}
            {nearest.length ? (
              nearest.map((center) => (
                <div key={center.id}>
                  <CenterRow
                    center={center}
                    recommended={recommended.has(center.id)}
                    onSelect={onSelect}
                  />
                  {offered(center) > 0 && (
                    <p className="mt-1 mb-0 pl-3 text-12 text-muted">
                      {copy.offers(offered(center))}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className={note}>{copy.none}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** A qualification that fits, with its nearest center of one kind and, opened, the next ones. */
function QualificationCardView({
  card,
  groupLabel,
  hasReference,
  rangeKm,
  related,
  recommended,
  onSelect,
}: {
  card: QualificationCard
  groupLabel: string
  hasReference: boolean
  /** How far the learner can go. */
  rangeKm: number
  /** With no center in range: a related qualification that has one, and its nearest center. */
  related: Related | null
  /** The centers recommended for this card's qualification, when it is the one in focus. */
  recommended: ReadonlySet<string>
  onSelect: (id: string, code?: string) => void
}) {
  const changeRange = useExploreStore((state) => state.changeRange)
  const en = useCopy()
  const serverText = useServerText()
  const copy = en.explore.results
  const [open, setOpen] = useState(false)
  const search = useExploreStore((state) => state.search)
  const code = card.match.qualification.code
  // Within the learner's range when any is; otherwise the nearest, under a note that it is farther.
  const [first, ...rest] = hasReference ? inRangeOr(card.centers, rangeKm) : card.centers
  const more = rest.slice(0, 4)
  // A qualification opened from the library wasn't matched, so its rows aren't tinted as a strong match.
  const strong = !search?.chosen && card.strength === 'strong'
  // Labelled when any of its training centers has a scholarship open for it, so it can be spotted in the list.
  const scholarship = card.centers.some(
    (center) => center.kind === 'training' && hasScholarship(center, code),
  )

  return (
    <article
      className={cx(
        'flex flex-col gap-2 rounded-14 border border-border bg-surface p-3',
        floating,
        lift,
        'hover:border-hover-border',
        lifted,
        'motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.015]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="m-0 text-15 leading-[1.35] font-bold wrap-anywhere text-navy">
          {card.match.qualification.name}
        </h4>
        {/* A qualification opened from the library wasn't matched, so it has no strength. */}
        {!search?.chosen &&
          (card.strength === 'strong' ? (
            <span className={cx(solidTag, 'flex-none bg-good-fill')}>
              <Icon name="tick" />
              {copy.strength.strong}
            </span>
          ) : card.strength === 'good' ? (
            <span className={cx(tag, 'flex-none bg-good-bg py-1 text-good-ink')}>
              {copy.strength.good}
            </span>
          ) : (
            <span className={cx(tag, 'flex-none bg-warn-bg py-1 text-warn-ink')}>
              {copy.strength.weak}
            </span>
          ))}
      </div>
      {scholarship && (
        <span className={cx(solidTag, 'self-start bg-scholarship-fill')}>
          <Icon name="learn" />
          {copy.scholarship}
        </span>
      )}
      <p className="m-0 flex items-start gap-1.5 text-13 leading-[1.45] text-muted">
        <Icon name="sparkle" className="mt-0.5 flex-none" />
        {serverText(card.match.reason)}
      </p>
      {!search?.chosen && card.strength === 'weak' && (
        <p className="m-0 flex items-start gap-1.5 text-13 text-warn-ink">
          <Icon name="info" className="mt-0.5 flex-none" />
          {copy.weakWarning}
        </p>
      )}
      {hasReference && card.near === 0 && first?.distanceKm != null && (
        <p className="m-0 flex items-start gap-1.5 text-13 text-warn-ink">
          <Icon name="info" className="mt-0.5 flex-none" />
          <span>
            {copy.noneNear(rangeKm, roundKm(first.distanceKm))}{' '}
            <Button
              onPress={changeRange}
              aria-label={copy.changeRangeLabel(rangeKm)}
              className="cursor-pointer border-0 bg-transparent p-0 text-13 font-semibold text-blue underline underline-offset-2 data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:text-navy"
            >
              {copy.changeRange}
            </Button>
          </span>
        </p>
      )}
      {first && (
        <CenterRow
          center={first}
          code={code}
          qualification={card.match.qualification.name}
          strong={strong}
          recommended={recommended.has(first.id)}
          onSelect={onSelect}
        />
      )}
      {open &&
        more.map((center) => (
          <CenterRow
            key={center.id}
            center={center}
            code={code}
            qualification={card.match.qualification.name}
            strong={strong}
            recommended={recommended.has(center.id)}
            onSelect={onSelect}
          />
        ))}
      {more.length > 0 && (
        <Button
          className={cx(button({ variant: 'tertiary', height: 36, snug: true }), 'self-start')}
          onPress={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? copy.fewerCenters : copy.moreCenters(more.length)}
          <Icon name="chevron" className={cx('transition-transform', open && 'rotate-180')} />
        </Button>
      )}
      {related && (
        <div className="flex flex-col gap-1.5 border-t border-rule pt-2">
          <p className="m-0 flex items-center gap-1.5 text-13 font-semibold text-navy">
            <Icon name="sparkle" />
            {copy.related.heading(rangeKm)}
          </p>
          <CenterRow
            center={related.center}
            code={related.qualification.code}
            qualification={related.qualification.name}
            onSelect={onSelect}
          />
        </div>
      )}
      {search && !search.chosen && (
        <SuggestionFeedback
          compact="inset"
          kind="qualification"
          resultKey={code}
          resultName={`${card.match.qualification.name} · ${groupLabel}`}
          goal={search.query}
          scope={search.feedbackScope}
        />
      )}
    </article>
  )
}

const NONE: ReadonlySet<string> = new Set()

/** A group of cards, Get certified or Train, under its heading. */
function Group({
  kind,
  first,
  cards,
  hasReference,
  rangeKm,
  relatedFor,
  focus,
  readiness,
  noCenter,
  scholarshipOnly = false,
  onSelect,
}: {
  kind: CenterKind
  first: boolean
  cards: QualificationCard[]
  hasReference: boolean
  rangeKm: number
  relatedFor: (kind: CenterKind, card: QualificationCard) => Related | null
  /** The qualification in focus and the centers recommended for it. */
  focus: { code: string | null; recommended: ReadonlySet<string> }
  readiness?: Readiness
  /** No center lists the qualification in focus at all: what to try instead (US-0014 AC5). */
  noCenter?: { match: Match; related: Related | null } | null
  /** The Scholarships filter is on: an empty Train group says so instead of "no center lists it". */
  scholarshipOnly?: boolean
  onSelect: (id: string, code?: string) => void
}) {
  const { results: copy, tspProfile } = useCopy().explore
  const headingId = useId()
  const text =
    kind === 'assessment'
      ? first
        ? copy.certifyFirst
        : copy.certifySecond
      : first
        ? copy.trainFirst
        : copy.trainSecond
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span
          className={cx(
            'grid size-7 flex-none place-items-center rounded-full text-white',
            kindFill[kind],
          )}
        >
          <Icon name={kindIcon[kind]} />
        </span>
        <h3 id={headingId} className={heading}>
          {text.heading}
        </h3>
      </div>
      {readiness && <NextStepNote readiness={readiness} copy={tspProfile.nextStep} />}
      {cards.length ? (
        cards.map((card) => (
          <QualificationCardView
            key={card.match.qualification.code}
            card={card}
            groupLabel={text.heading}
            hasReference={hasReference}
            rangeKm={rangeKm}
            related={hasReference && card.near === 0 ? relatedFor(kind, card) : null}
            recommended={card.match.qualification.code === focus.code ? focus.recommended : NONE}
            onSelect={onSelect}
          />
        ))
      ) : scholarshipOnly && kind === 'training' ? (
        <p className="m-0 flex items-start gap-2 rounded-10 bg-panel px-3 py-2 text-13 leading-[1.5] text-ink">
          <Icon name="learn" className="mt-0.5 flex-none text-scholarship-fill" />
          {copy.noScholarship}
        </p>
      ) : noCenter ? (
        <NoCenterHelp
          match={noCenter.match}
          related={noCenter.related}
          hasReference={hasReference}
          rangeKm={rangeKm}
          onSelect={onSelect}
        />
      ) : (
        <p className={note}>{copy.noCenter}</p>
      )}
    </section>
  )
}

/**
 * No center lists the qualification anywhere (QA-2026-11-18-E, US-0014 AC5). A wider range can't help, so the
 * learner gets a next step instead: a related qualification offered within their range, other qualifications of
 * the same sector in the library, and the TESDA office to ask.
 */
function NoCenterHelp({
  match,
  related,
  hasReference,
  rangeKm,
  onSelect,
}: {
  match: Match
  related: Related | null
  hasReference: boolean
  rangeKm: number
  onSelect: (id: string, code?: string) => void
}) {
  const copy = useCopy().explore.results
  const sector = match.qualification.sector
  return (
    <div
      role="status"
      data-testid="no-center-help"
      className="flex flex-col gap-2.5 rounded-12 border border-border bg-surface p-3"
    >
      <p className="m-0 text-14 leading-[1.5] text-ink">
        {copy.noCenterAnywhere(match.qualification.name)}
      </p>
      {related ? (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 flex items-center gap-1.5 text-13 font-semibold text-navy">
            <Icon name="sparkle" />
            {copy.noCenterRelated(rangeKm)}
          </p>
          <CenterRow
            center={related.center}
            code={related.qualification.code}
            qualification={related.qualification.name}
            onSelect={onSelect}
          />
        </div>
      ) : (
        !hasReference && <p className={note}>{copy.noCenterPlace}</p>
      )}
      {sector && (
        <Link
          to={`${paths.qualifications}?sector=${encodeURIComponent(sector)}`}
          className={cx(button({ variant: 'tertiary', height: 38, text: 14 }), 'self-start')}
        >
          {copy.noCenterSector(sector)}
          <Icon name="arrowRight" />
        </Link>
      )}
      <p className={note}>{copy.noCenterAsk}</p>
    </div>
  )
}

/** 5, 10, 25, 50 or 100 km: one pressed, the learner's range. */
function RangeChips({
  rangeKm,
  label,
  compact = false,
}: {
  rangeKm: number
  label: string
  compact?: boolean
}) {
  const copy = useCopy().explore.results.range
  const { setRange } = useExploreStore.getState()
  return (
    <div role="group" aria-label={label} className={cx(segTrack, 'grid-cols-5')}>
      {RANGES_KM.map((km) => (
        <ToggleButton
          key={km}
          isSelected={km === rangeKm}
          onChange={() => setRange(km)}
          className={cx(
            segOption,
            'px-0.5 whitespace-nowrap tabular-nums',
            compact ? 'min-h-8 text-12' : 'min-h-9 text-13',
          )}
        >
          {copy.option(km)}
        </ToggleButton>
      ))}
    </div>
  )
}

/**
 * "How far can you go?": the distance within which a center counts as near. Asked again when the learner presses
 * "Change" on a qualification with no center in range; until then, nothing is shown.
 */
function RangeStep({ rangeKm }: { rangeKm: number }) {
  const copy = useCopy().explore.results.range
  const asking = useExploreStore((state) => state.askingRange)
  const { closeRange } = useExploreStore.getState()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Brought into view and focused, so a keyboard or screen-reader user lands on the question.
  useEffect(() => {
    if (!asking) return
    headingRef.current?.focus()
    headingRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [asking])
  if (!asking) return null
  return (
    <section
      aria-labelledby="explore-range-heading"
      className="flex flex-col gap-2 rounded-12 border border-pill-border bg-tint p-3"
    >
      <h3
        id="explore-range-heading"
        ref={headingRef}
        tabIndex={-1}
        className={cx(heading, 'flex items-center gap-1.5 outline-none')}
      >
        <Icon name="distance" />
        {copy.heading}
      </h3>
      <p className={note}>{copy.body}</p>
      <RangeChips rangeKm={rangeKm} label={copy.heading} />
      <Button
        className={cx(button({ variant: 'tertiary', height: 36, snug: true }), 'self-start')}
        onPress={closeRange}
      >
        {copy.keep}
      </Button>
    </section>
  )
}

/**
 * The core of the results: the centers for the qualification in focus, ranked for the learner, best first. Each says
 * its main reason, its distance and travel time, and any scholarship and demand tags; the first is "Recommended".
 * Pressed, a center opens on the map with its pin highlighted. The travel times are estimates, so the list is
 * labelled as sample data.
 */
export function RankedCenters({
  explore,
  kind,
  onSelect,
}: {
  explore: Explore
  /** Only this kind, on the Get certified or Train tab. */
  kind?: CenterKind
  onSelect: (id: string, code?: string) => void
}) {
  const en = useCopy()
  const copy = en.explore.ranked
  const headingId = useId()
  const { demandCode: code, reference, rangeKm, focusName } = explore
  if (!code) return null
  const items = explore.ranked.filter((item) => !kind || item.center.kind === kind)
  const signedIn = explore.passportStatus === 'loaded'

  return (
    <section
      aria-labelledby={headingId}
      data-testid="ranked-centers"
      className={cx('flex flex-col gap-2 rounded-14 border border-border bg-surface p-3', floating)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className={cx(heading, 'flex items-center gap-1.5')}>
            <Icon name="star" className="text-[#b45309]" />
            {copy.heading}
          </h3>
          {focusName && <p className={cx(note, 'mt-0.5')}>{copy.for(focusName)}</p>}
        </div>
        {reference && items.length > 0 && (
          // Quiet on purpose: a note for the demo, not a warning that competes with the ranking.
          <span className="mt-0.5 inline-flex flex-none items-center gap-1 text-11 text-muted opacity-80">
            <Icon name="info" size="0.8rem" />
            {copy.sample}
          </span>
        )}
      </div>
      {!reference ? (
        <p className={note}>{copy.needPlace}</p>
      ) : !items.length ? (
        <p className={note}>{copy.none}</p>
      ) : (
        <>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {items.map((item, index) => (
              <li key={item.center.id}>
                <RankedRow
                  item={item}
                  rank={index + 1}
                  top={index === 0}
                  rangeKm={rangeKm}
                  onSelect={() => onSelect(item.center.id, code)}
                />
              </li>
            ))}
          </ol>
          <p className="m-0 text-12 leading-[1.45] text-muted">
            {signedIn ? copy.howSignedIn : copy.how} {copy.sampleNote}
          </p>
        </>
      )}
    </section>
  )
}

/**
 * An assessment center's reason line: its distance band and distance, then its strongest component ("Near · 18 km ·
 * Open schedule with seats"). A center without an open schedule says so, so a nearer one without seats winning reads
 * as the distance band, not as a better schedule.
 */
function assessmentWhy(
  why: AssessmentWhy,
  km: number,
  center: Center,
  copy: ReturnType<typeof useCopy>['explore']['ranked']['assessment'],
): string {
  const strongest =
    why.strongest === 'schedule'
      ? copy.schedule[why.schedule]
      : why.strongest === 'demand'
        ? copy.demand(center.region || center.regionCode || '')
        : copy[why.strongest]
  const noSchedule =
    why.strongest !== 'schedule' &&
    (why.schedule === 'accredited' || why.schedule === 'full' || why.schedule === 'none')
  return [
    copy.bands[why.band](km),
    strongest,
    ...(noSchedule ? [copy.schedule[why.schedule]] : []),
  ].join(' · ')
}

/** One ranked center: its place in the list, its name and kind, why it ranks there, and "6 km · about 20 min · tags". */
function RankedRow({
  item,
  rank,
  top,
  rangeKm,
  onSelect,
}: {
  item: RankedCenter
  rank: number
  top: boolean
  rangeKm: number
  onSelect: () => void
}) {
  const copy = useCopy().explore.ranked
  const serverText = useServerText()
  const { center, minutes, reason } = item
  // Ranked by the server's service score: its own reasons (the first two), never a template.
  const serverWhy = (item.why ?? []).slice(0, SERVER_REASONS_SHOWN).map(serverText).join(' · ')
  const why =
    reason === 'assessment'
      ? item.assessment && center.distanceKm !== null
        ? assessmentWhy(item.assessment, roundKm(center.distanceKm), center, copy.assessment)
        : copy.reasons.inRange(rangeKm)
      : reason === 'service'
        ? serverWhy || copy.reasons.inRange(rangeKm)
        : reason === 'unconfirmed'
          ? copy.reasons.unconfirmed
          : reason === 'demand'
            ? copy.reasons.demand(center.region || center.regionCode || '')
            : reason === 'inRange' || reason === 'outside'
              ? copy.reasons[reason](rangeKm)
              : copy.reasons[reason]
  const trip = [
    ...(center.distanceKm !== null ? [copy.km(roundKm(center.distanceKm))] : []),
    ...(minutes !== null ? [copy.about(travelTime(minutes))] : []),
  ].join(' · ')
  return (
    <Button
      onPress={onSelect}
      data-testid="ranked-center"
      className={cx(
        'group flex w-full cursor-pointer items-start gap-2.5 rounded-10 border px-2.5 py-2 text-left data-focus-visible:outline-3 data-focus-visible:outline-focus',
        top ? 'border-warn-ink/35 bg-warn-bg' : 'border-transparent bg-soft',
        lift,
        'data-hovered:border-hover-border data-hovered:bg-surface data-hovered:shadow-[0_6px_14px_-6px_rgb(var(--track-shadow-rgb)/0.3)] data-pressed:scale-[0.99]',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'mt-0.5 grid size-6 flex-none place-items-center rounded-full text-12 font-bold text-white',
          kindFill[center.kind],
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        {top && (
          <span className={cx(tag, 'mb-1 bg-[#fdecc8] py-0.5 font-bold text-[#7a4a05]')}>
            <Icon name="star" />
            {copy.top}
          </span>
        )}
        <span className="block text-14 leading-[1.35] font-semibold wrap-anywhere text-navy">
          {center.name}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-12 font-semibold text-muted">
          <Icon name={kindIcon[center.kind]} className={kindColor[center.kind]} />
          {copy.kinds[center.kind]}
          {center.city ? ` · ${center.city}` : ''}
        </span>
        <span className="mt-1 block text-13 leading-[1.4] font-semibold text-ink">{why}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 leading-[1.4] text-muted">
          {trip && <span data-testid="ranked-trip">{trip}</span>}
          {item.score !== undefined && (
            <span data-testid="ranked-score" className={cx(tag, 'bg-tint text-blue tabular-nums')}>
              {copy.score(item.score)}
            </span>
          )}
          {item.scholarship && (
            <span className={cx(solidTag, 'bg-scholarship-fill py-0.5')}>
              <Icon name="learn" />
              {copy.scholarship}
            </span>
          )}
          {item.demand && (
            <span className={cx(tag, 'bg-good-bg text-good-ink')}>
              <Icon name="briefcase" />
              {copy.demand}
            </span>
          )}
          {item.ready && (
            <span className={cx(tag, 'bg-tint text-blue')}>
              <Icon name="award" />
              {copy.ready}
            </span>
          )}
        </span>
      </span>
      <Icon
        name="chevron"
        className="mt-1 flex-none -rotate-90 text-muted transition-transform duration-200 group-data-hovered:translate-x-0.5 group-data-hovered:text-blue"
      />
    </Button>
  )
}

/** After a search: tabs, then Get certified and Train in the order the learner's words suggest, or Demand. */
export function ResultsPanel({
  explore,
  view,
  onView,
  onSelect,
}: {
  explore: Explore
  view: View
  onView: (view: View) => void
  onSelect: (id: string, code?: string) => void
}) {
  const en = useCopy()
  const copy = en.explore.results
  const { search, matches, centers, reference } = explore
  if (!search) return null
  if (!matches.length && view !== 'demand') {
    return (
      <p role="status" className="m-0 rounded-12 bg-panel p-3 text-14 leading-[1.5] text-ink">
        {copy.noMatch}
      </p>
    )
  }
  if (explore.listingsLoading && view !== 'demand') {
    return (
      <p role="status" className={note}>
        {en.training.results.loading}
      </p>
    )
  }

  const { rangeKm } = explore
  const assess = cardsFor('assessment', matches, centers, rangeKm)
  const train = cardsFor('training', matches, centers, rangeKm)
  const relatedFor = (kind: CenterKind, card: QualificationCard) =>
    relatedWithin({
      kind,
      match: card.match,
      matches,
      nearby: explore.nearbyCenters,
      catalog: explore.catalog,
      rangeKm,
    })
  const focus = { code: explore.demandCode, recommended: new Set(explore.recommendedIds) }
  // The highest-ranked match whose CORE units the learner's certificates show (the server's next step), even when
  // it isn't the first match. Self-declared skills alone never make one.
  const readiness = matches
    .map(({ qualification }) => ({
      qualification: qualification.name,
      fit: explore.fits.get(qualification.code) ?? null,
    }))
    .find(
      (item): item is Readiness =>
        item.fit !== null &&
        (ASSESS_FIRST.has(item.fit.next_step) || item.fit.next_step === 'gap_training'),
    )
  const assessFirst = readiness !== undefined && ASSESS_FIRST.has(readiness.fit.next_step)
  const order: CenterKind[] =
    assessFirst || (!readiness && firstKind(search.query) !== 'training')
      ? ['assessment', 'training']
      : ['training', 'assessment']
  const shown = view === 'all' ? order : view === 'demand' ? [] : [view]
  // A tab counts the centers it would pin (as "N centers shown" does), not the qualifications listed under it.
  const centerCount = (cards: readonly QualificationCard[]) =>
    new Set(cards.flatMap((card) => card.centers.map((center) => center.id))).size
  const tabs: { view: View; label: string; icon: IconName; count?: number }[] = [
    { view: 'all', label: copy.tabs.all, icon: 'grid' },
    { view: 'assessment', label: copy.tabs.assess, icon: 'award', count: centerCount(assess) },
    { view: 'training', label: copy.tabs.train, icon: 'learn', count: centerCount(train) },
    { view: 'demand', label: copy.tabs.demand, icon: 'briefcase' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* An underlined tab row: icon and label sit on one line, the chosen view is navy with a bar beneath it.
          Labels never truncate; when the row is narrow the icons drop out first. */}
      <div className="@container/tabs">
        <div
          role="group"
          aria-label={copy.tabs.label}
          className="flex items-stretch gap-1 border-b border-line"
        >
          {tabs.map((tab) => (
            <ToggleButton
              key={tab.view}
              isSelected={view === tab.view}
              onChange={() => onView(tab.view)}
              aria-label={
                tab.count === undefined ? undefined : copy.tabs.counted(tab.label, tab.count)
              }
              className={cx(
                'group relative flex min-h-11 flex-auto shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-t-10 border-0 bg-transparent px-2',
                'text-13 font-semibold whitespace-nowrap text-muted',
                'transition-colors duration-150 ease-out',
                'data-hovered:text-navy data-selected:text-navy',
                'data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-focus',
              )}
            >
              <Icon
                name={tab.icon}
                size="1rem"
                className="hidden shrink-0 @min-[27rem]/tabs:block"
              />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  aria-hidden="true"
                  className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-chip px-1.5 text-11 leading-none font-bold text-muted tabular-nums transition-colors duration-150 group-data-hovered:text-navy group-data-selected:bg-navy group-data-selected:text-surface"
                >
                  {tab.count.toLocaleString()}
                </span>
              )}
              {/* Hover previews the bar in the line color; the chosen tab fills it navy. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.75 origin-center scale-x-0 rounded-full bg-line transition-transform duration-200 ease-out group-data-hovered:scale-x-100 group-data-selected:scale-x-100 group-data-selected:bg-navy motion-reduce:transition-none"
              />
            </ToggleButton>
          ))}
        </div>
      </div>
      <h2 className="sr-only">{copy.heading}</h2>
      {!reference && view !== 'demand' && (
        <p className="m-0 rounded-10 bg-tint px-3 py-2 text-13 text-navy">{copy.needPlace}</p>
      )}
      {/* Asked even before there is a place: arriving from Find my pathway opens it straight away. */}
      {view !== 'demand' && <RangeStep rangeKm={rangeKm} />}
      {/* The ranked list comes first: the answer to "where should I go, and why?". */}
      {view !== 'demand' && (
        <RankedCenters
          explore={explore}
          kind={view === 'all' ? undefined : view}
          onSelect={onSelect}
        />
      )}
      {shown.map((kind, index) => (
        <Group
          key={kind}
          kind={kind}
          first={view !== 'all' || index === 0}
          cards={kind === 'assessment' ? assess : train}
          hasReference={reference !== null}
          rangeKm={rangeKm}
          relatedFor={relatedFor}
          focus={focus}
          readiness={(kind === 'assessment') === assessFirst ? readiness : undefined}
          scholarshipOnly={explore.scholarshipOnly}
          noCenter={
            matches[0] && (kind === 'assessment' ? assess : train).length === 0
              ? {
                  match: matches[0],
                  related: reference
                    ? relatedFor(kind, { match: matches[0] } as QualificationCard)
                    : null,
                }
              : null
          }
          onSelect={onSelect}
        />
      ))}
      {view === 'demand' && <DemandPanel explore={explore} />}
      {/* The demand views list records, not trips or suggestions to rate: one line says where they come from. */}
      <div className="flex flex-col gap-1">
        {reference && view !== 'demand' && <p className={note}>{en.explore.notes.times}</p>}
        <p className={note}>{en.explore.notes.automatic}</p>
        {search && view !== 'demand' && <p className={note}>{en.suggestionFeedback.note}</p>}
      </div>
    </div>
  )
}

/** The chosen center: where it is, what it was listed for, the readiness check, and how to get there or get in touch. */
export function CenterCard({
  center,
  code,
  codes,
  canRoute,
  routeFrom,
  config,
  onBack,
  onRoute,
}: {
  center: Center
  /** The qualification whose card it was opened from; from the map, none. */
  code: string | null
  codes: ReadonlySet<string>
  canRoute: boolean
  /** The learner's location, when routes by car, bike and on foot can be loaded from it. */
  routeFrom: Point | null
  config: ClientConfig | undefined
  onBack: () => void
  onRoute: () => void
}) {
  const en = useCopy()
  const copy = en.explore.card
  const search = useExploreStore((state) => state.search)
  const openPathway = useOpenPathway()
  // The center's whole offering once it's loaded; until then (or if it fails) what the search already found.
  const offerings = useQuery(offeringsQuery(center)).data
  const listings = [...center.programs, ...center.schedules, ...(offerings ?? [])]
  // An assessment center's accreditations are codes only: the catalog names them.
  const catalog = useQuery({ ...qualificationsQuery, enabled: center.accredited.length > 0 }).data
  const accredited = center.accredited.flatMap((accreditedCode) => {
    const qualification = catalog?.find((item) => item.code === accreditedCode)
    return qualification ? [{ code: qualification.code, name: qualification.name }] : []
  })
  // Every qualification the center offers, those matching the learner's search first (Card 2).
  const offered = [
    ...new Map([
      ...accredited.map((qualification) => [qualification.code, qualification] as const),
      ...listings.map((listing) => [listing.qualification.code, listing.qualification] as const),
    ]).values(),
  ]
  const matches = (qualification: { code: string }) => codes.has(qualification.code)
  const listedFor = [...offered.filter(matches), ...offered.filter((q) => !matches(q))]
  // The readiness check is for the qualification the card was opened from, or else the first one listed here.
  const readiness = openPathway
    ? (listedFor.find((qualification) => qualification.code === code) ??
      listedFor.find(matches) ??
      listedFor[0])
    : undefined
  const point =
    center.latitude !== null && center.longitude !== null
      ? { latitude: center.latitude, longitude: center.longitude }
      : null
  const scholarships = center.programs.filter(
    (program) => program.scholarship_open && (!codes.size || codes.has(program.qualification.code)),
  )
  const scholarship = scholarships.length > 0
  // Each way to get in touch shows its number or address, as the map's popup does.
  const contacts: {
    key: string
    href: string
    icon: IconName
    label: string
    value: string
    external?: boolean
  }[] = []
  // Each number listed gets its own row, so each one dials on its own.
  for (const phone of center.phone ? splitPhones(center.phone) : [])
    contacts.push({
      key: `call-${phone.tel}`,
      href: `tel:${phone.tel}`,
      icon: 'phone',
      label: copy.call,
      value: phone.text,
    })
  if (center.email)
    contacts.push({
      key: 'email',
      href: `mailto:${center.email}`,
      icon: 'mail',
      label: copy.email,
      value: center.email,
    })
  if (center.website)
    contacts.push({
      key: 'website',
      href: center.website,
      icon: 'globe',
      label: copy.website,
      value: center.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
      external: true,
    })
  const directions = cx(button({ variant: 'primary', height: 44 }), 'w-full')
  // With real routes below, the straight-line estimate would disagree with them, so it only stands in for them.
  const routed = Boolean(routeFrom && point && config?.routing_enabled)

  return (
    <article className="flex flex-col gap-3">
      <Button
        className={cx(button({ variant: 'tertiary', height: 36, snug: true }), 'group self-start')}
        onPress={onBack}
      >
        <Icon
          name="arrowLeft"
          className="transition-transform duration-200 group-data-hovered:-translate-x-0.5"
        />
        {copy.back}
      </Button>

      <div className={cx('overflow-hidden rounded-16 border border-border bg-surface', floating)}>
        {/* A band in the kind's map color: which kind of center, its name, and how far. */}
        <div
          className={cx('flex flex-col gap-2 px-4 pt-4 pb-3.5 text-white', kindBand[center.kind])}
        >
          <p className="m-0 flex items-center gap-2 text-12 font-bold tracking-[0.06em] uppercase">
            <span className="grid size-8 place-items-center rounded-full bg-white/20">
              <Icon name={kindIcon[center.kind]} size="1.05rem" />
            </span>
            {center.kind === 'training' ? copy.training : copy.assessment}
          </p>
          <h2 className="m-0 text-18 leading-[1.3] font-bold wrap-anywhere">{center.name}</h2>
          <p className="m-0 flex items-center gap-1.5 text-14 text-white/90">
            <Icon name="pin" className="flex-none" />
            {placeLabel(center)}
          </p>
          {!routed && <TripMeta center={center} className="text-white/90" withPlace={false} />}
        </div>

        <div className="flex flex-col gap-3 p-4">
          <DataProvenance value={center.provenance} />
          <CenterSuggestionFeedback
            center={center}
            qualificationCode={code ?? undefined}
            goal={search?.chosen ? undefined : search?.query}
            scope={search?.feedbackScope}
          />
          {(center.kind === 'assessment' || scholarship) && (
            <div className="flex flex-wrap gap-1.5">
              {center.kind === 'assessment' ? (
                <span className={cx(solidTag, 'bg-[#0f766e]')}>
                  <Icon name="award" />
                  {copy.leadsToNc}
                </span>
              ) : (
                <>
                  <span className={cx(solidTag, 'bg-scholarship-fill')}>
                    <Icon name="learn" />
                    {en.explore.results.scholarship}
                  </span>
                </>
              )}
            </div>
          )}
          {listedFor.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 flex items-center gap-1.5 text-13 font-semibold text-navy">
                <Icon name="book" />
                {copy.listedFor}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {listedFor.map((qualification) => (
                  <span
                    key={qualification.code}
                    className={cx(
                      tag,
                      'py-1',
                      matches(qualification) || qualification.code === readiness?.code
                        ? 'bg-tint text-blue ring-1 ring-pill-border'
                        : 'bg-chip text-navy',
                    )}
                  >
                    {matches(qualification) && (
                      <Icon name="check" label={copy.matchesSearch} className="flex-none" />
                    )}
                    {qualification.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {center.address && (
            <p className="m-0 flex items-start gap-2 text-13 leading-[1.5] text-ink">
              <Icon name="pin" className="mt-0.5 flex-none text-muted" label={copy.address} />
              {center.address}
            </p>
          )}
          {/* No source records how easy a center is to reach (transport, landmarks), so it says so. */}
          <p className="m-0 flex items-start gap-2 text-13 leading-[1.5] text-ink">
            <Icon name="route" className="mt-0.5 flex-none text-muted" />
            <span>
              <span className="font-semibold">{copy.reach}:</span>{' '}
              <span className="text-muted">{copy.notProvided}</span>
            </span>
          </p>

          {/* By car, bike and on foot from the learner's location: the routes the map draws. */}
          {routed && routeFrom && point && (
            <div className="flex flex-col gap-2 rounded-12 bg-panel p-3">
              <p className="m-0 flex items-center gap-1.5 text-13 font-semibold text-navy">
                <Icon name="route" />
                {copy.travel}
              </p>
              <RoutePanel from={routeFrom} to={point} />
            </div>
          )}

          {point &&
            (canRoute && config?.routing_enabled ? (
              <Button className={directions} onPress={onRoute}>
                <Icon name="directions" />
                {copy.route}
              </Button>
            ) : (
              <a
                className={directions}
                href={googleMapsDirections(point)}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="directions" />
                {copy.directions}
              </a>
            ))}

          {readiness && openPathway && (
            <Button
              onPress={() => openPathway(readiness.code)}
              className={cx(
                'group flex w-full cursor-pointer items-center gap-3 rounded-12 border border-transparent bg-good-bg p-3 text-left data-focus-visible:outline-3 data-focus-visible:outline-focus',
                lift,
                'data-hovered:border-good-fill/40 data-hovered:shadow-[0_6px_14px_-6px_rgb(var(--track-shadow-rgb)/0.3)]',
              )}
            >
              <span className="grid size-9 flex-none place-items-center rounded-full bg-good-fill text-white">
                <Icon name="checklist" size="1.1rem" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-14 font-bold text-navy">{copy.readiness}</span>
                <span className="block text-12 wrap-anywhere text-muted">
                  {copy.readinessFor(readiness.name)}
                </span>
              </span>
              <Icon
                name="arrowRight"
                className="flex-none text-good-ink transition-transform duration-200 group-data-hovered:translate-x-0.5"
              />
            </Button>
          )}
        </div>
      </div>

      {contacts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-12 font-bold tracking-[0.04em] text-muted uppercase">
            {copy.contact}
          </h3>
          <div
            className={cx(
              'flex flex-col divide-y divide-rule overflow-hidden rounded-14 border border-border bg-surface',
              floating,
            )}
          >
            {contacts.map((contact) => (
              <a
                key={contact.key}
                href={contact.href}
                {...(contact.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="group flex items-center gap-3 px-3 py-2.5 no-underline transition-colors duration-200 hover:bg-row-hover focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus"
              >
                <span className="grid size-9 flex-none place-items-center rounded-full bg-tint text-blue transition-colors duration-200 group-hover:bg-fill group-hover:text-white">
                  <Icon name={contact.icon} size="1.05rem" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-12 text-muted">{contact.label}</span>
                  <span className="block text-14 font-semibold wrap-anywhere text-navy">
                    {contact.value}
                  </span>
                </span>
                <Icon
                  name={contact.external ? 'external' : 'arrowRight'}
                  className="flex-none text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-blue"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {!routed && center.distanceKm !== null && <p className={note}>{en.explore.notes.times}</p>}
    </article>
  )
}
