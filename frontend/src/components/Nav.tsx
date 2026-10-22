import { NavLink } from 'react-router'
import { useCopy } from '../i18n/copy.ts'
import { LanguageSelector } from '../i18n/LanguageSelector.tsx'
import { AccountControl } from '../features/account/AccountMenu.tsx'
import { cx } from '../lib/style.ts'
import { paths } from '../paths.ts'
import { ThemeSwitch } from '../theme/ThemeSwitch.tsx'
import { Icon, type IconName } from './Icon.tsx'

type NavItem = { to: string; label: string; icon: IconName }

// The sidebar's pages, in order. The brand above these links returns to Home.

export type NavProps = {
  /** Adds Reports, which only administrators see. */
  isAdmin?: boolean
  /** Adds the management workspace, which only full administrators see. */
  canManage?: boolean
  /** Called when a link is chosen, e.g. to close the phone menu. */
  onNavigate?: () => void
}

// After classic/styles.css: .st-key-primary_navigation and .st-key-sidebar_account, full-width rows with the icon
// before the label; the open page is filled blue.
const link =
  'flex min-h-[54px] items-center gap-4 rounded-12 border px-[1.2rem] py-2 text-16 leading-[1.3] font-medium no-underline [&_svg]:shrink-0'
const openLink =
  'border-fill bg-fill text-white shadow-[0_10px_20px_-12px_var(--track-fill)] hovered:bg-fill-hover hovered:text-white'
const otherLink =
  'border-border bg-surface text-navy hovered:border-hover-border hovered:bg-soft hovered:text-navy'

/** The page links. The current page is marked with aria-current="page" (NavLink's own), and drawn filled. */
export function Nav({ isAdmin = false, canManage = false, onNavigate }: NavProps) {
  const en = useCopy()
  const PAGES: readonly NavItem[] = [
    { to: paths.finder, label: en.nav.finder, icon: 'route' },
    { to: paths.qualifications, label: en.nav.qualifications, icon: 'book' },
    { to: paths.training, label: en.nav.training, icon: 'clipboard' },
    { to: paths.progress, label: en.nav.progress, icon: 'bars' },
    { to: paths.skills, label: en.nav.skills, icon: 'compass' },
  ]
  const REPORTS: NavItem = { to: paths.reports, label: en.nav.reports, icon: 'growth' }
  const ADMIN: NavItem = { to: paths.admin, label: en.nav.admin, icon: 'network' }

  const items = [...PAGES, ...(isAdmin ? [REPORTS] : []), ...(canManage ? [ADMIN] : [])]
  return (
    <nav aria-label={en.nav.label} data-tour="navigation">
      <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
        {items.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => cx(link, isActive ? openLink : otherLink)}
              onClick={onNavigate}
            >
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

/**
 * The sidebar under the brand: page links, display preferences and the account control. Account settings live in
 * the profile popover, while legal information lives in each page's footer.
 */
export function SidebarContent({
  isAdmin = false,
  canManage = false,
  onNavigate,
  returnFocus,
}: SidebarContentProps) {
  const en = useCopy()

  return (
    <div className="flex flex-1 flex-col gap-[0.6rem]">
      <Nav isAdmin={isAdmin} canManage={canManage} onNavigate={onNavigate} />
      {/* In the phone menu, Sign in closes the menu first: the dialog opens over the page, not over the menu. */}
      <div className="mt-auto shrink-0 pt-4">
        <div className="mb-4">
          <p className="mb-1 text-14 font-semibold text-navy">{en.theme.label}</p>
          <ThemeSwitch compact />
        </div>
        <div className="mb-4">
          <LanguageSelector />
        </div>
        <AccountControl
          variant="sidebar"
          onOpenSignIn={onNavigate}
          onNavigate={onNavigate}
          returnFocus={returnFocus}
        />
      </div>
    </div>
  )
}
