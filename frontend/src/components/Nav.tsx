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
  /** My Progress contains account records, so it is only linked for a signed-in learner. */
  isSignedIn?: boolean
  /** Adds Reports, which only administrators see. */
  isAdmin?: boolean
  /** Adds the management workspace, which only full administrators see. */
  canManage?: boolean
  /** Called when a link is chosen, e.g. to close the phone menu. */
  onNavigate?: () => void
}

// Plain rows with a grey icon before the label, on the sidebar's own white. The open page sits on a neutral pill with
// its label in ink; colour stays on the pages' data. Rows are 40px, and 44px in the phone menu, for a thumb.
const navRow =
  'flex min-h-10 items-center gap-3 rounded-8 px-3 py-2 text-15 leading-[1.3] no-underline max-md:min-h-11 [&_svg]:shrink-0'
const openLink = 'bg-chip font-semibold text-navy [&_svg]:text-navy'
const otherLink = 'font-medium text-ink [&_svg]:text-muted hovered:bg-panel hovered:text-navy'

/** The page links. The current page is marked with aria-current="page" (NavLink's own), and drawn on a grey pill. */
export function Nav({ isSignedIn = true, isAdmin = false, canManage = false, onNavigate }: NavProps) {
  const en = useCopy()
  const PAGES: readonly NavItem[] = [
    { to: paths.explore, label: en.nav.explore, icon: 'map' },
    { to: paths.finder, label: en.nav.finder, icon: 'route' },
    { to: paths.qualifications, label: en.nav.qualifications, icon: 'book' },
    { to: paths.training, label: en.nav.training, icon: 'clipboard' },
    ...(isSignedIn ? [{ to: paths.progress, label: en.nav.progress, icon: 'bars' as const }] : []),
    { to: paths.skills, label: en.nav.skills, icon: 'compass' },
  ]
  const REPORTS: NavItem = { to: paths.reports, label: en.nav.reports, icon: 'growth' }
  const ADMIN: NavItem = { to: paths.admin, label: en.nav.admin, icon: 'network' }

  const items = [...PAGES, ...(isAdmin ? [REPORTS] : []), ...(canManage ? [ADMIN] : [])]
  return (
    <nav aria-label={en.nav.label} data-tour="navigation">
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {items.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => cx(navRow, isActive ? openLink : otherLink)}
              onClick={onNavigate}
            >
              <Icon name={icon} size="1.125rem" />
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
  isSignedIn = true,
  canManage = false,
  onNavigate,
  returnFocus,
}: SidebarContentProps) {
  return (
    <div className="flex flex-1 flex-col">
      <Nav isAdmin={isAdmin} isSignedIn={isSignedIn} canManage={canManage} onNavigate={onNavigate} />
      {/* In the phone menu, Sign in closes the menu first: the dialog opens over the page, not over the menu. */}
      <div className="mt-auto flex shrink-0 flex-col gap-4 pt-6">
        <ThemeSwitch compact />
        <LanguageSelector />
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
