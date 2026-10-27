import { Link } from 'react-router'
import type { en } from '../../copy/en.ts'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { Archipelago } from './Archipelago.tsx'
import type { OnePerEntry } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { Reveal, useRevealed } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

/**
 * Each part of a training program's ranking score (in en.home.near.weights): its weight, and its color. One hue,
 * fading into the band as the weight drops, since the parts are ranked.
 */
const WEIGHTS = [
  { weight: 50, color: '#6fe0d2' },
  { weight: 20, color: 'color-mix(in srgb, #6fe0d2 80%, var(--home-band))' },
  { weight: 15, color: 'color-mix(in srgb, #6fe0d2 65%, var(--home-band))' },
  { weight: 10, color: 'color-mix(in srgb, #6fe0d2 52%, var(--home-band))' },
  { weight: 5, color: 'color-mix(in srgb, #6fe0d2 42%, var(--home-band))' },
] as const satisfies OnePerEntry<typeof en.home.near.weights, { weight: number; color: string }>

/** How training programs are ranked, as one bar whose parts grow in turn once it's in view. */
function WeightBar() {
  const shown = useRevealed()
  return (
    <div className="mt-[1.1rem] flex h-5 gap-1 overflow-hidden rounded-full" aria-hidden="true">
      {WEIGHTS.map(({ weight, color }, i) => (
        <i
          key={weight}
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
 * "Near you" (after classic/landing.css): a navy band with its title across the top, then the map beside how
 * training programs are ranked, and the way to them. On narrow screens the map goes under the text.
 */
export function NearYou() {
  const en = useCopy()
  const copy = en.home.near

  return (
    <section id="near" aria-labelledby="near-title" className={cx(ui.band, ui.section)}>
      <div
        className={cx(
          ui.wrap,
          'grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-center gap-x-[clamp(2rem,6vw,5rem)] gap-y-[clamp(2.5rem,5vw,4rem)] max-lg:grid-cols-1',
        )}
      >
        <Reveal className={cx(ui.sectionHead, 'col-span-full')}>
          <h2 id="near-title" className={ui.sectionTitle}>
            {copy.heading}
          </h2>
          <p className={ui.sectionLead}>{copy.lead}</p>
        </Reveal>
        <Archipelago />
        <div className="min-w-0 max-lg:order-1">
          <Reveal order={1}>
            <h3 className="text-home-lg leading-[1.25] font-bold">{copy.weightsHeading}</h3>
            <WeightBar />
            <ul className="mt-5 grid list-none gap-[0.7rem] p-0">
              {copy.weights.map((part, i) => (
                <li
                  key={part.title}
                  className="grid grid-cols-[14px_2.4rem_minmax(0,1fr)] items-baseline gap-[0.8rem] before:size-3.5 before:translate-y-px before:rounded-full before:bg-(--c) before:content-['']"
                  style={cssVars({ '--c': WEIGHTS[i].color })}
                >
                  <b className="font-display text-home-lg leading-none font-extrabold text-white tabular-nums">
                    {WEIGHTS[i].weight}
                  </b>
                  <span>
                    <strong className="font-bold text-white">{part.title}</strong> {part.text}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
          {/* What each program also shows: directions, flights and schedules. */}
          <Reveal as="p" order={2} className="mt-7 max-w-[34rem] text-home-band-body">
            {copy.extras}
          </Reveal>
          <Reveal order={3} className={ui.sectionCta}>
            <Link to={paths.training} className={homeButton('ghost')}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
