import { Catalog } from './Catalog.tsx'
import { ClosingGoal } from './ClosingGoal.tsx'
import { Hero } from './Hero.tsx'
import { useRevealMotion } from './hooks/useReducedMotion.ts'
import { useSectionJumps } from './hooks/useSectionJumps.ts'
import { NearYou } from './NearYou.tsx'
import { ProgressPreview } from './ProgressPreview.tsx'
import { cx } from '../../lib/style.ts'
import { Track } from './Track.tsx'
import tokens from './tokens.module.css'
import styles from './HomePage.module.css'

/**
 * Home, at /: the landing page (classic/landing.html, .css and .js), between its own top bar and footer
 * (HomeHeader and HomeFooter, in HomeLayout). It makes no API calls, so it shows while the service is down.
 * data-motion turns on the scroll reveal (see HomePage.module.css); without it, as with reduced motion, everything
 * shows at once.
 */
export default function HomePage() {
  const motion = useRevealMotion()
  const { ref, laidOut } = useSectionJumps<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={cx(tokens.tokens, styles.page)}
      data-motion={motion || undefined}
      data-laid-out={laidOut || undefined}
    >
      <Hero />
      <Track />
      <NearYou />
      <Catalog />
      <ProgressPreview />
      <ClosingGoal />
    </div>
  )
}
