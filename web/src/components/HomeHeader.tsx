import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { paths } from '../paths.ts'
import { ThemeSwitch } from '../theme/ThemeSwitch.tsx'
import { logoSrc } from './Brand.tsx'
import styles from './HomeHeader.module.css'

const copy = en.landing
const [first, second] = en.brand.wordmark

// The landing page's sections (frontend/landing.html). Home's sections carry these ids from Task 9.
const SECTIONS = [
  { href: '#how', label: copy.how },
  { href: '#near', label: copy.near },
  { href: '#catalog', label: copy.catalog },
  { href: '#progress', label: copy.progress },
] as const

/** Home's own top bar, from the landing page: the brand, its section links, Sign in, Find my path and the theme. */
export function HomeHeader() {
  return (
    <header className={styles.topbar}>
      <div className={styles.wrap}>
        <Link to={paths.home} className={styles.brand} aria-label={en.brand.homeLink}>
          <img src={logoSrc} alt="" width={36} height={36} />
          <span className={styles.brandName} aria-hidden="true">
            {first}
            <b>{second}</b>
          </span>
        </Link>
        <nav className={styles.nav} aria-label={copy.sections}>
          {SECTIONS.map(({ href, label }) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <Link to={paths.signIn} className={styles.account}>
          {copy.signIn}
        </Link>
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
