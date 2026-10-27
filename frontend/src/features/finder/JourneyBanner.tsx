import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { eyebrowHeading } from '../../components/PageHero.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { JourneyScene } from './art.tsx'

const TILES: readonly { icon: IconName; tile: string; tileIcon: string }[] = [
  { icon: 'target', tile: 'bg-tile', tileIcon: 'bg-tile-icon text-blue' },
  { icon: 'compass', tile: 'bg-tile-violet', tileIcon: 'bg-tile-icon-violet text-violet' },
  { icon: 'bars', tile: 'bg-tile-green', tileIcon: 'bg-tile-icon-green text-teal' },
]

/**
 * The banner above every step (classic/presentation.py journey, classic/styles.css's .journey-hero): the page's name
 * as its h1, a two-tone headline, a scene on the right, and three cards over its lower part for what the finder
 * does. The banner is a size container, so its layout follows its own width, not the window's: narrower banners
 * move the cards under the heading and keep the scene to the top right, and narrower still drop the scene. Phones
 * keep the banner to its headline; the cards keep their titles.
 */
export function JourneyBanner() {
  const en = useCopy()
  const copy = en.finder.banner

  return (
    <section className="@container relative min-h-64 overflow-hidden rounded-22 border border-banner-border bg-(image:--track-banner) px-[2.1rem] pt-[1.9rem] pb-6 max-xs:min-h-0 max-xs:rounded-16 max-xs:px-[1.2rem] max-xs:py-[1.3rem]">
      <JourneyScene className="pointer-events-none absolute top-0 right-0 bottom-0 left-[32%] h-full w-[68%] @max-[1101px]:bottom-auto @max-[1101px]:left-[46%] @max-[1101px]:h-[230px] @max-[1101px]:w-[54%] @max-[681px]:hidden" />
      <div className="relative z-1 w-[33%] min-w-[300px] @max-[1101px]:w-[52%] @max-[681px]:w-auto @max-[681px]:min-w-0">
        <PageHeading className={eyebrowHeading}>{en.pages.finderGoal.heading}</PageHeading>
        <p className="mt-2 mb-3 font-display text-[length:clamp(1.9rem,2.65cqi,2.6rem)] leading-[1.08] font-[750] tracking-[-0.045em] text-navy max-xs:text-[1.65rem]">
          {copy.title}
          <br />
          <span className="text-blue">{copy.accent}</span>
        </p>
        <p className="m-0 max-w-[460px] text-16 leading-[1.6] text-muted max-xs:hidden">
          {en.pages.finderGoal.lead}
        </p>
      </div>
      <ul className="absolute right-[9%] bottom-6 left-[calc(33%_+_1.25rem)] z-1 m-0 grid list-none grid-cols-3 gap-3 p-0 @max-[1101px]:static @max-[1101px]:mt-[1.4rem] @max-[681px]:mt-[1.1rem] @max-[681px]:grid-cols-1 @max-[681px]:gap-2">
        {copy.tiles.map((tile, i) => (
          <li
            key={tile.title}
            className={cx(
              'flex min-w-0 items-start gap-[0.8rem] rounded-16 border border-tile-border px-[1.05rem] py-4 shadow-[0_12px_28px_-20px_rgb(var(--track-shadow-rgb)/0.5)] backdrop-blur-[8px] @max-[681px]:items-center @max-[681px]:px-[0.8rem] @max-[681px]:py-[0.65rem]',
              TILES[i].tile,
            )}
          >
            <span
              className={cx(
                'grid size-11.5 shrink-0 place-items-center rounded-13 @max-[681px]:size-9.5 @max-[681px]:rounded-[11px]',
                TILES[i].tileIcon,
              )}
            >
              <Icon name={TILES[i].icon} size={26} />
            </span>
            <span>
              <strong className="block text-15 leading-[1.3] font-bold text-navy">
                {tile.title}
              </strong>
              <span className="mt-[0.2rem] block text-13 leading-[1.45] text-ink max-xs:hidden">
                {tile.text}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
