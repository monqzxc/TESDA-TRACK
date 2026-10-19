import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { AccountControl } from '../features/account/AccountMenu.tsx'
import { paths } from '../paths.ts'
import { ThemeSwitch } from '../theme/ThemeSwitch.tsx'
import { logoSrc } from './Brand.tsx'
import styles from './HomeHeader.module.css'
import { useHomeBar } from './useHomeBar.ts'

const copy = en.landing
const [first, second] = en.brand.wordmark

// The landing page's sections (classic/landing.html): links to Home's sections, by their ids. They're router links,
// so each jump is a history entry of the router's own, and Back returns to where the page was before it. (A plain
// link to #how would make an entry the router can't tell from the page's first load, and the browser scrolls before
// the router hears of it, so the router would save the section's position as the page's.)
const SECTIONS = [
  { hash: '#how', label: copy.how },
  { hash: '#near', label: copy.near },
  { hash: '#catalog', label: copy.catalog },
  { hash: '#progress', label: copy.progress },
] as const

/**
 * Home's own top bar, from the landing page: the brand, its section links, Sign in, Find my path and the theme.
 * It's see-through over Home's hero and turns solid once the page scrolls (useHomeBar).
 */
export function HomeHeader() {
  const { ref, scrolled } = useHomeBar<HTMLElement>()
  return (
    <header ref={ref} className={styles.topbar} data-scrolled={scrolled || undefined}>
      <div className={styles.wrap}>
        <Link to={paths.home} className={styles.brand} aria-label={en.brand.homeLink}>
          <img src={logoSrc} alt="" width={36} height={36} />
          <span className={styles.brandName} aria-hidden="true">
            {first}
            <b>{second}</b>
          </span>
        </Link>
        <nav className={styles.nav} aria-label={copy.sections}>
          {SECTIONS.map(({ hash, label }) => (
            <Link key={hash} to={{ pathname: paths.home, hash }}>
              {label}
            </Link>
          ))}
        </nav>
        <AccountControl variant="header" buttonClassName={styles.account} />
        <Link to={paths.finder} className={styles.cta}>
          {copy.findMyPath}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </Link>
        <div className={styles.theme}>
          <ThemeSwitch />
        </div>
      </div>
    </header>
  )
}
