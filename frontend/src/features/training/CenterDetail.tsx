import { useQuery } from '@tanstack/react-query'
import { useId, type Ref } from 'react'
import { Button, Radio, RadioGroup, ToggleButton } from 'react-aria-components'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import centerPhoto from '../../components/img/center-thumb.jpg'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { directionsQuery, type TravelMode, type TravelRoute } from './api.ts'
import { placeLabel, type Center, type Point } from './centers.ts'
import { airportLabel, kilometres, travelTime } from './format.ts'
import { Programs, Schedules, type Fits } from './Listings.tsx'
import { useTrainingStore } from './state.ts'

const copy = en.training

export const MODE_ICONS: Record<TravelMode, IconName> = {
  car: 'car',
  bike: 'bike',
  foot: 'walk',
  plane: 'plane',
}

// The featured center, after classic/training_view.py _detail's card.
const muted = 'm-0 text-13 leading-[1.5] text-muted'
const contact = 'inline-flex items-center gap-[0.3rem] wrap-anywhere text-blue'
const badge =
  'inline-flex items-center gap-[0.3rem] rounded-full px-[0.55rem] py-[0.15rem] text-12 font-[650]'
const routeLine =
  'm-0 flex items-start gap-[0.4rem] text-15 font-[650] text-navy [&_svg]:mt-[0.2rem] [&_svg]:flex-none'
/** A travel mode in the segmented bar of routes. */
const modeOption =
  'inline-flex min-w-18 flex-[1_1_0] cursor-pointer flex-col items-center gap-[0.1rem] rounded-10 border border-border bg-surface px-[0.4rem] py-[0.45rem] text-13 font-[650] text-navy data-hovered:bg-soft data-selected:border-fill data-selected:bg-fill data-selected:text-white data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

/** A Google Maps link to directions to a point, for when this page can't draw the route. */
export function googleMapsDirections(point: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`
}

interface CenterDetailProps {
  center: Center
  isNearest: boolean
  /** The learner's location, when routes can be drawn from it on this page. */
  routeFrom: Point | null
  /** The map is on the page, so View on map has somewhere to go. */
  hasMap: boolean
  onViewOnMap: () => void
  fits: Fits
  today: string
  /** The center's name, which takes focus when a center is chosen from the list. */
  headingRef?: Ref<HTMLHeadingElement>
}

/**
 * The selected center, or the first result until one is selected (classic/training_view.py _detail): where it is,
 * how to reach it and contact it, and its programs or assessments. Every part works without the map (US-08). Its
 * name is a heading that takes focus when a center is chosen from the list.
 */
export function CenterDetail({
  center,
  isNearest,
  routeFrom,
  hasMap,
  onViewOnMap,
  fits,
  today,
  headingRef,
}: CenterDetailProps) {
  const headingId = useId()
  const saved = useTrainingStore((state) => state.saved.includes(center.id))
  const toggleSaved = useTrainingStore((state) => state.toggleSaved)
  const routeTo = useTrainingStore((state) => state.routeTo)
  const showRoute = useTrainingStore((state) => state.showRoute)
  const point =
    center.latitude !== null && center.longitude !== null
      ? { latitude: center.latitude, longitude: center.longitude }
      : null
  const showingRoute = routeFrom !== null && point !== null && routeTo === center.id
  const website =
    center.website?.startsWith('https://') || center.website?.startsWith('http://')
      ? center.website
      : null

  return (
    <>
      <article
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-16 border border-border bg-surface p-4"
      >
        {isNearest && (
          <span className="inline-flex items-center gap-[0.35rem] self-start rounded-full bg-tint px-[0.65rem] py-[0.2rem] text-13 font-[650] text-blue">
            <Icon name="directions" />
            {copy.center.nearest}
          </span>
        )}
        <div className="flex gap-[0.9rem]">
          <img className="size-23 flex-none rounded-12 object-cover" src={centerPhoto} alt="" />
          <div className="flex min-w-0 flex-col gap-[0.3rem]">
            <h3
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="m-0 scroll-mt-4 text-[1.15rem] wrap-anywhere text-navy focus:outline-none"
            >
              {center.name}
            </h3>
            <p className="m-0 flex items-center gap-[0.3rem] text-14 text-ink">
              <Icon name="pin" />
              {placeLabel(center)}
            </p>
            <KindBadges center={center} saved={saved} />
            <DataProvenance value={center.provenance} />
            {center.address && <p className={muted}>{center.address}</p>}
            {(center.phone || center.email) && (
              <p className="m-0 flex flex-wrap gap-x-[0.9rem] gap-y-1 text-13">
                {center.phone && (
                  <a className={contact} href={`tel:${center.phone.replace(/[^+\d]/g, '')}`}>
                    <Icon name="phone" />
                    {center.phone}
                  </a>
                )}
                {center.email && (
                  <a className={contact} href={`mailto:${center.email}`}>
                    <Icon name="mail" />
                    {center.email}
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 [&>*]:min-h-10">
          {point ? (
            routeFrom ? (
              <Button
                className={button({ variant: 'primary' })}
                onPress={() => showRoute(showingRoute ? null : center.id)}
              >
                <Icon name={showingRoute ? 'close' : 'directions'} />
                {showingRoute ? copy.center.hideRoute : copy.center.directions}
              </Button>
            ) : (
              <a
                className={button({ variant: 'primary' })}
                href={googleMapsDirections(point)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="directions" />
                {copy.center.directions}
              </a>
            )
          ) : (
            // No coordinates: no distance and no directions, rather than made-up ones (US-08).
            <span className={muted}>{copy.center.noLocation}</span>
          )}
          {point && hasMap && (
            <Button className={button()} onPress={onViewOnMap}>
              <Icon name="map" />
              {copy.center.viewOnMap}
            </Button>
          )}
          {website && (
            <a className={button()} href={website} target="_blank" rel="noopener noreferrer">
              <Icon name="external" />
              {copy.center.website}
            </a>
          )}
          <ToggleButton
            className={({ isSelected }) => button({ on: isSelected })}
            isSelected={saved}
            onChange={() => toggleSaved(center.id)}
            aria-label={copy.center.save}
          >
            <Icon name="bookmark" />
          </ToggleButton>
        </div>

        {showingRoute && routeFrom && point && <RoutePanel from={routeFrom} to={point} />}
        {routeFrom && point && (
          <a
            className={cx(button({ variant: 'tertiary', text: 14 }), '-ml-2 self-start')}
            href={googleMapsDirections(point)}
            target="_blank"
            rel="noopener noreferrer"
            title={copy.center.googleMapsHelp}
          >
            <Icon name="external" />
            {copy.center.googleMaps}
          </a>
        )}
      </article>
      {center.kind === 'training' ? (
        <Programs center={center} fits={fits} today={today} />
      ) : (
        <Schedules center={center} />
      )}
    </>
  )
}

/** The center's type, how far it is, and whether the learner saved it. */
export function KindBadges({ center, saved }: { center: Center; saved: boolean }) {
  return (
    <p className="m-0 flex flex-wrap gap-[0.3rem]">
      <span
        className={cx(
          badge,
          center.kind === 'assessment' ? 'bg-good-bg text-good-ink' : 'bg-tint text-blue',
        )}
      >
        <Icon name={center.kind === 'training' ? 'learn' : 'clipboard'} />
        {copy.kinds[center.kind]}
      </span>
      {center.distanceKm !== null && (
        <span className={cx(badge, 'bg-chip text-ink')}>
          <Icon name="distance" />
          {copy.center.away(kilometres(center.distanceKm))}
        </span>
      )}
      {saved && (
        <span className={cx(badge, 'bg-tile-icon-violet text-violet')}>
          <Icon name="bookmark" />
          {copy.center.saved}
        </span>
      )}
    </p>
  )
}

/**
 * The routes from the learner's approximate location, one per travel mode, with the chosen one's distance and time.
 * The map draws the same routes (it reads the same request).
 */
function RoutePanel({ from, to }: { from: Point; to: Point }) {
  const directions = useQuery(directionsQuery(from, to))
  const travelMode = useTrainingStore((state) => state.travelMode)
  const setTravelMode = useTrainingStore((state) => state.setTravelMode)

  if (directions.isPending) {
    return (
      <p role="status" className={muted}>
        {copy.routes.finding}
      </p>
    )
  }
  const routes = directions.data?.routes ?? []
  if (!routes.length) {
    return (
      <div className="flex flex-col items-start gap-[0.4rem]">
        <p
          role="alert"
          className="m-0 rounded-10 bg-warn-bg px-3 py-[0.55rem] text-14 font-semibold text-warn-ink"
        >
          {directions.error?.message ?? copy.routes.unavailable}
        </p>
        <Button
          className={button({ variant: 'tertiary' })}
          onPress={() => void directions.refetch()}
        >
          <Icon name="refresh" />
          {copy.routes.retry}
        </Button>
      </div>
    )
  }
  const route: TravelRoute = routes.find((item) => item.mode === travelMode) ?? routes[0]
  const missing = directions.data?.missing_modes ?? []
  return (
    <div className="flex flex-col gap-2">
      <RadioGroup
        aria-label={copy.routes.label}
        orientation="horizontal"
        value={route.mode}
        onChange={(mode) => setTravelMode(mode as TravelMode)}
        className="flex flex-wrap gap-[0.35rem]"
      >
        {routes.map((option) => (
          <Radio key={option.mode} value={option.mode} className={modeOption}>
            <Icon name={MODE_ICONS[option.mode]} />
            <span>
              {option.mode === 'plane' ? '~' : ''}
              {travelTime(option.duration_min)}
            </span>
            <span className="text-11 font-medium opacity-85">{copy.routes.modes[option.mode]}</span>
          </Radio>
        ))}
      </RadioGroup>
      {route.mode === 'plane' ? (
        <>
          <p className={routeLine}>
            <Icon name="plane" />
            {copy.routes.flight(
              airportLabel(route.departure),
              airportLabel(route.arrival),
              travelTime(route.duration_min),
            )}
          </p>
          <p className={muted}>
            {copy.routes.flightNote(
              kilometres(route.distance_km),
              kilometres(route.to_departure_km),
              kilometres(route.from_arrival_km),
            )}
          </p>
        </>
      ) : (
        <>
          <p className={routeLine}>
            <Icon name="route" />
            {copy.routes.road(
              kilometres(route.distance_km),
              travelTime(route.duration_min),
              copy.routes.modes[route.mode],
            )}
          </p>
          <p className={muted}>{copy.routes.fromYou}</p>
        </>
      )}
      {missing.length > 0 && (
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted">
          {copy.routes.missing(missing.map((mode) => copy.routes.modeNames[mode]))}
          <Button
            className={button({ variant: 'tertiary' })}
            onPress={() => void directions.refetch()}
          >
            <Icon name="refresh" />
            {copy.routes.retry}
          </Button>
        </p>
      )}
    </div>
  )
}
