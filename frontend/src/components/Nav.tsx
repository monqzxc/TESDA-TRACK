import { useId, type CSSProperties, type Ref } from 'react'
import { Button } from 'react-aria-components'
import { Link, NavLink } from 'react-router'
import { learnerAccounts } from '../auth/accounts.ts'
import { useAuth } from '../auth/useAuth.ts'
import { useCopy } from '../i18n/copy.ts'
import { LanguageSelector } from '../i18n/LanguageSelector.tsx'
import { AccountControl } from '../features/account/AccountMenu.tsx'
import { cx } from '../lib/style.ts'
import { paths } from '../paths.ts'
import { Icon, type IconName } from './Icon.tsx'
import { TspBadge } from './TspBadge.tsx'

type NavItem = { to: string; label: string; icon: IconName }

// The sidebar: the burger and the name at the top, the pages, and at the foot the account (Sign in with TSP) and the
// language. One sidebar, over the page from its burger on every page (Sidebar.tsx).

export type NavProps = {
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
  'flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-8 border-0 px-3 py-2 text-left text-14 leading-[1.3] no-underline max-md:min-h-11 [&_svg]:shrink-0 ' +
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'
const openLink = 'bg-chip font-semibold text-navy [&_svg]:text-navy'
const otherLink =
  'bg-transparent font-medium text-ink [&_svg]:text-muted hovered:bg-panel hovered:text-navy data-hovered:bg-panel data-hovered:text-navy data-pressed:bg-chip'
const sectionTitle = 'm-0 px-3 pb-1 text-11 font-semibold tracking-[0.06em] text-muted uppercase'

/** The page links. The current page is marked with aria-current="page" (NavLink's own), and drawn on a grey pill. */
export function Nav({ isAdmin = false, canManage = false, onNavigate }: NavProps) {
  const en = useCopy()
  const PAGES: readonly NavItem[] = [
    { to: paths.explore, label: en.nav.explore, icon: 'map' },
    { to: paths.qualifications, label: en.nav.qualifications, icon: 'book' },
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

/** The burger. It spins as it's pressed: `turned` gives it a half turn, which it turns through. */
export function MenuButton({
  label,
  onPress,
  turned = false,
  expanded,
  hasPopup = false,
  tour,
  ref,
}: {
  label: string
  onPress?: () => void
  turned?: boolean
  expanded?: boolean
  hasPopup?: boolean
  /** The Help tour's name for it (data-tour). */
  tour?: string
  ref?: Ref<HTMLButtonElement>
}) {
  const turn: CSSProperties = { rotate: turned ? '180deg' : '0deg' }
  return (
    <Button
      ref={ref}
      data-tour={tour}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={hasPopup ? 'dialog' : undefined}
      onPress={onPress}
      className="grid size-10 flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-pressed:bg-chip"
    >
      <span
        className="grid place-items-center transition-[rotate] duration-500 ease-in-out motion-reduce:transition-none"
        style={turn}
      >
        <Icon name="menu" size="1.25rem" />
      </span>
    </Button>
  )
}

/** The name beside the burger, which returns Home. */
export function SidebarTitle({ onNavigate }: { onNavigate?: () => void }) {
  const en = useCopy()
  return (
    <Link
      to={paths.home}
      onClick={onNavigate}
      className="rounded-8 px-1.5 py-1 text-16 font-bold tracking-[0.01em] whitespace-nowrap text-navy no-underline hover:bg-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {en.nav.title}
    </Link>
  )
}

/**
 * The sidebar under the burger: the page links, then at the foot the account and the language. Signed in, the
 * account is the learner's account menu. Signed out, it's "Sign in with TSP": learners have no TESDA-TRACK accounts
 * of their own (src/auth/accounts.ts), so until TSP sign-in is connected a TESDA-TRACK account stands in for TSP's.
 * With learner accounts turned back on, it's their own Sign in. Signing in leaves the sidebar open: the dialog opens
 * over it, and focus comes back to it.
 */
export function SidebarContent({ isAdmin = false, canManage = false, onNavigate }: NavProps) {
  const en = useCopy()
  const { learner, openSignIn } = useAuth()
  const accountId = useId()
  return (
    <div className="flex flex-1 flex-col">
      <Nav isAdmin={isAdmin} canManage={canManage} onNavigate={onNavigate} />
      <div className="mt-auto flex shrink-0 flex-col gap-4 border-t border-rule pt-3">
        {/* A labelled group, not a heading: the sidebar's labels stay out of each page's outline. */}
        <div role="group" aria-labelledby={accountId}>
          <p id={accountId} className={sectionTitle}>
            {en.nav.account}
          </p>
          {learner || learnerAccounts() ? (
            // The account control draws its own rule above it: here the section's rule does.
            <div className="[&>div]:border-t-0 [&>div]:pt-0">
              <AccountControl variant="sidebar" onNavigate={onNavigate} />
            </div>
          ) : (
            <Button
              className={cx(navRow, otherLink, 'font-semibold text-navy')}
              onPress={() => openSignIn({ tsp: true })}
            >
              <TspBadge small />
              {en.account.tsp.signIn}
            </Button>
          )}
        </div>
        <div className="px-1">
          <LanguageSelector />
        </div>
      </div>
    </div>
  )
}
