import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import './journey-banner.css'

const TILES: readonly { icon: IconName; tile: string; tileIcon: string }[] = [
  { icon: 'target', tile: 'bg-tile', tileIcon: 'bg-tile-icon text-blue' },
  { icon: 'compass', tile: 'bg-tile-violet', tileIcon: 'bg-tile-icon-violet text-violet' },
  { icon: 'bars', tile: 'bg-tile-green', tileIcon: 'bg-tile-icon-green text-teal' },
]

/**
 * The reference-inspired illustrated header. Copy stays in HTML for translation and accessibility;
 * the decorative artwork has no baked-in text or controls. Its layout follows the available content width.
 *
 * Compact, on Your pathway, it's the page's name alone, so the recommendation starts near the top of the screen.
 */
export function JourneyBanner({ compact = false }: { compact?: boolean }) {
  const en = useCopy()
  const copy = en.finder.banner

  if (compact) {
    return (
      <PageHeading className="m-0 text-[length:clamp(1.5rem,1.25rem_+_0.8vw,1.85rem)] leading-[1.2] font-[750] tracking-[-0.03em] text-navy">
        {en.pages.finderGoal.heading}
      </PageHeading>
    )
  }
  return (
    <section className="journey-banner">
      <img
        className="journey-banner__art"
        src={`${import.meta.env.BASE_URL}img/pathway-header.webp`}
        width={2172}
        height={724}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <div className="journey-banner__intro">
        <PageHeading className="sr-only">{en.pages.finderGoal.heading}</PageHeading>
        <p className="journey-banner__eyebrow">{copy.eyebrow}</p>
        <p className="journey-banner__title">
          {copy.title}
          <br />
          <span>{copy.accent}</span>
        </p>
        <p className="journey-banner__lead">{en.pages.finderGoal.lead}</p>
      </div>
      <ul className="journey-banner__tiles">
        {copy.tiles.map((tile, i) => (
          <li key={tile.title} className={cx('journey-banner__tile', TILES[i].tile)}>
            <span className={cx('journey-banner__icon', TILES[i].tileIcon)}>
              <Icon name={TILES[i].icon} size={25} />
            </span>
            <span>
              <strong className="journey-banner__tile-title">{tile.title}</strong>
              <span className="journey-banner__tile-text">{tile.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
