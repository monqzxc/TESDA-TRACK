import { useAuth } from '../../auth/useAuth.ts'
import { Catalog } from './Catalog.tsx'
import { ClosingGoal } from './ClosingGoal.tsx'
import { Hero } from './Hero.tsx'
import { useRevealMotion } from './hooks/useReducedMotion.ts'
import { useSectionJumps } from './hooks/useSectionJumps.ts'
import { NearYou } from './NearYou.tsx'
import { ProgressPreview } from './ProgressPreview.tsx'
import { Track } from './Track.tsx'

/**
 * Home, at /: the landing page (classic/landing.html, .css and .js), between its own top bar and footer
 * (HomeHeader and HomeFooter, in HomeLayout). It makes no API calls, so it shows while the service is down.
 * data-motion turns on the scroll reveal (see Reveal.tsx); without it, as with reduced motion, everything shows at
 * once. home-tokens brings Home's colors and page-wide defaults (styles/home.css).
 */
export default function HomePage() {
  // Guest-only, there's no account to keep progress in, so no section about one.
  const { offersAccounts } = useAuth()
  const motion = useRevealMotion()
  const { ref, laidOut } = useSectionJumps<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className="home-tokens overflow-x-clip bg-home-page font-text text-home-base leading-[1.6] font-normal text-home-body"
      data-motion={motion || undefined}
      data-laid-out={laidOut || undefined}
    >
      <Hero />
      <Track />
      <NearYou />
      <Catalog />
      {offersAccounts && <ProgressPreview />}
      <ClosingGoal />
    </div>
  )
}
