import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { cx } from '../lib/style.ts'
import { paths } from '../paths.ts'

/** The logo, from public/img. Public files sit under the app's base (/beta/ during the parallel run). */
export const logoSrc = `${import.meta.env.BASE_URL}img/logo.png`

const [first, second] = en.brand.wordmark

// The sidebar's brand, as classic/presentation.py's brand(sidebar=True) draws it: the logo, the wordmark ("TESDA"
// and a lighter "TRACK", which screen readers hear as the name) and the tagline. `compact` is the phone bar's
// smaller version, without the tagline.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx(!compact && 'mt-[0.2rem] mb-[1.8rem]')}>
      <Link
        to={paths.home}
        aria-label={en.brand.homeLink}
        className={cx(
          'flex w-fit items-center gap-[0.3rem] rounded-6 font-display leading-[1.15] font-extrabold tracking-[-0.055em] whitespace-nowrap text-navy no-underline',
          compact ? 'text-[1.2rem]' : 'text-[1.55rem]',
        )}
      >
        {/* The logo artwork carries its own rounded blue tile. */}
        <img
          src={logoSrc}
          alt=""
          width={46}
          height={46}
          className={cx('shrink-0', compact ? 'mr-[0.2rem] size-8.5' : 'mr-[0.4rem] size-11.5')}
        />
        <span aria-hidden="true">
          {first}
          <span className="font-normal text-blue">{second}</span>
        </span>
      </Link>
      {!compact && (
        <p className="mt-[0.3rem] mb-0 text-[0.625rem] leading-[1.6] font-semibold tracking-[0.12em] text-muted uppercase">
          {en.brand.tagline}
        </p>
      )}
    </div>
  )
}
