import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { en } from '../../copy/en.ts'
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

const copy = en.home.hero

/**
 * One line of the h1, which rises into place when the hero first shows (with motion: data-motion on Home's root).
 * The last line leaves room under it for the underline.
 */
function Line({ order, isIn, children }: { order: number; isIn: boolean; children: ReactNode }) {
  return (
    <span className="block overflow-hidden pb-[0.08em] last:mb-[-0.2em] last:pb-[0.28em]">
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
 * The navy band at the top, under Home's see-through top bar (after classic/landing.css): the h1, the ways in, and
 * the console's example. It starts under the bar (--home-bar-height, set by the bar), and carries data-home-hero,
 * which tells the bar there's a hero to see through to.
 */
export function Hero() {
  const { ref, isIn } = useReveal<HTMLElement>()
  const [first, second, last] = copy.title
  return (
    <section
      ref={ref}
      data-in={isIn || undefined}
      data-home-hero=""
      className={cx(
        'relative isolate mt-[calc(-1*var(--home-bar-height,68px))] overflow-hidden pt-[var(--home-bar-height,68px)] text-home-band-ink',
        'bg-[radial-gradient(120%_90%_at_85%_10%,var(--home-band-2)_0%,var(--home-band)_58%)]',
        "after:absolute after:inset-x-0 after:bottom-0 after:-z-1 after:h-[140px] after:bg-[linear-gradient(transparent,var(--home-band))] after:content-['']",
      )}
      aria-labelledby="hero-title"
    >
      <div
        className={cx(
          'absolute inset-y-0 right-0 left-auto -z-2 w-[min(58%,760px)]',
          '[mask-image:linear-gradient(90deg,transparent_0%,#000000_45%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0%,#000000_45%)]',
          'max-xl:w-full max-xl:[mask-image:linear-gradient(180deg,#000000_0%,transparent_70%)] max-xl:[-webkit-mask-image:linear-gradient(180deg,#000000_0%,transparent_70%)]',
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
            className="size-full object-cover object-[60%_40%] opacity-55 contrast-105 saturate-110 max-xl:opacity-28"
          />
        </picture>
      </div>
      <svg
        className="pointer-events-none absolute top-[6%] left-[-6%] -z-1 w-[70%] max-w-[900px] opacity-7"
        viewBox="0 0 600 400"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M40 360h170a80 80 0 0 0 0-160h-40a80 80 0 0 1 0-160h390"
          stroke="#fff"
          strokeWidth={44}
          strokeLinecap="round"
        />
      </svg>
      <div
        className={cx(
          ui.wrap,
          'grid grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] items-center gap-[clamp(2rem,5vw,4.5rem)] pt-[clamp(3rem,7vw,6.5rem)] pb-[clamp(4rem,8vw,7rem)] max-xl:grid-cols-1',
        )}
      >
        <div>
          <div
            className={cx(
              ui.eyebrowType,
              "inline-flex items-center gap-[0.6rem] text-home-band-accent before:size-[9px] before:rounded-full before:bg-[#f5b83d] before:shadow-[0_0_0_4px_rgb(245_184_61/0.25)] before:content-['']",
            )}
          >
            {copy.eyebrow}
          </div>
          {/* Focus comes here after a navigation to Home (lib/navigation.ts). It isn't something to press, so it
              shows no ring. The spaces read the lines as one sentence: "Every career has a track. Find yours." */}
          <h1
            id="hero-title"
            tabIndex={-1}
            className="mt-[1.1rem] text-home-3xl leading-[0.98] font-extrabold tracking-[-0.03em] text-white [font-variation-settings:'opsz'_96] focus:outline-none"
          >
            <Line order={0} isIn={isIn}>
              {first}
            </Line>{' '}
            <Line order={1} isIn={isIn}>
              {second}
            </Line>{' '}
            <Line order={2} isIn={isIn}>
              <em className="relative text-home-band-accent not-italic">
                {last}
                {/* The underline draws itself after the lines are in. */}
                <svg
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                  className="absolute bottom-[-0.12em] left-0 h-[0.32em] w-full overflow-visible"
                >
                  <path
                    pathLength={1}
                    d="M2 7c20-5 50-6 96-2"
                    strokeLinecap="round"
                    className={cx(
                      'fill-none stroke-[#f5b83d] stroke-6',
                      'in-data-motion:transition-[stroke-dashoffset] in-data-motion:delay-1000 in-data-motion:duration-900 in-data-motion:ease-home in-data-motion:[stroke-dasharray:1]',
                      isIn
                        ? 'in-data-motion:[stroke-dashoffset:0]'
                        : 'in-data-motion:[stroke-dashoffset:1]',
                    )}
                  />
                </svg>
              </em>
            </Line>
          </h1>
          <Reveal
            as="p"
            order={3}
            className="mt-[1.4rem] max-w-[34rem] text-home-lg leading-[1.55] text-home-band-body"
          >
            {copy.lead}
          </Reveal>
          <Reveal order={4} className="mt-8 flex flex-wrap gap-3">
            <Link to={paths.finder} className={homeButton('signal')}>
              {copy.findMyPath}
              <Glyph name="arrow" />
            </Link>
            <Link to={paths.qualifications} className={homeButton('ghost')}>
              {copy.browse(CATALOG.qualifications)}
            </Link>
          </Reveal>
          <Reveal
            as="ul"
            order={5}
            className="mt-[1.6rem] flex list-none flex-wrap gap-x-[1.4rem] gap-y-2 p-0 text-[0.92rem] text-home-band-body [&_svg]:size-4.5 [&_svg]:text-home-band-accent"
          >
            {copy.notes(REGIONS.length).map((note) => (
              <li key={note} className="inline-flex items-center gap-[0.45rem]">
                <Glyph name="tick" />
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
