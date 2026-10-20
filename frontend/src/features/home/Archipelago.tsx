import { en } from '../../copy/en.ts'
import { Reveal } from './Reveal.tsx'
import styles from './NearYou.module.css'

const copy = en.home.near

/** A small, self-contained SVG illustration; its ping animation also respects reduced motion. */
export function Archipelago() {
  return (
    <Reveal from="zoom" className={styles.archipelago}>
      <img
        src="/img/near-you-map.svg"
        width="600"
        height="640"
        loading="lazy"
        decoding="async"
        alt={copy.mapLabel}
      />
      <p className={styles.caption}>{copy.mapCaption}</p>
    </Reveal>
  )
}
