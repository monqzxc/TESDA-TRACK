import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { cx } from '../lib/style.ts'
import { paths } from '../paths.ts'
import { logoSrc } from './Brand.tsx'

const [first, second] = en.brand.wordmark

// After classic/landing.css's footer: a navy band under Home, in the landing page's own colors (as in HomeHeader
// and styles/home.css). It's hidden while Home's code downloads, so it doesn't show at the top of an empty
// page and then jump down.
const footer = cx(
  '[--band-accent:#6fe0d2] [--band:#0c2152] [--signal:#e8a800] dark:[--band:#071740] dark:[--signal:#f5b83d]',
  'border-t border-[rgb(255_255_255/0.08)] bg-(--band) pt-[2.2rem] pb-[2.6rem] font-text text-[0.85rem] leading-[1.6] font-normal text-[rgb(207_220_245/0.75)]',
  '[&_:focus-visible]:rounded-6 [&_:focus-visible]:outline-3 [&_:focus-visible]:outline-offset-3 [&_:focus-visible]:outline-(--signal)',
  '[main:empty~&]:hidden',
)

/** Home's footer, from the landing page: the brand and what the pilot's matches and checks are worth. */
export function HomeFooter() {
  return (
    <footer className={footer}>
      <div className="mx-auto flex w-full max-w-home flex-wrap items-center justify-between gap-x-8 gap-y-4 px-home-gutter">
        <Link
          to={paths.home}
          className="inline-flex items-center gap-[0.6rem] font-display text-16 leading-none font-extrabold tracking-[0.01em] text-white no-underline"
          aria-label={en.brand.homeLink}
        >
          <img
            src={logoSrc}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="size-7 rounded-8"
          />
          <span aria-hidden="true">
            {first}
            <b className="ml-[0.3em] font-normal text-(--band-accent)">{second}</b>
          </span>
        </Link>
        <p className="m-0 max-w-[44rem]">{en.home.footer}</p>
      </div>
    </footer>
  )
}
