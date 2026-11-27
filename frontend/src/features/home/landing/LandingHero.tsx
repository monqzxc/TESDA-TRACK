import { Link } from 'react-router'
import { useCopy } from '../../../i18n/copy.ts'
import { paths } from '../../../paths.ts'
import { GoalSearch } from './GoalSearch.tsx'
import { MapPreview } from './MapPreview.tsx'
import { kicker, wrap } from './styles.ts'

/** The first screen: where you can go next, one box to start, and the map it opens in miniature. */
export function LandingHero() {
  const copy = useCopy().landingPage.hero
  const [first, second] = copy.title
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden pt-[clamp(2.5rem,6vw,5rem)] pb-[clamp(3.5rem,8vw,6.5rem)]"
    >
      {/* A faint dot grid, like map paper. Decoration only. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-1 [background-image:radial-gradient(var(--l-line)_1px,transparent_1px)] [mask-image:linear-gradient(180deg,#000_0%,transparent_85%)] [background-size:22px_22px]"
      />
      <div
        className={`${wrap} grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center gap-[clamp(2.5rem,6vw,5rem)] max-lg:grid-cols-1`}
      >
        <div className="flex min-w-0 flex-col items-start">
          <p className={kicker}>{copy.kicker}</p>
          {/* Focus lands here after a navigation to Home (lib/navigation.ts); it isn't something to press. */}
          <h1
            id="hero-title"
            tabIndex={-1}
            className="mt-4 text-[clamp(2.5rem,1.4rem+3.3vw,4.25rem)] leading-[0.96] font-extrabold tracking-[-0.045em] focus:outline-none"
          >
            {first} <span className="text-(--l-muted)">{second}</span>
          </h1>
          <p className="mt-6 max-w-[30rem] text-[clamp(1.05rem,1rem+0.3vw,1.25rem)] leading-[1.5] text-(--l-body)">
            {copy.lead}
          </p>
          <div className="mt-8 w-full">
            <GoalSearch id="landing-goal" />
          </div>
          <p className="mt-4 text-13 leading-[1.5] text-(--l-muted)">
            {copy.privacy}{' '}
            <Link
              to={paths.privacy}
              className="font-semibold text-(--l-ink) underline underline-offset-3"
            >
              {copy.privacyLink}
            </Link>
          </p>
        </div>
        <MapPreview />
      </div>
    </section>
  )
}
