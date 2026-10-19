import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { AccountControl } from '../features/account/AccountMenu.tsx'
import { cx } from '../lib/style.ts'
import { paths } from '../paths.ts'
import { ThemeSwitch } from '../theme/ThemeSwitch.tsx'
import { logoSrc } from './Brand.tsx'
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

// After classic/landing.css's top bar. The landing page has its own navy band colors, kept here as it keeps them
// (they aren't --track-* tokens). The bar is see-through over Home's hero, and turns solid once the page scrolls
// (data-scrolled, from useHomeBar). Without a hero under it (Home still loading, or its error state) it's solid
// navy from the start.
const topbar = cx(
  '[--band-accent:#6fe0d2] [--band-body:#cfdcf5] [--band:#0c2152] [--signal:#f5b83d] dark:[--band:#071740]',
  'sticky top-0 z-20 bg-(--band) text-white transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-[ease]',
  '[&:not([data-scrolled]):has(~main_[data-home-hero])]:bg-transparent',
  'data-scrolled:bg-[rgb(9_27_70/0.82)] data-scrolled:shadow-[0_10px_30px_-20px_#000000] data-scrolled:backdrop-blur-[14px]',
  '[&_:focus-visible]:rounded-6 [&_:focus-visible]:outline-3 [&_:focus-visible]:outline-offset-3 [&_:focus-visible]:outline-(--signal)',
)

const cta = cx(
  'group inline-flex min-h-10 items-center gap-[0.55rem] rounded-14 bg-(--signal) px-4 py-[0.55rem] font-text text-[0.92rem] leading-none font-bold whitespace-nowrap text-[#0c2152] no-underline',
  'shadow-[0_10px_24px_-12px_var(--signal)] transition-[translate,box-shadow] duration-250 ease-home',
  'hovered:-translate-y-0.5 hovered:shadow-[0_16px_30px_-12px_var(--signal)]',
)

/**
 * Home's own top bar, from the landing page: the brand, its section links, Sign in, Find my path and the theme.
 * It's see-through over Home's hero and turns solid once the page scrolls (useHomeBar).
 *
 * The brand pushes the rest to the right. Where the theme switch doesn't fit, it takes a row of its own; on a
 * desktop (1180px and up) everything fits on one row, as on the landing page. On small phones the logo stands for
 * the name, so Sign in and Find my path keep to one line.
 */
export function HomeHeader() {
  const { ref, scrolled } = useHomeBar<HTMLElement>()
  return (
    <header ref={ref} className={topbar} data-scrolled={scrolled || undefined}>
      <div className="mx-auto flex min-h-17 w-full max-w-home flex-wrap items-center justify-end gap-x-5 gap-y-2 px-home-gutter py-[0.6rem] max-[761px]:gap-x-4">
        <Link
          to={paths.home}
          className="mr-auto inline-flex items-center gap-[0.6rem] font-display text-[1.15rem] leading-none font-extrabold tracking-[0.01em] text-white no-underline"
          aria-label={en.brand.homeLink}
        >
          <img src={logoSrc} alt="" width={36} height={36} className="size-9 rounded-10" />
          <span className="max-[431px]:hidden" aria-hidden="true">
            {first}
            <b className="ml-[0.3em] font-normal text-(--band-accent)">{second}</b>
          </span>
        </Link>
        <nav className="flex gap-[1.4rem] max-[761px]:hidden" aria-label={copy.sections}>
          {SECTIONS.map(({ hash, label }) => (
            <Link
              key={hash}
              to={{ pathname: paths.home, hash }}
              className="text-[0.95rem] font-semibold text-(--band-body) no-underline hovered:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <AccountControl
          variant="header"
          buttonClassName="px-[0.2rem] py-2 text-[0.95rem] font-bold whitespace-nowrap text-white no-underline hovered:text-(--band-accent)"
        />
        <Link to={paths.finder} className={cta}>
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
            className="size-4.5 transition-[translate] duration-250 ease-home group-hovered:translate-x-[3px] max-[481px]:hidden"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </Link>
        <div>
          <ThemeSwitch />
        </div>
      </div>
    </header>
  )
}
