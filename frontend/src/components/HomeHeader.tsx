import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { AccountControl } from '../features/account/AccountMenu.tsx'
import { useCopy } from '../i18n/copy.ts'
import { LanguageSelector } from '../i18n/LanguageSelector.tsx'
import { paths } from '../paths.ts'
import { useHomeBar } from './useHomeBar.ts'
import { useTheme } from '../theme/ThemeProvider.tsx'
import { GetStartedButton } from '../features/home/landing/GetStartedButton.tsx'
import { LandingBrand } from '../features/home/landing/LandingBrand.tsx'

export function HomeHeader() {
  const en = useCopy()
  const copy = en.landingPage
  const { learner } = useAuth()
  const { resolved, setChoice } = useTheme()
  const { ref, scrolled } = useHomeBar<HTMLElement>()
  return (
    <header
      ref={ref}
      data-scrolled={scrolled || undefined}
      className="landing sticky top-0 z-20 border-b border-transparent bg-(--l-surface)/95 backdrop-blur-md data-scrolled:border-(--l-line)"
    >
      <div className="relative mx-auto flex min-h-[79px] w-full max-w-[1440px] items-center gap-3 px-[clamp(1rem,8.334vw,7.5rem)] py-3 max-sm:gap-2 max-sm:px-4 max-[360px]:flex-wrap sm:gap-5">
        <LandingBrand compact />
        <nav
          aria-label={copy.sections}
          className="absolute left-1/2 flex -translate-x-1/2 gap-7 max-[1281px]:hidden"
        >
          {(['about', 'how', 'benefits'] as const).map((id) => (
            <Link
              key={id}
              to={{ pathname: paths.home, hash: `#${id}` }}
              className="rounded-6 py-2 text-14 font-normal text-(--l-ink) no-underline hover:underline"
            >
              {copy.nav[id]}
            </Link>
          ))}
        </nav>
        <LanguageSelector header light />
        <Button
          aria-label={resolved === 'dark' ? en.theme.light : en.theme.dark}
          onPress={() => setChoice(resolved === 'dark' ? 'light' : 'dark')}
          className="grid size-10 flex-none cursor-pointer place-items-center rounded-full border border-(--l-line) bg-(--l-surface) text-(--l-ink) hovered:bg-(--l-panel)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {resolved === 'dark' ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
              </>
            ) : (
              <path d="M20.8 13.2A9 9 0 0 1 10.8 3.2a9 9 0 1 0 10 10Z" />
            )}
          </svg>
        </Button>
        {learner && (
          <AccountControl variant="header" buttonClassName="px-1 py-2 text-14 text-(--l-ink)" />
        )}
        <GetStartedButton arrow={false} />
      </div>
    </header>
  )
}
