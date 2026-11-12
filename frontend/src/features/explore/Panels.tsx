import { useState } from 'react'
import { Button, Input, Label, Switch, TextField, ToggleButton } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { useFinderStore } from '../finder/store.ts'
import { QualificationEvidence } from '../labor-market/QualificationEvidence.tsx'
import type { ClientConfig } from '../training/api.ts'
import type { CenterKind } from '../training/address.ts'
import { googleMapsDirections, RoutePanel } from '../training/CenterDetail.tsx'
import { placeLabel, type Center, type Point } from '../training/centers.ts'
import { useTrainingStore } from '../training/state.ts'
import type { View } from './ExplorePage.tsx'
import {
  cardsFor,
  estimateMinutes,
  firstKind,
  hasScholarship,
  NEAR_KM,
  nearestRegion,
  roundKm,
  type QualificationCard,
} from './explore.ts'
import { useExploreStore, type Explore } from './useExplore.ts'

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

/** 10.1 km · 28 min · Manila, each behind its icon; without the city where the place is shown already. */
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
      {minutes !== null && (
        <span className={item}>
          <Icon name="car" label={copy.byCar} />
          {copy.minutesShort(minutes)}
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

/** Share my location, or type a place: where distances are measured from. Never saved, never in the address. */
export function LocationRow({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.location
  const useLocation = useTrainingStore((state) => state.useLocation)
  const error = useTrainingStore((state) => state.locationError)
  const { setUseLocation, setPlaceText } = useTrainingStore.getState()
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
        : explore.reference
          ? copy.fromPlace(explore.reference.label)
          : copy.off
  const tone = {
    locating: 'bg-tint text-blue',
    on: 'bg-good-bg text-good-ink',
    place: 'bg-surface text-ink',
    off: 'bg-surface text-muted',
  }[state]

  return (
    <div className="flex flex-col gap-2 rounded-12 bg-panel p-3">
      <Switch
        className="group flex cursor-pointer items-center gap-3 text-15 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
        isSelected={useLocation}
        onChange={setUseLocation}
      >
        <Icon name="locate" className="text-muted" />
        <span className="flex-1">{copy.share}</span>
        <span
          className="relative h-6 w-[42px] flex-none rounded-full bg-dash transition-[background] duration-200 group-data-selected:bg-fill"
          aria-hidden="true"
        >
          <span className="absolute top-[3px] left-[3px] size-4.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 group-data-selected:translate-x-[18px]" />
        </span>
      </Switch>
      {/* A status bar under the switch: a spinner while the browser finds the learner, then a dot for on or off. */}
      <p
        role="status"
        className={cx(
          'm-0 flex items-start gap-2 rounded-8 px-2.5 py-1.5 text-13 leading-[1.45] transition-colors duration-200',
          tone,
        )}
      >
        {state === 'locating' ? (
          <span
            aria-hidden="true"
            className="mt-[3px] size-3.5 flex-none rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
          />
        ) : (
          <span aria-hidden="true" className="mt-[6px] size-2 flex-none rounded-full bg-current" />
        )}
        {status}
      </p>
      {error && (
        <p role="alert" className="m-0 text-13 text-warn-ink">
          {copy.errors[error]}
        </p>
      )}
      {!explore.location && (
        <TextField
          value={explore.placeText}
          onChange={setPlaceText}
          className="flex flex-col gap-1"
        >
          <Label className="text-13 font-semibold text-ink">{copy.place}</Label>
          <Input
            className="min-h-10 rounded-10 border border-hover-border bg-surface px-3 text-15 text-navy placeholder:text-muted data-focused:border-blue"
            placeholder={copy.placePlaceholder}
          />
        </TextField>
      )}
      {!explore.location && explore.placeNotFound && (
        <p className="m-0 text-13 text-warn-ink">{copy.notFound}</p>
      )}
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
  onSelect,
}: {
  center: Center
  code?: string
  /** The matched qualification this center was listed for, named under the center's name. */
  qualification?: string
  strong?: boolean
  onSelect: (id: string, code?: string) => void
}) {
  const copy = useCopy().explore
  return (
    <Button
      onPress={() => onSelect(center.id, code)}
      className={cx(
        'group flex w-full cursor-pointer items-start gap-3 rounded-10 border border-transparent px-3 py-2.5 text-left data-focus-visible:outline-3 data-focus-visible:outline-focus',
        strong ? 'bg-good-bg' : 'bg-soft',
        lift,
        'data-hovered:border-hover-border data-hovered:bg-surface data-hovered:shadow-[0_6px_14px_-6px_rgb(var(--track-shadow-rgb)/0.3)] data-pressed:scale-[0.99]',
      )}
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
        {code && center.kind === 'training' && hasScholarship(center, code) && (
          <span className={cx(solidTag, 'mt-1.5 bg-scholarship-fill')}>
            <Icon name="star" />
            {copy.results.scholarship}
          </span>
        )}
      </span>
      <Icon
        name="chevron"
        className="mt-1 flex-none -rotate-90 text-muted transition-transform duration-200 group-data-hovered:translate-x-0.5 group-data-hovered:text-blue"
      />
    </Button>
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
  if (explore.loading) {
    return (
      <p role="status" className={note}>
        {en.training.results.loading}
      </p>
    )
  }
  if (!explore.reference) {
    return (
      <div className="flex flex-col gap-1.5 py-1">
        <h2 className={heading}>{copy.emptyHeading}</h2>
        <p className={note}>{copy.emptyBody}</p>
        <p className={note}>{copy.allCenters(explore.centers.length)}</p>
      </div>
    )
  }
  const kinds: CenterKind[] =
    view === 'training' || view === 'assessment' ? [view] : ['training', 'assessment']
  const offered = (center: Center) =>
    new Set([...center.programs, ...center.schedules].map((listing) => listing.qualification.code))
      .size
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-12 font-bold tracking-[0.06em] text-eyebrow uppercase">
        {copy.eyebrow(explore.reference.mine ? copy.you : explore.reference.label)}
      </p>
      {kinds.map((kind) => {
        const nearest = explore.centers.filter((center) => center.kind === kind).slice(0, 3)
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h2 className={heading}>{kind === 'training' ? copy.training : copy.assessment}</h2>
            {nearest.length ? (
              nearest.map((center) => (
                <div key={center.id}>
                  <CenterRow center={center} onSelect={onSelect} />
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
  hasReference,
  onSelect,
}: {
  card: QualificationCard
  hasReference: boolean
  onSelect: (id: string, code?: string) => void
}) {
  const en = useCopy()
  const copy = en.explore.results
  const [open, setOpen] = useState(false)
  const search = useExploreStore((state) => state.search)
  const code = card.match.qualification.code
  const [first, ...rest] = card.centers
  const more = rest.slice(0, 4)
  // A qualification opened from the library wasn't matched, so its rows aren't tinted as a strong match.
  const strong = !search?.chosen && card.strength === 'strong'

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
          ) : (
            <span className={cx(tag, 'flex-none bg-good-bg py-1 text-good-ink')}>
              {copy.strength.good}
            </span>
          ))}
      </div>
      <p className="m-0 flex items-start gap-1.5 text-13 leading-[1.45] text-muted">
        <Icon name="sparkle" className="mt-0.5 flex-none" />
        {card.match.reason}
      </p>
      {hasReference && card.near === 0 && first?.distanceKm != null && (
        <p className="m-0 flex items-start gap-1.5 text-13 text-warn-ink">
          <Icon name="info" className="mt-0.5 flex-none" />
          {copy.noneNear(NEAR_KM, roundKm(first.distanceKm))}
        </p>
      )}
      {first && (
        <CenterRow
          center={first}
          code={code}
          qualification={card.match.qualification.name}
          strong={strong}
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
    </article>
  )
}

/** A group of cards, Get certified or Train, under its heading. */
function Group({
  kind,
  first,
  cards,
  hasReference,
  onSelect,
}: {
  kind: CenterKind
  first: boolean
  cards: QualificationCard[]
  hasReference: boolean
  onSelect: (id: string, code?: string) => void
}) {
  const copy = useCopy().explore.results
  const text =
    kind === 'assessment'
      ? first
        ? copy.certifyFirst
        : copy.certifySecond
      : first
        ? copy.trainFirst
        : copy.trainSecond
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span
          className={cx(
            'grid size-7 flex-none place-items-center rounded-full text-white',
            kindFill[kind],
          )}
        >
          <Icon name={kindIcon[kind]} />
        </span>
        <h3 className={heading}>{text.heading}</h3>
      </div>
      {cards.length ? (
        cards.map((card) => (
          <QualificationCardView
            key={card.match.qualification.code}
            card={card}
            hasReference={hasReference}
            onSelect={onSelect}
          />
        ))
      ) : (
        <p className={note}>{copy.noCenter}</p>
      )}
    </section>
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
  if (!matches.length) {
    return (
      <p role="status" className="m-0 rounded-12 bg-panel p-3 text-14 leading-[1.5] text-ink">
        {copy.noMatch}
      </p>
    )
  }
  if (explore.listingsLoading) {
    return (
      <p role="status" className={note}>
        {en.training.results.loading}
      </p>
    )
  }

  const assess = cardsFor('assessment', matches, centers)
  const train = cardsFor('training', matches, centers)
  const order: CenterKind[] =
    firstKind(search.query) === 'training' ? ['training', 'assessment'] : ['assessment', 'training']
  const shown = view === 'all' ? order : view === 'demand' ? [] : [view]
  const tabs: { view: View; label: string; icon: IconName; count?: number }[] = [
    { view: 'all', label: copy.tabs.all, icon: 'grid' },
    { view: 'assessment', label: copy.tabs.assess, icon: 'award', count: assess.length },
    { view: 'training', label: copy.tabs.train, icon: 'learn', count: train.length },
    { view: 'demand', label: copy.tabs.demand, icon: 'briefcase' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Four equal slots, each an icon over its label, so the row fits the panel and never scrolls. */}
      <div
        role="group"
        aria-label={copy.tabs.label}
        className="grid grid-cols-4 gap-1 rounded-14 bg-chip p-1"
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
              'group flex min-h-13 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-10 border-0 bg-transparent px-1 text-12 font-semibold text-muted',
              lift,
              'data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
              'data-hovered:bg-surface/70 data-hovered:text-navy',
              'data-selected:bg-fill data-selected:text-white data-selected:shadow-[0_4px_10px_-3px_rgb(var(--track-shadow-rgb)/0.35)]',
            )}
          >
            <span className="relative">
              <Icon name={tab.icon} size="1.15rem" />
              {tab.count !== undefined && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-3 grid h-4 min-w-4 place-items-center rounded-full bg-fill px-1 text-11 leading-none font-bold text-white ring-2 ring-chip group-data-selected:bg-white group-data-selected:text-fill group-data-selected:ring-fill"
                >
                  {tab.count}
                </span>
              )}
            </span>
            {tab.label}
          </ToggleButton>
        ))}
      </div>
      <h2 className="sr-only">{copy.heading}</h2>
      {!reference && view !== 'demand' && (
        <p className="m-0 rounded-10 bg-tint px-3 py-2 text-13 text-navy">{copy.needPlace}</p>
      )}
      {shown.map((kind, index) => (
        <Group
          key={kind}
          kind={kind}
          first={view !== 'all' || index === 0}
          cards={kind === 'assessment' ? assess : train}
          hasReference={reference !== null}
          onSelect={onSelect}
        />
      ))}
      {view === 'demand' && <DemandView explore={explore} />}
      <div className="flex flex-col gap-1">
        {reference && <p className={note}>{en.explore.notes.times}</p>}
        <p className={note}>{en.explore.notes.automatic}</p>
      </div>
    </div>
  )
}

/** Demand: the labor-market evidence the API already has for one matched qualification, in the learner's region. */
function DemandView({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.demand
  const [code, setCode] = useState(explore.matches[0]?.qualification.code ?? '')
  const region = nearestRegion(explore.reference, explore.regions)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-full bg-tint text-blue">
          <Icon name="briefcase" />
        </span>
        <div>
          <h3 className={heading}>{copy.heading}</h3>
          <p className={note}>{copy.body}</p>
        </div>
      </div>
      <div role="group" aria-label={copy.choose} className="flex flex-wrap gap-1.5">
        {explore.matches.map((match) => (
          <ToggleButton
            key={match.qualification.code}
            isSelected={code === match.qualification.code}
            onChange={() => setCode(match.qualification.code)}
            className="min-h-8 cursor-pointer rounded-full border border-border bg-surface px-3 text-12 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-focus data-selected:border-fill data-selected:bg-fill data-selected:text-white"
          >
            {match.qualification.name}
          </ToggleButton>
        ))}
      </div>
      <p className={note}>{region ? copy.region(region.name) : copy.national}</p>
      {code && <QualificationEvidence qualificationCode={code} regionCode={region?.code ?? null} />}
    </section>
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
  const openPathway = useOpenPathway()
  const listings = [...center.programs, ...center.schedules]
  const listedFor = [
    ...new Map(
      listings
        .filter((listing) => !codes.size || codes.has(listing.qualification.code))
        .map((listing) => [listing.qualification.code, listing.qualification]),
    ).values(),
  ]
  // The readiness check is for the qualification the card was opened from, or else the first one listed here.
  const readiness = openPathway
    ? (listedFor.find((qualification) => qualification.code === code) ?? listedFor[0])
    : undefined
  const point =
    center.latitude !== null && center.longitude !== null
      ? { latitude: center.latitude, longitude: center.longitude }
      : null
  const scholarship = center.programs.some(
    (program) =>
      program.scholarship_available && (!codes.size || codes.has(program.qualification.code)),
  )
  const details = `${paths.training}?${new URLSearchParams({
    center: center.id,
    ...(listedFor.length === 1 ? { qualification: listedFor[0].code } : {}),
  })}`
  // Each way to get in touch shows its number or address, as the map's popup does.
  const contacts: {
    key: string
    href: string
    icon: IconName
    label: string
    value: string
    external?: boolean
  }[] = []
  if (center.phone)
    contacts.push({
      key: 'call',
      href: `tel:${center.phone}`,
      icon: 'phone',
      label: copy.call,
      value: center.phone,
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
          {(center.kind === 'assessment' || scholarship) && (
            <div className="flex flex-wrap gap-1.5">
              {center.kind === 'assessment' ? (
                <span className={cx(solidTag, 'bg-[#0f766e]')}>
                  <Icon name="award" />
                  {copy.leadsToNc}
                </span>
              ) : (
                <span className={cx(solidTag, 'bg-scholarship-fill')}>
                  <Icon name="star" />
                  {en.explore.results.scholarship}
                </span>
              )}
            </div>
          )}
          {listedFor.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 flex items-center gap-1.5 text-12 font-bold tracking-[0.04em] text-muted uppercase">
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
                      qualification.code === readiness?.code
                        ? 'bg-tint text-blue ring-1 ring-pill-border'
                        : 'bg-chip text-navy',
                    )}
                  >
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

          {/* By car, bike and on foot from the learner's location: the routes the map draws. */}
          {routed && routeFrom && point && (
            <div className="flex flex-col gap-2 rounded-12 bg-panel p-3">
              <p className="m-0 flex items-center gap-1.5 text-12 font-bold tracking-[0.04em] text-muted uppercase">
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

      <Link
        className="group inline-flex items-center gap-1.5 self-start text-14 font-semibold text-blue"
        to={details}
      >
        <Icon name="map" />
        {copy.details}
        <Icon
          name="arrowRight"
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </Link>
      {!routed && center.distanceKm !== null && <p className={note}>{en.explore.notes.times}</p>}
    </article>
  )
}
