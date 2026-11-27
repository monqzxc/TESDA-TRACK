import { useSectionJumps } from './hooks/useSectionJumps.ts'
import { LandingHero } from './landing/LandingHero.tsx'
import { About, Closing, HowItWorks, Perks } from './landing/LandingSections.tsx'
import { useScrollReveals } from './landing/motion.ts'

/**
 * Home, at /: the location-first landing page (2026 redesign, Figma "TESDA-Track Revamp"), between its own top bar
 * and footer (HomeHeader and HomeFooter, in HomeLayout). Every way in opens the Career Map. It makes no API calls,
 * so it shows while the service is down. The landing class brings its greys, navy and green (styles/home.css).
 */
export default function HomePage() {
  const { ref, laidOut } = useSectionJumps<HTMLDivElement>()
  useScrollReveals(ref)
  return (
    <div
      ref={ref}
      className="landing landing-page overflow-x-clip bg-(--l-page) font-text text-16 leading-[1.6] text-(--l-body)"
      data-laid-out={laidOut || undefined}
    >
      <LandingHero />
      <About />
      <HowItWorks />
      <Perks />
      <Closing />
    </div>
  )
}
