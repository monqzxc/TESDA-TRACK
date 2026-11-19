import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { writeTrainingAddress } from '../training/address.ts'
import { googleMapsDirections, KIND_DOTS } from '../training/CenterDetail.tsx'
import {
  savedCentersQuery,
  useRemoveSavedCenter,
  type SavedCenter,
} from '../training/savedCenters.ts'

const savedDay = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })

/** Training & Assessment opened on the center, with every distance so a far one still shows. */
function centerAddress(saved: SavedCenter): string {
  const query = writeTrainingAddress({
    kinds: [saved.kind],
    radius: 'any',
    center: saved.center_id,
  })
  return `${paths.training}?${query.toString()}`
}

/** The centers the learner bookmarked on a map, newest first, each with a way back to it and directions. */
export function SavedCenters() {
  const en = useCopy()
  const copy = en.progress.centers
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const list = useQuery(savedCentersQuery)
  const remove = useRemoveSavedCenter()
  const [removed, setRemoved] = useState(false)
  const centers = list.data ?? []

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="m-0 scroll-mt-24 text-20 leading-[1.3] text-navy focus:outline-none"
          >
            {copy.heading}
          </h2>
          <p className="mt-1 mb-0 text-15 text-muted">
            {list.data && (
              <>
                <span className="font-semibold text-navy tabular-nums">
                  {copy.saved(centers.length)}
                </span>
                <span aria-hidden="true"> · </span>
              </>
            )}
            {copy.lead}
          </p>
        </div>
        <Link to={paths.explore} className={button()}>
          <Icon name="map" />
          {copy.find}
        </Link>
      </div>
      <div aria-live="polite">
        {removed && <p className="mb-3 text-14 text-good-ink">{copy.removed}</p>}
      </div>
      {list.isPending ? (
        <p role="status" className="m-0 text-15 text-muted">
          {en.progress.loading}
        </p>
      ) : list.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-16 border border-border bg-surface px-5 py-4">
          <p className="m-0 text-15 text-ink">{copy.loadFailed}</p>
          <Button className={button({ variant: 'tertiary' })} onPress={() => void list.refetch()}>
            <Icon name="refresh" />
            {copy.retry}
          </Button>
        </div>
      ) : centers.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-16 border border-dashed border-dash bg-empty px-6 py-5">
          <h3 className="m-0 text-18 text-navy">{copy.emptyHeading}</h3>
          <p className="m-0 max-w-[60ch] text-15 leading-relaxed text-muted">{copy.empty}</p>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 items-stretch gap-4 p-0 max-lg:grid-cols-1">
          {centers.map((saved) => (
            <li key={saved.center_id} className="flex min-w-0">
              <SavedCenterCard
                saved={saved}
                removing={remove.isPending && remove.variables === saved.center_id}
                failed={remove.isError && remove.variables === saved.center_id}
                onRemove={() => {
                  setRemoved(false)
                  remove.mutate(saved.center_id, {
                    onSuccess: () => {
                      setRemoved(true)
                      // The card and its button are gone: focus goes back to the section.
                      heading.current?.focus()
                    },
                  })
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SavedCenterCard({
  saved,
  removing,
  failed,
  onRemove,
}: {
  saved: SavedCenter
  removing: boolean
  failed: boolean
  onRemove: () => void
}) {
  const en = useCopy()
  const copy = en.progress.centers
  const headingId = useId()
  const place = [saved.city, saved.province].filter(Boolean).join(', ') || saved.region_code
  const point =
    saved.latitude !== null && saved.longitude !== null
      ? { latitude: saved.latitude, longitude: saved.longitude }
      : null

  return (
    <article
      aria-labelledby={headingId}
      className="flex w-full min-w-0 flex-col gap-3 rounded-16 border border-border bg-surface p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 inline-flex items-center gap-1.5 text-13 font-semibold text-ink">
          <i
            className={cx('size-2 flex-none rounded-full', KIND_DOTS[saved.kind])}
            aria-hidden="true"
          />
          {en.training.kinds[saved.kind]}
        </p>
        <h3 id={headingId} className="m-0 text-17 leading-[1.35] wrap-anywhere text-navy">
          {saved.name}
        </h3>
        <p className="m-0 text-14 text-ink">{place}</p>
        {saved.address && (
          <p className="m-0 text-13 leading-[1.5] wrap-anywhere text-muted">{saved.address}</p>
        )}
        {saved.contact_phone && (
          <a
            className="inline-flex items-center gap-[0.3rem] self-start text-13 text-blue"
            href={`tel:${saved.contact_phone.replace(/[^+\d]/g, '')}`}
          >
            <Icon name="phone" />
            {saved.contact_phone}
          </a>
        )}
      </div>

      {saved.qualification && (
        <p className="m-0 inline-flex items-start gap-1.5 self-start rounded-10 bg-chip px-2.5 py-1.5 text-13 leading-[1.45] text-ink [&_svg]:mt-[0.15rem] [&_svg]:flex-none [&_svg]:text-blue">
          <Icon name="bookmark" />
          {copy.savedFor(saved.qualification.name)}
        </p>
      )}
      {!saved.is_active && (
        <p className="m-0 rounded-10 bg-warn-bg px-3 py-[0.55rem] text-13 font-semibold text-warn-ink">
          {copy.notListed}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {saved.is_active && (
          <Link to={centerAddress(saved)} className={button({ variant: 'primary', text: 14 })}>
            <Icon name="map" />
            {copy.viewOnMap}
          </Link>
        )}
        {point && (
          <a
            className={button({ text: 14 })}
            href={googleMapsDirections(point)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="directions" />
            {copy.directions}
          </a>
        )}
        <Button
          className={cx(button({ variant: 'tertiary', text: 14 }), 'ml-auto')}
          aria-label={copy.removeLabel(saved.name)}
          isPending={removing}
          onPress={onRemove}
        >
          {removing ? copy.removing : copy.remove}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="m-0 text-14 text-warn-ink">
          {copy.removeFailed}
        </p>
      )}
      <p className="m-0 border-t border-rule pt-2 text-12 text-muted">
        {copy.savedOn(savedDay.format(new Date(saved.saved_at)))}
      </p>
    </article>
  )
}
