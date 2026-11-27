import { Link } from 'react-router'
import { useCopy } from '../../../i18n/copy.ts'
import { paths } from '../../../paths.ts'
import { GetStartedButton } from './GetStartedButton.tsx'
import { HeroMatchPreview } from './HeroMatchPreview.tsx'
import { wrap } from './styles.ts'

export function LandingHero() {
  const copy = useCopy().landingPage.hero
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-[#123e80] pt-[clamp(3rem,6.667vw,6rem)] pb-[clamp(3rem,7.223vw,6.5rem)] text-white"
    >
      <div aria-hidden="true" className="landing-hero-map absolute inset-0 -z-1" />
      <div
        className={`${wrap} grid grid-cols-[minmax(0,1fr)_500px] items-center gap-16 max-lg:grid-cols-1 max-lg:gap-10`}
      >
        <div className="min-w-0">
          <h1
            id="hero-title"
            tabIndex={-1}
            className="m-0 max-w-[680px] text-[clamp(2.5rem,4.445vw,4rem)] leading-[1.12] font-medium tracking-[-0.035em] [text-wrap:wrap] text-white outline-none"
          >
            {copy.title.join(' ')}
          </h1>
          <p className="mt-8 max-w-[640px] text-18 leading-[1.6] text-white/90">{copy.lead}</p>
          <GetStartedButton tone="white" className="mt-8" />
          <p className="mt-8 text-14 text-white/85">
            {copy.guestNote}{' '}
            <Link
              to={paths.privacy}
              className="ml-2 inline-block text-12 text-white/80 underline underline-offset-3"
            >
              {copy.privacyLink}
            </Link>
          </p>
        </div>
        <HeroMatchPreview />
      </div>
    </section>
  )
}
