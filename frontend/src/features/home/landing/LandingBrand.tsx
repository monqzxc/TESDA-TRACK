import { Link } from 'react-router'
import { useCopy } from '../../../i18n/copy.ts'
import { paths } from '../../../paths.ts'

export function LandingBrand({ compact = false }: { compact?: boolean }) {
  const copy = useCopy()
  return (
    <Link
      to={paths.home}
      aria-label={copy.brand.homeLink}
      className="mr-auto inline-flex flex-none items-center gap-2.5 font-text text-17 leading-[1.4] font-extrabold tracking-[-0.005em] text-(--l-ink) no-underline"
    >
      <img
        src="/img/landing/tesda-track-logo.png"
        alt=""
        width={36}
        height={36}
        className="size-9 object-contain"
      />
      <span aria-hidden="true" className={compact ? 'max-[431px]:hidden' : undefined}>
        TESDA TRACK
      </span>
    </Link>
  )
}
