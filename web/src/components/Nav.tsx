import { NavLink } from 'react-router'
import { en } from '../copy/en.ts'
import { AccountControl } from '../features/account/AccountMenu.tsx'
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

type SidebarContentProps = NavProps & {
  /** Where focus goes after the sign-in dialog when this sidebar has closed by then (the phone menu's button). */
  returnFocus?: () => HTMLElement | null
}

/** The sidebar under the brand: the page links, the account control and the theme switch. */
export function SidebarContent({ isAdmin = false, onNavigate, returnFocus }: SidebarContentProps) {
  return (
    <div className={styles.sidebar}>
      <Nav isAdmin={isAdmin} onNavigate={onNavigate} />
      {/* In the phone menu, Sign in closes the menu first: the dialog opens over the page, not over the menu. */}
      <AccountControl variant="sidebar" onOpenSignIn={onNavigate} returnFocus={returnFocus} />
      <div className={styles.theme}>
        <ThemeSwitch />
      </div>
    </div>
  )
}
