import { en } from '../../copy/en.ts'
import { MAP_LABELS, MAP_LEARNER_REGION, REGIONS } from './data.ts'
import { Reveal, useRevealed } from './Reveal.tsx'
import { cssVars, cx } from '../../lib/style.ts'

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

const label = 'font-text text-[11px] leading-none'
const cityLabel = cx(label, 'fill-[rgb(255_255_255/0.82)] font-semibold')
const learnerLabel = cx(label, 'fill-[#f5b83d] font-bold')

/** The map in "Near you": one picture, described by its label. On narrow screens it goes under the text. */
export function Archipelago() {
  return (
    <Reveal
      from="zoom"
      className="relative w-full max-w-[440px] justify-self-center max-lg:order-2 max-lg:max-w-[340px]"
    >
      <RegionMap />
    </Reveal>
  )
}

/** The drawing and its caption. Each region's ring pulses once the map is in view. */
function RegionMap() {
  const shown = useRevealed()
  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={copy.mapLabel(REGIONS.length)}
        className="block h-auto w-full overflow-visible"
      >
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
            <circle className="fill-[rgb(255_255_255/0.08)]" cx="9" cy="9" r="1.2" />
          </pattern>
        </defs>
        <rect width={WIDTH - 8} height={HEIGHT} fill="url(#home-map-grid)" />
        {LINKS.map((link) => (
          <path
            key={link.code}
            className="fill-none stroke-[rgb(111_224_210/0.35)] stroke-[1.4] [stroke-dasharray:3_5]"
            d={link.d}
          />
        ))}
        {DOTS.map((dot) => (
          <g key={dot.code}>
            <circle
              className={cx(
                'origin-center fill-none stroke-[#6fe0d2] stroke-[1.5] opacity-0 [transform-box:fill-box]',
                shown &&
                  'animate-home-pulse [animation-delay:calc(var(--d)*1s)] motion-reduce:animate-none',
              )}
              cx={dot.x}
              cy={dot.y}
              r="5"
              style={cssVars({ '--d': dot.delay })}
            />
            <circle
              className={dot.learner ? 'fill-[#f5b83d]' : 'fill-[#6fe0d2]'}
              cx={dot.x}
              cy={dot.y}
              r={dot.learner ? 7 : 4.5}
            />
            {dot.learner ? (
              <text className={learnerLabel} x={dot.x + 12} y={dot.y + 4}>
                {copy.you} · {dot.city}
              </text>
            ) : RIGHT.includes(dot.city) ? (
              <text className={cityLabel} x={dot.x + 10} y={dot.y + 4}>
                {dot.city}
              </text>
            ) : LEFT.includes(dot.city) ? (
              <text className={cityLabel} x={dot.x - 10} y={dot.y + 4} textAnchor="end">
                {dot.city}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="mt-[0.6rem] text-center text-[0.78rem] text-[rgb(207_220_245/0.7)]">
        {copy.mapCaption}
      </p>
    </>
  )
}
