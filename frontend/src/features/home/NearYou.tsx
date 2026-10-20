import { Link } from 'react-router'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'
import { Archipelago } from './Archipelago.tsx'
import type { OnePerEntry } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { Reveal } from './Reveal.tsx'
import { cssVars, cx } from '../../lib/style.ts'
import shared from './shared.module.css'
import styles from './NearYou.module.css'

const copy = en.home.near

/**
 * Each part of a training program's ranking score (in en.home.near.weights): its weight, and its color. One hue,
 * fading into the band as the weight drops, since the parts are ranked.
 */
const WEIGHTS = [
  { weight: 50, color: '#6fe0d2' },
  { weight: 20, color: 'color-mix(in srgb, #6fe0d2 80%, var(--band))' },
  { weight: 15, color: 'color-mix(in srgb, #6fe0d2 65%, var(--band))' },
  { weight: 10, color: 'color-mix(in srgb, #6fe0d2 52%, var(--band))' },
  { weight: 5, color: 'color-mix(in srgb, #6fe0d2 42%, var(--band))' },
] as const satisfies OnePerEntry<typeof copy.weights, { weight: number; color: string }>

/**
 * "Near you": a navy band with its title across the top, then the map beside how training programs are ranked,
 * and the way to them.
 */
export function NearYou() {
  return (
    <section id="near" aria-labelledby="near-title" className={cx(shared.band, shared.section)}>
      <div className={cx(shared.wrap, styles.grid)}>
        <Reveal className={cx(shared.sectionHead, styles.head)}>
          <h2 id="near-title">{copy.heading}</h2>
          <p>{copy.lead}</p>
        </Reveal>
        <Archipelago />
        <div className={styles.text}>
          <Reveal order={1} className={styles.weights}>
            <h3>{copy.weightsHeading}</h3>
            <div className={styles.weightBar} aria-hidden="true">
              {WEIGHTS.map(({ weight, color }, i) => (
                <i key={weight} style={cssVars({ '--w': weight, '--i': i, '--c': color })} />
              ))}
            </div>
            <ul className={styles.weightList}>
              {copy.weights.map((part, i) => (
                <li key={part.title} style={cssVars({ '--c': WEIGHTS[i].color })}>
                  <b>{WEIGHTS[i].weight}</b>
                  <span>
                    <strong>{part.title}</strong> {part.text}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal as="p" order={2} className={styles.extras}>
            {copy.extras}
          </Reveal>
          <Reveal order={3} className={shared.sectionCta}>
            <Link to={paths.training} className={cx(shared.btn, shared.ghost)}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
