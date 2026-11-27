import { Link, NavLink } from 'react-router'
import { useCopy } from '../i18n/copy.ts'
import { LanguageSelector } from '../i18n/LanguageSelector.tsx'
import { paths } from '../paths.ts'
import { LandingBrand } from '../features/home/landing/LandingBrand.tsx'
import { wrap } from '../features/home/landing/styles.ts'

const link = 'rounded-6 text-14 text-(--l-body) no-underline hover:text-(--l-ink) hover:underline'

export function HomeFooter() {
  const en = useCopy()
  const copy = en.landingPage
  return (
    <footer className="landing min-h-[178px] bg-(--l-surface) py-10 font-text [main:empty~&]:hidden">
      <div className={`${wrap} flex flex-col gap-8`}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <LandingBrand />
          <nav aria-label={copy.footer.nav} className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to={{ pathname: paths.home, hash: '#about' }} className={link}>
              {copy.nav.about}
            </Link>
            <Link to={{ pathname: paths.home, hash: '#how' }} className={link}>
              {copy.nav.how}
            </Link>
            <Link to={{ pathname: paths.home, hash: '#benefits' }} className={link}>
              {copy.nav.benefits}
            </Link>
            <NavLink to={paths.privacy} className={link}>
              {en.privacy.link}
            </NavLink>
            <a href="#main" className={link}>
              {copy.footer.backToTop} ↑
            </a>
            <LanguageSelector header light />
          </nav>
        </div>
        <p className="text-12 text-(--l-muted)">
          © 2026 Technical Education and Skills Development Authority · TESDA Track
        </p>
      </div>
    </footer>
  )
}
