import { Button, Dialog, Modal, ModalOverlay } from 'react-aria-components'
import { Link, NavLink } from 'react-router'
import { TspBadge } from '../../auth/AccountForms.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { AccountControl } from '../account/AccountMenu.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { LanguageSelector } from '../../i18n/LanguageSelector.tsx'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'

// Rows as in the sidebar (Nav.tsx), a little smaller to fit the drawer.
const row =
  'flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-8 border-0 px-3 py-2 text-left text-14 leading-[1.3] no-underline [&_svg]:shrink-0 ' +
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'
const otherRow =
  'bg-transparent font-medium text-ink [&_svg]:text-muted hover:bg-panel hover:text-navy data-hovered:bg-panel data-hovered:text-navy data-pressed:bg-chip'
const openRow = 'bg-chip font-semibold text-navy [&_svg]:text-navy'
const sectionTitle = 'm-0 px-3 pb-1 text-11 font-semibold tracking-[0.06em] text-muted uppercase'

/**
 * The map-first finder's menu, in place of the app's sidebar: Home from the name at the top, this page and the
 * library, and at the foot the account (Sign in with TSP) and the language. It slides over the map from the left and
 * back out; the burger at its top closes it, as do Escape and a press on the dimmed map.
 */
export function ExploreMenu({
  isOpen,
  onOpenChange,
  returnFocus,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The page's burger: where focus goes after the sign-in dialog, since the drawer has closed by then. */
  returnFocus: () => HTMLElement | null
}) {
  const en = useCopy()
  const copy = en.explore.menu
  const { learner, openSignIn } = useAuth()
  const close = () => onOpenChange(false)
  const pages: { to: string; label: string; icon: IconName }[] = [
    { to: paths.explore, label: en.nav.explore, icon: 'map' },
    { to: paths.qualifications, label: en.nav.qualifications, icon: 'book' },
  ]

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-100 bg-[rgb(var(--track-shadow-rgb)/0.45)] data-entering:animate-fade-in data-exiting:animate-fade-out"
    >
      <Modal className="group fixed top-0 left-0 h-dvh w-[min(17rem,85vw)] overflow-y-auto overscroll-contain bg-surface shadow-dialog data-entering:animate-slide-in data-exiting:animate-slide-out">
        <Dialog
          aria-label={copy.label}
          className="flex min-h-full flex-col pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none"
        >
          <div className="flex items-center gap-1 px-2 pt-2.5 pb-2">
            <Button
              slot="close"
              aria-label={copy.close}
              className="grid size-10 flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-pressed:bg-chip"
            >
              {/* The burger spins in with the drawer, and back as it leaves. */}
              <span className="grid place-items-center transition-[rotate] duration-500 ease-in-out group-data-entering:animate-menu-spin-in group-data-exiting:-rotate-180 group-data-exiting:duration-200 motion-reduce:transition-none">
                <Icon name="menu" size="1.25rem" />
              </span>
            </Button>
            <Link
              to={paths.home}
              onClick={close}
              className="rounded-8 px-1.5 py-1 text-16 font-bold tracking-[0.01em] text-navy no-underline hover:bg-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {copy.home}
            </Link>
          </div>

          <nav aria-label={en.nav.label} className="px-2 pb-3">
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {pages.map(({ to, label, icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end
                    onClick={close}
                    className={({ isActive }) => cx(row, isActive ? openRow : otherRow)}
                  >
                    <Icon name={icon} size="1.125rem" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-auto flex flex-col gap-4 border-t border-rule px-2 pt-3">
            <div>
              <h3 className={sectionTitle}>{copy.account}</h3>
              {learner ? (
                // Signed in: the learner's own account menu. It draws its own rule above it: here the section's does.
                <div className="[&>div]:border-t-0 [&>div]:pt-0">
                  <AccountControl variant="sidebar" onNavigate={close} returnFocus={returnFocus} />
                </div>
              ) : (
                // The drawer closes first, so the dialog opens over the page, not over the drawer.
                <Button
                  className={cx(row, otherRow, 'font-semibold text-navy')}
                  onPress={() => {
                    close()
                    openSignIn({ tsp: true, returnFocus })
                  }}
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
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
