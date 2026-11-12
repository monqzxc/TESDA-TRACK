import { useState } from 'react'
import { Button, Input, Label, Switch, TextField, ToggleButton } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { useFinderStore } from '../finder/store.ts'
import { QualificationEvidence } from '../labor-market/QualificationEvidence.tsx'
import type { ClientConfig } from '../training/api.ts'
import type { CenterKind } from '../training/address.ts'
import { googleMapsDirections } from '../training/CenterDetail.tsx'
import { placeLabel, type Center } from '../training/centers.ts'
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
const kindIcon = { training: 'learn', assessment: 'award' } as const

/** "2.8 km · about 10 min by car · Quezon City": the city alone without a distance. */
function useTripLine() {
  const copy = useCopy().explore.trip
  return (center: Center) => {
    const place = placeLabel(center)
    if (center.distanceKm === null) return place
    const minutes = estimateMinutes(center.distanceKm)
    return [
      copy.km(roundKm(center.distanceKm)),
      minutes === null ? null : copy.minutes(minutes),
      place,
    ]
      .filter(Boolean)
      .join(' · ')
  }
}

/** Share my location, or type a place: where distances are measured from. Never saved, never in the address. */
export function LocationRow({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.location
  const useLocation = useTrainingStore((state) => state.useLocation)
  const error = useTrainingStore((state) => state.locationError)
  const { setUseLocation, setPlaceText } = useTrainingStore.getState()
  const status = explore.locating
    ? copy.locating
    : explore.location
      ? copy.on
      : explore.reference
        ? copy.fromPlace(explore.reference.label)
        : copy.off

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
      <p className={note} role="status">
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

/** A center as one row: its kind, its name and how far. Pressed, it opens on the map and in the card. */
function CenterRow({
  center,
  code,
  onSelect,
}: {
  center: Center
  code?: string
  onSelect: (id: string) => void
}) {
  const copy = useCopy().explore
  const trip = useTripLine()
  return (
    <Button
      onPress={() => onSelect(center.id)}
      className="flex w-full cursor-pointer items-start gap-3 rounded-10 border border-transparent bg-soft px-3 py-2.5 text-left data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:border-row-hover-border data-hovered:bg-row-hover"
    >
      <Icon
        name={kindIcon[center.kind]}
        size="1.1rem"
        className={cx(
          'mt-0.5 flex-none',
          center.kind === 'training' ? 'text-legend-provider' : 'text-legend-assessment',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-14 leading-[1.35] font-semibold wrap-anywhere text-navy">
          {center.name}
        </span>
        <span className="block text-13 leading-[1.4] text-muted">{trip(center)}</span>
        {code && center.kind === 'training' && hasScholarship(center, code) && (
          <span className={cx(tag, 'mt-1 bg-good-bg text-good-ink')}>
            <Icon name="star" />
            {copy.results.scholarship}
          </span>
        )}
      </span>
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
  onSelect: (id: string) => void
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
  onSelect: (id: string) => void
}) {
  const en = useCopy()
  const copy = en.explore.results
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const search = useExploreStore((state) => state.search)
  const code = card.match.qualification.code
  const [first, ...rest] = card.centers
  const more = rest.slice(0, 4)

  // Find my pathway, picked up at the readiness check for this qualification: the same goal and reading of it.
  const openPathway = () => {
    if (!search) return
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

  return (
    <article className="flex flex-col gap-2 rounded-12 border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="m-0 text-15 leading-[1.35] font-bold wrap-anywhere text-navy">
          {card.match.qualification.name}
        </h4>
        <span
          className={cx(
            tag,
            'flex-none',
            card.strength === 'strong' ? 'bg-good-bg text-good-ink' : 'bg-chip text-navy',
          )}
        >
          {copy.strength[card.strength]}
        </span>
      </div>
      <p className="m-0 text-13 leading-[1.45] text-ink">{card.match.reason}</p>
      {hasReference && card.near === 0 && first?.distanceKm != null && (
        <p className="m-0 text-13 text-warn-ink">
          {copy.noneNear(NEAR_KM, roundKm(first.distanceKm))}
        </p>
      )}
      {first && <CenterRow center={first} code={code} onSelect={onSelect} />}
      {open &&
        more.map((center) => (
          <CenterRow key={center.id} center={center} code={code} onSelect={onSelect} />
        ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {more.length > 0 ? (
          <Button
            className={button({ variant: 'tertiary', height: 36, snug: true })}
            onPress={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? copy.fewerCenters : copy.moreCenters(more.length)}
          </Button>
        ) : (
          <span />
        )}
        <Button
          className={button({ variant: 'tertiary', height: 36, snug: true })}
          onPress={openPathway}
        >
          {copy.pathway}
          <Icon name="arrowRight" />
        </Button>
      </div>
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
  onSelect: (id: string) => void
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
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-full bg-tint text-blue">
          <Icon name={kindIcon[kind]} />
        </span>
        <div>
          <h3 className={heading}>{text.heading}</h3>
          <p className={note}>{text.body}</p>
        </div>
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
  onSelect: (id: string) => void
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
  const tabs: { view: View; label: string }[] = [
    { view: 'all', label: copy.tabs.all },
    { view: 'assessment', label: copy.tabs.assess(assess.length) },
    { view: 'training', label: copy.tabs.train(train.length) },
    { view: 'demand', label: copy.tabs.demand },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={copy.tabs.label} className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <ToggleButton
            key={tab.view}
            isSelected={view === tab.view}
            onChange={() => onView(tab.view)}
            className="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3.5 text-13 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:border-hover-border data-selected:border-navy data-selected:bg-navy data-selected:text-white"
          >
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

/** The chosen center: where it is, what it was listed for, and how to get there or get in touch. */
export function CenterCard({
  center,
  codes,
  canRoute,
  config,
  onBack,
  onRoute,
}: {
  center: Center
  codes: ReadonlySet<string>
  canRoute: boolean
  config: ClientConfig | undefined
  onBack: () => void
  onRoute: () => void
}) {
  const en = useCopy()
  const copy = en.explore.card
  const trip = useTripLine()
  const listings = [...center.programs, ...center.schedules]
  const listedFor = [
    ...new Map(
      listings
        .filter((listing) => !codes.size || codes.has(listing.qualification.code))
        .map((listing) => [listing.qualification.code, listing.qualification]),
    ).values(),
  ]
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

  return (
    <article className="flex flex-col gap-3">
      <Button className={button({ variant: 'tertiary', height: 36, snug: true })} onPress={onBack}>
        <Icon name="arrowLeft" />
        {copy.back}
      </Button>
      <div>
        <p
          className={cx(
            'm-0 text-12 font-bold tracking-[0.06em] uppercase',
            center.kind === 'training' ? 'text-legend-provider' : 'text-legend-assessment',
          )}
        >
          {center.kind === 'training' ? copy.training : copy.assessment}
        </p>
        <h2 className="mt-1 mb-0 text-18 leading-[1.3] font-bold wrap-anywhere text-navy">
          {center.name}
        </h2>
        <p className="mt-1 mb-0 text-14 text-muted">{trip(center)}</p>
      </div>
      {listedFor.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-13 font-semibold text-ink">{copy.listedFor}</p>
          <div className="flex flex-wrap gap-1.5">
            {listedFor.map((qualification) => (
              <span key={qualification.code} className={cx(tag, 'bg-chip text-navy')}>
                {qualification.name}
              </span>
            ))}
            {center.kind === 'assessment' ? (
              <span className={cx(tag, 'bg-tint text-blue')}>{copy.leadsToNc}</span>
            ) : (
              scholarship && (
                <span className={cx(tag, 'bg-good-bg text-good-ink')}>
                  <Icon name="star" />
                  {en.explore.results.scholarship}
                </span>
              )
            )}
          </div>
        </div>
      )}
      {center.address && (
        <p className="m-0 text-13 leading-[1.5] text-ink">
          <span className="font-semibold">{copy.address}: </span>
          {center.address}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {point &&
          (canRoute && config?.routing_enabled ? (
            <Button
              className={button({ variant: 'primary', height: 38, snug: true })}
              onPress={onRoute}
            >
              <Icon name="directions" />
              {copy.route}
            </Button>
          ) : (
            <a
              className={button({ variant: 'primary', height: 38, snug: true })}
              href={googleMapsDirections(point)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="directions" />
              {copy.directions}
            </a>
          ))}
        {center.phone && (
          <a
            className={button({ variant: 'secondary', height: 38, snug: true })}
            href={`tel:${center.phone}`}
          >
            <Icon name="phone" />
            {copy.call}
          </a>
        )}
        {center.email && (
          <a
            className={button({ variant: 'secondary', height: 38, snug: true })}
            href={`mailto:${center.email}`}
          >
            <Icon name="mail" />
            {copy.email}
          </a>
        )}
        {center.website && (
          <a
            className={button({ variant: 'secondary', height: 38, snug: true })}
            href={center.website}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" />
            {copy.website}
          </a>
        )}
      </div>
      <Link className="text-14 font-semibold text-blue" to={details}>
        {copy.details}
      </Link>
      {center.distanceKm !== null && <p className={note}>{en.explore.notes.times}</p>}
    </article>
  )
}
