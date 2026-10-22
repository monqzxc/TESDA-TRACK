import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { CATALOG, REGIONS } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { GoalConsole } from './GoalConsole.tsx'
import { useReveal } from './hooks/useReveal.ts'
import welding from './img/welding.jpg'
import weldingSmall from './img/welding-600.jpg'
import { Reveal } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

/** One line of the h1, which rises into place when the hero first shows (with motion: data-motion on Home's root). */
function Line({ order, isIn, children }: { order: number; isIn: boolean; children: ReactNode }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <span
        className={cx(
          'inline-block in-data-motion:transition-[translate] in-data-motion:delay-[calc(var(--i)*120ms_+_100ms)] in-data-motion:duration-1000 in-data-motion:ease-home',
          !isIn && 'in-data-motion:translate-y-[105%]',
        )}
        style={cssVars({ '--i': order })}
      >
        {children}
      </span>
    </span>
  )
}

/**
 * The navy band at the top, under Home's see-through top bar (after classic/landing.css): the h1 across the width,
 * then the ways in beside the console's example. A flat navy field with the welder on the right; the title runs
 * over the photo's dark edge. It starts under the bar (--home-bar-height, set by the bar), and carries
 * data-home-hero, which tells the bar there's a hero to see through to.
 */
export function Hero() {
  const en = useCopy()
  const copy = en.home.hero

  const { ref, isIn } = useReveal<HTMLElement>()
  const [first, second, last] = copy.title
  return (
    <section
      ref={ref}
      data-in={isIn || undefined}
      data-home-hero=""
      className="relative isolate mt-[calc(-1*var(--home-bar-height,68px))] overflow-hidden bg-home-band pt-[var(--home-bar-height,68px)] text-home-band-ink"
      aria-labelledby="hero-title"
    >
      {/* The photo fades into the navy on its left (on phones, at its foot): a scrim, so the title and the lead stay
          legible over it. taste-skill-ignore: photo scrim */}
      <div
        className={cx(
          'absolute inset-y-0 right-0 left-auto -z-1 w-[min(60%,820px)]',
          '[mask-image:linear-gradient(90deg,transparent_0%,#000000_50%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0%,#000000_50%)]',
          'max-xl:w-full max-xl:[mask-image:linear-gradient(180deg,#000000_0%,transparent_75%)] max-xl:[-webkit-mask-image:linear-gradient(180deg,#000000_0%,transparent_75%)]',
        )}
        aria-hidden="true"
      >
        {/* On phones the photo is a faint backdrop, so a smaller copy does. */}
        <picture className="block h-full">
          <source media="(max-width: 900px)" srcSet={weldingSmall} width={600} height={600} />
          <img
            src={welding}
            alt=""
            width={1100}
            height={1100}
            fetchPriority="high"
            decoding="async"
            className="size-full object-cover object-[60%_40%] opacity-60 max-xl:opacity-32"
          />
        </picture>
      </div>
      <div
        className={cx(
          ui.wrap,
          'grid grid-cols-[minmax(0,1fr)_minmax(0,29rem)] items-start gap-x-[clamp(2rem,6vw,6rem)] gap-y-[clamp(2.25rem,4vw,3rem)] pt-[clamp(2.5rem,6vw,5rem)] pb-[clamp(4.5rem,8vw,7rem)] max-xl:grid-cols-1',
        )}
      >
        {/* Focus comes here after a navigation to Home (lib/navigation.ts). It isn't something to press, so it shows
            no ring. Two lines on wide screens, the first breaking between its halves on narrow ones; the spaces read
            them as one sentence: "Every career has a track. Find yours." */}
        <h1
          id="hero-title"
          tabIndex={-1}
          className="col-span-full text-home-3xl leading-[0.95] font-extrabold tracking-[-0.035em] text-white [font-variation-settings:'opsz'_96] focus:outline-none"
        >
          <Line order={0} isIn={isIn}>
            <span className="whitespace-nowrap">{first}</span>{' '}
            <span className="whitespace-nowrap">{second}</span>
          </Line>{' '}
          <Line order={1} isIn={isIn}>
            {last}
          </Line>
        </h1>
        <div className="min-w-0">
          <Reveal
            as="p"
            order={2}
            className="max-w-[33rem] text-home-lg leading-[1.5] text-home-band-body"
          >
            {copy.lead}
          </Reveal>
          <Reveal order={3} className="mt-9 flex flex-wrap gap-3">
            <Link to={paths.finder} className={homeButton('signal')}>
              {copy.findMyPath}
              <Glyph name="arrow" />
            </Link>
            <Link to={paths.qualifications} className={homeButton('ghost')}>
              {copy.browse(CATALOG.qualifications)}
            </Link>
          </Reveal>
          {/* Three short notes, read as one line of sentences. */}
          <Reveal
            as="ul"
            order={4}
            className="mt-6 flex list-none flex-wrap gap-x-[0.4rem] gap-y-1 p-0 text-home-xs text-home-band-body"
          >
            {copy.notes(REGIONS.length).map((note) => (
              <li key={note} className="after:content-['.']">
                {note}
              </li>
            ))}
          </Reveal>
        </div>
        <GoalConsole />
      </div>
    </section>
  )
}
