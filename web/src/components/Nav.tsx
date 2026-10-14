import { NavLink } from 'react-router'
import { en } from '../copy/en.ts'
import { paths } from '../paths.ts'
import { ThemeSwitch } from '../theme/ThemeSwitch.tsx'
import { Icon, type IconName } from './Icon.tsx'
import styles from './Nav.module.css'

type NavItem = { to: string; label: string; icon: IconName }

// The Streamlit sidebar's pages (NAVIGATION in frontend/app.py), in its order, with icons for its Material ones.
const PAGES: readonly NavItem[] = [
  { to: paths.home, label: en.nav.home, icon: 'home' },
  { to: paths.finder, label: en.nav.finder, icon: 'route' },
  { to: paths.qualifications, label: en.nav.qualifications, icon: 'book' },
  { to: paths.training, label: en.nav.training, icon: 'clipboard' },
  { to: paths.progress, label: en.nav.progress, icon: 'bars' },
  { to: paths.skills, label: en.nav.skills, icon: 'compass' },
]
const REPORTS: NavItem = { to: paths.reports, label: en.nav.reports, icon: 'growth' }

export type NavProps = {
  /** Adds Reports, which only administrators see. */
  isAdmin?: boolean
  /** Called when a link is chosen, e.g. to close the phone menu. */
  onNavigate?: () => void
}

/** The page links. The current page is marked with aria-current="page" (NavLink's own), and drawn filled. */
export function Nav({ isAdmin = false, onNavigate }: NavProps) {
  const items = isAdmin ? [...PAGES, REPORTS] : PAGES
  return (
    <nav aria-label={en.nav.label}>
      <ul className={styles.list}>
        {items.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink to={to} className={styles.link} onClick={onNavigate}>
              <Icon name={icon} size="1.45rem" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The sidebar under the brand: the page links, the sign-in link and the theme switch. */
export function SidebarContent({ isAdmin = false, onNavigate }: NavProps) {
  return (
    <div className={styles.sidebar}>
      <Nav isAdmin={isAdmin} onNavigate={onNavigate} />
      <NavLink to={paths.signIn} className={styles.link} onClick={onNavigate}>
        <Icon name="person" size="1.45rem" />
        {en.nav.signIn}
      </NavLink>
      <div className={styles.theme}>
        <ThemeSwitch />
      </div>
    </div>
  )
}
