import { useQuery } from '@tanstack/react-query'
import { useId, type Ref } from 'react'
import { Button, Radio, RadioGroup, ToggleButton } from 'react-aria-components'
import { Icon, type IconName } from '../../components/Icon.tsx'
import centerPhoto from '../../components/img/center-thumb.jpg'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import { directionsQuery, type TravelMode, type TravelRoute } from './api.ts'
import { placeLabel, type Center, type Point } from './centers.ts'
import { airportLabel, kilometres, travelTime } from './format.ts'
import { Programs, Schedules, type Fits } from './Listings.tsx'
import { useTrainingStore } from './state.ts'
import styles from './CenterDetail.module.css'

const copy = en.training

export const MODE_ICONS: Record<TravelMode, IconName> = {
  car: 'car',
  bike: 'bike',
  foot: 'walk',
  plane: 'plane',
}

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
 * The selected center, or the first result until one is selected (frontend/training_view.py _detail): where it is,
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
      <article aria-labelledby={headingId} className={styles.feature}>
        {isNearest && (
          <span className={styles.nearest}>
            <Icon name="directions" />
            {copy.center.nearest}
          </span>
        )}
        <div className={styles.top}>
          <img className={styles.photo} src={centerPhoto} alt="" />
          <div className={styles.about}>
            <h3 id={headingId} ref={headingRef} tabIndex={-1} className={styles.name}>
              {center.name}
            </h3>
            <p className={styles.place}>
              <Icon name="pin" />
              {placeLabel(center)}
            </p>
            <KindBadges center={center} saved={saved} />
            {center.address && <p className={styles.muted}>{center.address}</p>}
            {(center.phone || center.email) && (
              <p className={styles.contacts}>
                {center.phone && (
                  <a href={`tel:${center.phone.replace(/[^+\d]/g, '')}`}>
                    <Icon name="phone" />
                    {center.phone}
                  </a>
                )}
                {center.email && (
                  <a href={`mailto:${center.email}`}>
                    <Icon name="mail" />
                    {center.email}
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          {point ? (
            routeFrom ? (
              <Button
                className={cx(buttons.button, buttons.primary)}
                onPress={() => showRoute(showingRoute ? null : center.id)}
              >
                <Icon name={showingRoute ? 'close' : 'directions'} />
                {showingRoute ? copy.center.hideRoute : copy.center.directions}
              </Button>
            ) : (
              <a
                className={cx(buttons.button, buttons.primary)}
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
            <span className={styles.muted}>{copy.center.noLocation}</span>
          )}
          {point && hasMap && (
            <Button className={buttons.button} onPress={onViewOnMap}>
              <Icon name="map" />
              {copy.center.viewOnMap}
            </Button>
          )}
          {website && (
            <a className={buttons.button} href={website} target="_blank" rel="noopener noreferrer">
              <Icon name="external" />
              {copy.center.website}
            </a>
          )}
          <ToggleButton
            className={cx(buttons.button, styles.save)}
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
            className={cx(buttons.button, buttons.tertiary, styles.google)}
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
    <p className={styles.badges}>
      <span className={cx(styles.badge, center.kind === 'assessment' ? styles.green : styles.blue)}>
        <Icon name={center.kind === 'training' ? 'learn' : 'clipboard'} />
        {copy.kinds[center.kind]}
      </span>
      {center.distanceKm !== null && (
        <span className={cx(styles.badge, styles.grey)}>
          <Icon name="distance" />
          {copy.center.away(kilometres(center.distanceKm))}
        </span>
      )}
      {saved && (
        <span className={cx(styles.badge, styles.violet)}>
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
      <p role="status" className={styles.muted}>
        {copy.routes.finding}
      </p>
    )
  }
  const routes = directions.data?.routes ?? []
  if (!routes.length) {
    return (
      <div className={styles.routeFailed}>
        <p role="alert" className={styles.warning}>
          {directions.error?.message ?? copy.routes.unavailable}
        </p>
        <Button
          className={cx(buttons.button, buttons.tertiary)}
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
    <div className={styles.routes}>
      <RadioGroup
        aria-label={copy.routes.label}
        orientation="horizontal"
        value={route.mode}
        onChange={(mode) => setTravelMode(mode as TravelMode)}
        className={styles.modes}
      >
        {routes.map((option) => (
          <Radio key={option.mode} value={option.mode} className={styles.mode}>
            <Icon name={MODE_ICONS[option.mode]} />
            <span>
              {option.mode === 'plane' ? '~' : ''}
              {travelTime(option.duration_min)}
            </span>
            <span className={styles.modeName}>{copy.routes.modes[option.mode]}</span>
          </Radio>
        ))}
      </RadioGroup>
      {route.mode === 'plane' ? (
        <>
          <p className={styles.routeLine}>
            <Icon name="plane" />
            {copy.routes.flight(
              airportLabel(route.departure),
              airportLabel(route.arrival),
              travelTime(route.duration_min),
            )}
          </p>
          <p className={styles.muted}>
            {copy.routes.flightNote(
              kilometres(route.distance_km),
              kilometres(route.to_departure_km),
              kilometres(route.from_arrival_km),
            )}
          </p>
        </>
      ) : (
        <>
          <p className={styles.routeLine}>
            <Icon name="route" />
            {copy.routes.road(
              kilometres(route.distance_km),
              travelTime(route.duration_min),
              copy.routes.modes[route.mode],
            )}
          </p>
          <p className={styles.muted}>{copy.routes.fromYou}</p>
        </>
      )}
      {missing.length > 0 && (
        <p className={styles.missing}>
          {copy.routes.missing(missing.map((mode) => copy.routes.modeNames[mode]))}
          <Button
            className={cx(buttons.button, buttons.tertiary)}
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
