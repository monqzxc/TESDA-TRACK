import { Icon } from '../../../components/Icon.tsx'
import { useCopy } from '../../../i18n/copy.ts'
import { LandingInfo } from './LandingInfo.tsx'

// Where the sample centers sit on the drawing (viewBox 0 0 520 440). Grey, as every center is until it is chosen.
const PINS = [
  [96, 92],
  [188, 64],
  [412, 70],
  [452, 168],
  [74, 236],
  [158, 300],
  [430, 288],
  [300, 120],
] as const
const YOU = [214, 222] as const
const BEST = [356, 196] as const

/** A center's teardrop pin, its tip at (x, y). */
function Pin({ x, y, selected = false }: { x: number; y: number; selected?: boolean }) {
  const size = selected ? 1.25 : 1
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <path
        d="M0 0c-1.6-6.4-10-10.6-10-18.6a10 10 0 0 1 20 0C10-10.6 1.6-6.4 0 0z"
        className={selected ? 'fill-(--l-navy)' : 'fill-(--l-surface) stroke-(--l-faint)'}
        strokeWidth={1.4}
      />
      <circle cy={-18.4} r={3.6} className={selected ? 'fill-(--l-surface)' : 'fill-(--l-faint)'} />
    </g>
  )
}

/**
 * The hero's picture: the Career Map in miniature, with sample centers. The learner's pin breathes, the route to the
 * best fit draws itself, and the best-fit card shows the three checks it passed. Green appears only on that card.
 */
export function MapPreview() {
  const copy = useCopy().landingPage.preview
  return (
    <figure className="relative m-0 w-full max-w-[34rem] justify-self-end max-lg:justify-self-center">
      <div className="relative overflow-hidden rounded-[28px] border border-(--l-line) bg-(--l-map) shadow-[0_40px_80px_-40px_rgb(15_20_30/0.45)]">
        <svg
          viewBox="0 0 520 440"
          role="img"
          aria-label={copy.label}
          className="block h-auto w-full"
        >
          {/* Terrain: soft contour rings, then the roads. */}
          <g fill="none" className="stroke-(--l-map-line)" strokeWidth={1}>
            {[38, 70, 104, 140].map((r) => (
              <ellipse key={r} cx={120} cy={120} rx={r * 1.25} ry={r} />
            ))}
            {[30, 58, 90, 126, 166].map((r) => (
              <ellipse key={r} cx={430} cy={360} rx={r * 1.3} ry={r} />
            ))}
          </g>
          <g fill="none" className="stroke-(--l-surface)" strokeLinecap="round">
            <path d="M-10 250 C 120 230, 180 200, 260 210 S 420 170, 540 150" strokeWidth={14} />
            <path d="M250 -10 C 250 120, 230 260, 290 450" strokeWidth={10} />
            <path d="M-10 380 C 140 360, 300 330, 540 360" strokeWidth={8} />
            <path d="M380 -10 C 360 110, 380 220, 360 450" strokeWidth={6} />
          </g>
          {/* The range the learner chose, around their pin. */}
          <circle
            cx={YOU[0]}
            cy={YOU[1]}
            r={150}
            className="fill-(--l-navy)/[0.04] stroke-(--l-navy)/30"
            strokeDasharray="3 6"
          />
          {PINS.map(([x, y]) => (
            <Pin key={`${x}-${y}`} x={x} y={y} />
          ))}
          {/* The route to the best fit. */}
          <path
            d={`M${YOU[0]} ${YOU[1]} C 260 250, 300 236, ${BEST[0]} ${BEST[1] - 4}`}
            fill="none"
            className="landing-route-draw stroke-(--l-navy)"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <Pin x={BEST[0]} y={BEST[1]} selected />
          {/* The learner. */}
          <circle cx={YOU[0]} cy={YOU[1]} r={10} className="landing-pulse fill-(--l-navy)/35" />
          <circle
            cx={YOU[0]}
            cy={YOU[1]}
            r={8}
            className="fill-(--l-navy) stroke-(--l-surface)"
            strokeWidth={3}
          />
          <text
            x={YOU[0]}
            y={YOU[1] + 28}
            textAnchor="middle"
            className="fill-(--l-ink) font-text text-[13px] font-bold"
          >
            {copy.you}
          </text>
        </svg>
        <span className="absolute top-4 left-4 rounded-full bg-(--l-surface)/90 px-3 py-1 text-12 font-bold tracking-[0.08em] text-(--l-muted) uppercase backdrop-blur">
          {copy.sample}
        </span>
      </div>
      {/* The best-fit card, laid over the map's foot. */}
      <figcaption className="relative z-1 mx-4 -mt-24 rounded-[20px] border-2 border-(--l-green) bg-(--l-surface) p-4 shadow-[0_24px_48px_-20px_rgb(15_20_30/0.35)] sm:mx-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-12 font-semibold text-(--l-muted)">{copy.qualification}</p>
            <p className="mt-0.5 text-16 leading-[1.3] font-bold text-(--l-ink)">{copy.center}</p>
            <p className="mt-0.5 text-13 text-(--l-muted) tabular-nums">{copy.distance}</p>
          </div>
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-(--l-green-soft) px-3 py-1 text-13 font-bold whitespace-nowrap text-(--l-green)">
            <Icon name="star" size="0.95rem" />
            {copy.bestFit} · {copy.fitCount}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-(--l-line) pt-3">
          <ul className="flex list-none flex-col gap-1 p-0">
            {copy.checks.map((check) => (
              <li key={check} className="flex items-center gap-2 text-13 text-(--l-body)">
                <Icon name="tick" size="0.95rem" className="flex-none text-(--l-green)" />
                {check}
              </li>
            ))}
          </ul>
          <LandingInfo topic={copy.bestFit} text={copy.info} />
        </div>
      </figcaption>
    </figure>
  )
}
