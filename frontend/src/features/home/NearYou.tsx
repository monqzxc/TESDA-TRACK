import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { Archipelago } from './Archipelago.tsx'
import type { OnePerEntry } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { Reveal, useRevealed } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

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

/** How training programs are ranked, as one bar whose parts grow in turn once it's in view. */
function WeightBar() {
  const shown = useRevealed()
  return (
    <div className="mt-4 flex h-[18px] gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
      {WEIGHTS.map(({ weight, color }, i) => (
        <i
          key={color}
          className={cx(
            'flex-[var(--w)_1_0] origin-left bg-(--c)',
            'in-data-motion:transition-[scale] in-data-motion:delay-[calc(var(--i,0)*90ms_+_200ms)] in-data-motion:duration-1000 in-data-motion:ease-home',
            !shown && 'in-data-motion:scale-x-0',
          )}
          style={cssVars({ '--w': weight, '--i': i, '--c': color })}
        />
      ))}
    </div>
  )
}

/**
 * "Near you" (after classic/landing.css): a navy band with the map of regions, how training programs are ranked,
 * and the way to them. On narrow screens the map goes under the text.
 */
export function NearYou() {
  return (
    <section id="near" aria-labelledby="near-title" className={cx(ui.band, ui.section)}>
      <div
        className={cx(
          ui.wrap,
          'grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-center gap-[clamp(2rem,6vw,5rem)] max-lg:grid-cols-1',
        )}
      >
        <Archipelago />
        <div>
          <Reveal className={ui.sectionHead}>
            <div className={ui.eyebrowOnBand}>{copy.eyebrow}</div>
            <h2 id="near-title" className={ui.sectionTitle}>
              {copy.heading}
            </h2>
            <p className={ui.sectionLead}>{copy.lead}</p>
          </Reveal>
          <Reveal order={1} className="mt-8">
            <h3 className="text-home-lg font-bold">{copy.weightsHeading}</h3>
            <WeightBar />
            <ul className="mt-[1.1rem] grid list-none gap-[0.55rem] p-0">
              {copy.weights.map((part, i) => (
                <li
                  key={part.title}
                  className="grid grid-cols-[14px_2.6rem_minmax(0,1fr)] items-baseline gap-3 before:size-3 before:translate-y-px before:rounded-[4px] before:bg-(--c) before:content-['']"
                  style={cssVars({ '--c': WEIGHTS[i].color })}
                >
                  <b className="font-display text-[1.05rem] leading-none font-extrabold text-white tabular-nums">
                    {WEIGHTS[i].weight}
                  </b>
                  <span className="text-[0.95rem]">
                    <strong className="font-semibold text-white">{part.title}</strong> {part.text}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
          {/* Directions, flights and schedules. */}
          <Reveal
            as="ul"
            order={2}
            className="mt-[1.6rem] flex list-none flex-wrap gap-[0.6rem] p-0 [&_svg]:size-4 [&_svg]:stroke-2 [&_svg]:text-home-band-accent"
          >
            {copy.extras.map((extra, i) => (
              <li
                key={extra}
                className="inline-flex items-center gap-[0.45rem] rounded-full bg-[rgb(255_255_255/0.08)] px-[0.8rem] py-[0.45rem] text-[0.85rem] font-semibold text-white"
              >
                {EXTRAS[i]}
                {extra}
              </li>
            ))}
          </Reveal>
          <Reveal order={3} className={ui.sectionCta}>
            <Link to={paths.training} className={homeButton('outlineOnBand')}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
