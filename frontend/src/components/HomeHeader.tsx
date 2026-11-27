import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { AccountControl } from '../features/account/AccountMenu.tsx'
import { useCopy, useLanguage } from '../i18n/copy.ts'
import { LanguageSelector } from '../i18n/LanguageSelector.tsx'
import { cx } from '../lib/style.ts'
import { paths } from '../paths.ts'
import { logoSrc } from './Brand.tsx'
import { Icon } from './Icon.tsx'
import { TspBadge } from './TspBadge.tsx'
import { useHomeBar } from './useHomeBar.ts'

// The landing page's sections, by their ids. They're router links, so each jump is a history entry of the router's
// own, and Back returns to where the page was before it.
const SECTIONS = ['about', 'how', 'benefits'] as const

const navyButton =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-0 bg-(--l-navy) px-5 py-2 text-15 font-bold whitespace-nowrap text-white no-underline transition-[background-color,scale] duration-150 hovered:bg-(--l-navy-hover) pressed:scale-97 dark:text-[#0b1630]'

const menuItem =
  'flex cursor-pointer items-start gap-3 rounded-14 p-3 outline-none data-focused:bg-(--l-panel) data-pressed:bg-(--l-line)'

/**
 * Home's top bar (PO, 19 Nov 2026): TESDA-TRACK, the page's sections, the language and Get started. Get started opens
 * the two ways in: Sign in with TSP, or Continue as guest to the Career Map. There's no sign-up. Signed in, the
 * account menu takes its place and the button opens the Career Map. White, with a hairline once the page scrolls.
 */
export function HomeHeader() {
  const language = useLanguage()
  const en = useCopy()
  const copy = en.landingPage
  const [first, second] = en.brand.wordmark
  const labels = copy.nav
  const { learner, openSignIn } = useAuth()
  const navigate = useNavigate()
  const { ref, scrolled } = useHomeBar<HTMLElement>()

  return (
    <header
      ref={ref}
      data-scrolled={scrolled || undefined}
      className="landing sticky top-0 z-20 border-b border-transparent bg-(--l-page)/85 backdrop-blur-md transition-[border-color,background-color] duration-200 data-scrolled:border-(--l-line) data-scrolled:bg-(--l-surface)/90"
    >
      <div className="mx-auto flex min-h-17 w-full max-w-[1180px] items-center gap-x-5 px-[clamp(16px,4vw,40px)] py-2.5">
        <Link
          to={paths.home}
          className="mr-auto inline-flex items-center gap-2.5 font-display text-[1.15rem] leading-none font-extrabold tracking-[-0.01em] text-(--l-ink) no-underline"
          aria-label={en.brand.homeLink}
        >
          <img src={logoSrc} alt="" width={36} height={36} className="size-9 rounded-10" />
          <span className="max-[431px]:hidden" aria-hidden="true">
            {first}-{second}
          </span>
        </Link>
        <nav
          aria-label={copy.sections}
          className={cx(
            'flex gap-1 max-[961px]:hidden',
            language !== 'en' && 'max-[1181px]:hidden',
          )}
        >
          {SECTIONS.map((id) => (
            <Link
              key={id}
              to={{ pathname: paths.home, hash: `#${id}` }}
              className="rounded-full px-3.5 py-2 text-15 font-semibold text-(--l-body) no-underline transition-colors duration-150 hover:bg-(--l-panel) hover:text-(--l-ink)"
            >
              {labels[id]}
            </Link>
          ))}
        </nav>
        <LanguageSelector header light />
        {learner ? (
          <>
            <AccountControl
              variant="header"
              buttonClassName="px-1 py-2 text-15 font-bold whitespace-nowrap text-(--l-ink) no-underline"
            />
            <Link to={paths.explore} state={{ focusSearch: true }} className={navyButton}>
              {copy.openMap}
            </Link>
          </>
        ) : (
          <MenuTrigger>
            <Button className={navyButton}>
              {copy.getStarted}
              <Icon name="chevron" size="1rem" className="max-[431px]:hidden" />
            </Button>
            <Popover
              placement="bottom end"
              offset={8}
              className="landing w-[min(20rem,calc(100vw-2rem))] rounded-[20px] border border-(--l-line) bg-(--l-surface) p-1.5 shadow-[0_24px_48px_-16px_rgb(15_20_30/0.35)]"
            >
              <Menu
                aria-label={copy.startMenu}
                className="outline-none"
                onAction={(key) => {
                  if (key === 'tsp') openSignIn({ tsp: true })
                  else void navigate(paths.explore, { state: { focusSearch: true } })
                }}
              >
                <MenuItem id="tsp" textValue={copy.tsp.title} className={menuItem}>
                  <TspBadge />
                  <span className="flex flex-col">
                    <span className="text-15 font-bold text-(--l-ink)">{copy.tsp.title}</span>
                    <span className="text-13 text-(--l-muted)">{copy.tsp.note}</span>
                  </span>
                </MenuItem>
                <MenuItem id="guest" textValue={copy.guest.title} className={menuItem}>
                  <span className="grid size-8 flex-none place-items-center rounded-full bg-(--l-panel) text-(--l-ink)">
                    <Icon name="person" size="1.1rem" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-15 font-bold text-(--l-ink)">{copy.guest.title}</span>
                    <span className="text-13 text-(--l-muted)">{copy.guest.note}</span>
                  </span>
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        )}
      </div>
    </header>
  )
}
