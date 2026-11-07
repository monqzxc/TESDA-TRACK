import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { placeLabel, summary, type Center } from './centers.ts'
import { KIND_DOTS, googleMapsDirections } from './CenterDetail.tsx'
import type { CenterMapProps } from './CenterMapTypes.ts'
import { kilometres } from './format.ts'

/** A Google Maps link to a center's location, as the popup's Copy link gives it. */
export function locationLink(center: Pick<Center, 'latitude' | 'longitude'>): string {
  return `https://www.google.com/maps/search/?api=1&query=${center.latitude},${center.longitude}`
}

/**
 * A pin's popup, the same in both renderers: the center, how far it is, how to reach it, and its buttons. Text is
 * rendered as text. Each renderer's popup frame takes away its paragraphs' margins (center-map.css), so those set here
 * need !.
 */
export function CenterPopup({
  center,
  canRoute,
  saved,
  today,
  onDetails,
  onRoute,
  onToggleSaved,
  onCopied,
}: Pick<
  CenterMapProps,
  'canRoute' | 'saved' | 'today' | 'onDetails' | 'onRoute' | 'onToggleSaved'
> & { center: Center; onCopied: (status: string) => void }) {
  const en = useCopy()
  const copy = en.training.map

  const point = { latitude: center.latitude as number, longitude: center.longitude as number }
  const isSaved = saved.includes(center.id)
  const copyLink = () => {
    const url = locationLink(point)
    // The clipboard needs a secure page; elsewhere the link is shown instead.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        () => onCopied(copy.copied),
        () => onCopied(copy.copyFailed(url)),
      )
    } else {
      onCopied(copy.copyFailed(url))
    }
  }
  const contact = 'inline-flex items-center gap-1.5 no-underline'
  const iconButton = (active = false) =>
    cx(
      'box-border grid h-10.5 flex-[0_0_42px] cursor-pointer place-items-center rounded-10 border text-blue hovered:bg-soft',
      active ? 'border-hover-border bg-tint [&_svg_path]:fill-current' : 'border-border bg-surface',
    )
  return (
    <div className="grid grid-cols-1 gap-y-3 text-13 text-muted">
      <div className="min-w-0 pr-[18px]">
        <p className="text-15 leading-[1.3] font-bold wrap-anywhere text-navy">{center.name}</p>
        <p className="mt-1! text-13 text-ink">{placeLabel(center)}</p>
        {/* The type with its pin's colour, and how far it is. */}
        <p className="mt-2! flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className="inline-flex items-center gap-1.5 font-semibold text-ink"
            data-kind={center.kind}
          >
            <i
              className={cx('size-2 flex-none rounded-full', KIND_DOTS[center.kind])}
              aria-hidden="true"
            />
            {en.training.kinds[center.kind]}
          </span>
          {center.distanceKm !== null && (
            <span className="tabular-nums">
              {en.training.center.away(kilometres(center.distanceKm))}
            </span>
          )}
        </p>
      </div>
      <p className="col-span-full">{center.address || summary(center, today)}</p>
      {(center.phone || center.email) && (
        // Its links are blue, as every link on the map is (center-map.css).
        <p className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
      <div className="col-span-full flex items-center gap-2.5 pt-0.5">
        <button
          type="button"
          className="inline-flex h-10.5 flex-[1_1_auto] cursor-pointer items-center justify-center gap-2 rounded-10 border-0 bg-fill px-4 text-14 font-[650] text-white hovered:bg-fill-hover"
          onClick={() => onDetails(center.id)}
        >
          {en.training.results.viewDetails}
          <Icon name="arrowRight" />
        </button>
        {canRoute ? (
          <button
            type="button"
            className={iconButton()}
            aria-label={en.training.center.directions}
            title={en.training.center.directions}
            onClick={() => onRoute(center.id)}
          >
            <Icon name="directions" size={18} />
          </button>
        ) : (
          <a
            className={iconButton()}
            href={googleMapsDirections(point)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={en.training.center.googleMapsHelp}
            title={en.training.center.googleMapsHelp}
          >
            <Icon name="directions" size={18} />
          </a>
        )}
        <button
          type="button"
          className={iconButton(isSaved)}
          aria-label={en.training.center.save}
          aria-pressed={isSaved}
          title={isSaved ? en.training.center.saved : en.training.center.save}
          onClick={() => onToggleSaved(center.id)}
        >
          <Icon name="bookmark" size={18} />
        </button>
        <button
          type="button"
          className={iconButton()}
          aria-label={copy.copy}
          title={copy.copy}
          onClick={copyLink}
        >
          <Icon name="link" size={18} />
        </button>
      </div>
    </div>
  )
}
