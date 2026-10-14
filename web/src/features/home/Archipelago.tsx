import { en } from '../../copy/en.ts'
import { MAP_LABELS, MAP_LEARNER_REGION, REGIONS } from './data.ts'
import { Reveal } from './Reveal.tsx'
import { cssVars } from './style.ts'
import styles from './NearYou.module.css'

const copy = en.home.near

// A dot for each region's center, placed by latitude and longitude on a 320 by 420 drawing, over a faint grid,
// with an example learner (in Cebu City) linked to the centers near them. After landing.js.
const WIDTH = 320
const HEIGHT = 420
const LONGITUDE = [119.4, 127.6] as const
const LATITUDE = [5.6, 19.2] as const

const x = (longitude: number) =>
  20 + ((longitude - LONGITUDE[0]) / (LONGITUDE[1] - LONGITUDE[0])) * (WIDTH - 40)
const y = (latitude: number) =>
  20 + ((LATITUDE[1] - latitude) / (LATITUDE[1] - LATITUDE[0])) * (HEIGHT - 40)

const DOTS = REGIONS.map(([code, city, latitude, longitude], i) => ({
  code,
  city,
  latitude,
  longitude,
  x: x(longitude),
  y: y(latitude),
  learner: code === MAP_LEARNER_REGION,
  // Each dot's ring pulses at its own time.
  delay: (i * 0.37) % 3,
}))

/** Curved links from the learner to every regional center within about two degrees of them. */
function linksFrom(learner: (typeof DOTS)[number] | undefined) {
  if (!learner) return []
  return DOTS.filter(
    (dot) =>
      !dot.learner &&
      Math.hypot(dot.latitude - learner.latitude, dot.longitude - learner.longitude) < 2.1,
  ).map((dot) => {
    const bendX = (learner.x + dot.x) / 2 + 14
    const bendY = (learner.y + dot.y) / 2 - 14
    return { code: dot.code, d: `M${learner.x} ${learner.y} Q${bendX} ${bendY} ${dot.x} ${dot.y}` }
  })
}

const LINKS = linksFrom(DOTS.find((dot) => dot.learner))

const RIGHT: readonly string[] = MAP_LABELS.right
const LEFT: readonly string[] = MAP_LABELS.left

/** The map in "Near you": one picture, described by its label. */
export function Archipelago() {
  return (
    <Reveal from="zoom" className={styles.archipelago}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={copy.mapLabel(REGIONS.length)}>
        <defs>
          {/* Grid dots every 18 units, the first at (14, 14). */}
          <pattern
            id="home-map-grid"
            x="5"
            y="5"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle className={styles.gridDot} cx="9" cy="9" r="1.2" />
          </pattern>
        </defs>
        <rect width={WIDTH - 8} height={HEIGHT} fill="url(#home-map-grid)" />
        {LINKS.map((link) => (
          <path key={link.code} className={styles.link} d={link.d} />
        ))}
        {DOTS.map((dot) => (
          <g key={dot.code}>
            <circle
              className={styles.pulse}
              cx={dot.x}
              cy={dot.y}
              r="5"
              style={cssVars({ '--d': dot.delay })}
            />
            <circle
              className={dot.learner ? styles.learner : styles.region}
              cx={dot.x}
              cy={dot.y}
              r={dot.learner ? 7 : 4.5}
            />
            {dot.learner ? (
              <text className={styles.learnerLabel} x={dot.x + 12} y={dot.y + 4}>
                {copy.you} · {dot.city}
              </text>
            ) : RIGHT.includes(dot.city) ? (
              <text x={dot.x + 10} y={dot.y + 4}>
                {dot.city}
              </text>
            ) : LEFT.includes(dot.city) ? (
              <text x={dot.x - 10} y={dot.y + 4} textAnchor="end">
                {dot.city}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className={styles.caption}>{copy.mapCaption}</p>
    </Reveal>
  )
}
