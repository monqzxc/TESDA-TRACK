import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
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

/** Each part of a training program's ranking score (in en.home.near.weights): its weight, and its color. */
const WEIGHTS = [
  { weight: 50, color: '#6fe0d2' },
  { weight: 20, color: '#7ea6ff' },
  { weight: 15, color: '#f5b83d' },
  { weight: 10, color: '#ab98f5' },
  { weight: 5, color: '#f08aa0' },
] as const satisfies OnePerEntry<typeof copy.weights, { weight: number; color: string }>

const EXTRAS = [
  <Icon key="pin" name="pin" />,
  <Glyph key="plane" name="plane" />,
  <Glyph key="calendar" name="calendar" />,
] satisfies OnePerEntry<typeof copy.extras, unknown>

/** "Near you": a navy band with the map of regions, how training programs are ranked, and the way to them. */
export function NearYou() {
  return (
    <section id="near" aria-labelledby="near-title" className={cx(shared.band, shared.section)}>
      <div className={cx(shared.wrap, styles.grid)}>
        <Archipelago />
        <div>
          <Reveal className={shared.sectionHead}>
            <div className={shared.eyebrow}>{copy.eyebrow}</div>
            <h2 id="near-title">{copy.heading}</h2>
            <p>{copy.lead}</p>
          </Reveal>
          <Reveal order={1} className={styles.weights}>
            <h3>{copy.weightsHeading}</h3>
            <div className={styles.weightBar} aria-hidden="true">
              {WEIGHTS.map(({ weight, color }, i) => (
                <i key={color} style={cssVars({ '--w': weight, '--i': i, '--c': color })} />
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
          <Reveal as="ul" order={2} className={styles.extras}>
            {copy.extras.map((extra, i) => (
              <li key={extra}>
                {EXTRAS[i]}
                {extra}
              </li>
            ))}
          </Reveal>
          <Reveal order={3} className={shared.sectionCta}>
            <Link to={paths.training} className={cx(shared.btn, shared.outline)}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
