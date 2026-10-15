import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { JourneyScene } from './art.tsx'
import styles from './JourneyBanner.module.css'

const copy = en.finder.banner

const TILES: readonly { icon: IconName; tint: string | undefined }[] = [
  { icon: 'target', tint: undefined },
  { icon: 'compass', tint: styles.violet },
  { icon: 'bars', tint: styles.green },
]

/**
 * The banner above every step (frontend/presentation.py journey): the page's name as its h1, a two-tone headline,
 * a scene, and three cards for what the finder does.
 */
export function JourneyBanner() {
  return (
    <section className={styles.banner}>
      <JourneyScene className={styles.scene} />
      <div className={styles.copy}>
        <PageHeading className={styles.eyebrow}>{en.pages.finderGoal.heading}</PageHeading>
        <p className={styles.title}>
          {copy.title}
          <br />
          <span>{copy.accent}</span>
        </p>
        <p className={styles.lead}>{en.pages.finderGoal.lead}</p>
      </div>
      <ul className={styles.tiles}>
        {copy.tiles.map((tile, i) => (
          <li key={tile.title} className={cx(styles.tile, TILES[i].tint)}>
            <span className={styles.tileIcon}>
              <Icon name={TILES[i].icon} size={26} />
            </span>
            <span>
              <strong>{tile.title}</strong>
              <span className={styles.tileText}>{tile.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
