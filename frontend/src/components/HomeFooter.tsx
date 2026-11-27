import { Link } from 'react-router'
import { useCopy } from '../i18n/copy.ts'
import { paths } from '../paths.ts'
import { logoSrc } from './Brand.tsx'

const link =
  'rounded-6 text-14 font-semibold text-(--l-body) no-underline transition-colors duration-150 hover:text-(--l-ink)'

/**
 * Home's footer: the brand, the page's sections, the privacy notice (US-0006) and Back to top. Quiet greys, so the
 * closing call above it stays the last thing to act on. It's hidden while Home's code downloads, so it doesn't show at
 * the top of an empty page and then jump down.
 */
export function HomeFooter() {
  const en = useCopy()
  const copy = en.landingPage
  const [first, second] = en.brand.wordmark

  return (
    <footer className="landing border-t border-(--l-line) bg-(--l-page) py-10 font-text [main:empty~&]:hidden">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-[clamp(16px,4vw,40px)]">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <Link
            to={paths.home}
            className="inline-flex items-center gap-2.5 font-display text-16 leading-none font-extrabold text-(--l-ink) no-underline"
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
              {first}-{second}
            </span>
          </Link>
          <nav aria-label={copy.footer.nav} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to={{ pathname: paths.home, hash: '#about' }} className={link}>
              {copy.nav.about}
            </Link>
            <Link to={{ pathname: paths.home, hash: '#how' }} className={link}>
              {copy.nav.how}
            </Link>
            <Link to={{ pathname: paths.home, hash: '#benefits' }} className={link}>
              {copy.nav.benefits}
            </Link>
            <Link to={paths.privacy} className={link}>
              {en.privacy.link}
            </Link>
            <a href="#main" className={link}>
              {copy.footer.backToTop} ↑
            </a>
          </nav>
        </div>
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-2 border-t border-(--l-line) pt-6 text-13 text-(--l-muted)">
          <p className="m-0">{copy.footer.note}</p>
          <p className="m-0">{en.footer.copyright}</p>
        </div>
      </div>
    </footer>
  )
}
