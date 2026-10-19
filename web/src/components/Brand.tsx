import { en } from '../copy/en.ts'
import utilities from '../styles/utilities.module.css'
import styles from './Brand.module.css'

/** The logo, from public/img. Public files sit under the app's base (/beta/ during the parallel run). */
export const logoSrc = `${import.meta.env.BASE_URL}img/logo.png`

const [first, second] = en.brand.wordmark

// The sidebar's brand, as frontend/presentation.py's brand(sidebar=True) draws it: the logo, the wordmark ("TESDA"
// and a lighter "TRACK", which screen readers hear as the name) and the tagline. `compact` is the phone bar's
// smaller version, without the tagline.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? `${styles.brand} ${styles.compact}` : styles.brand}>
      <div className={styles.mark}>
        <img src={logoSrc} alt="" width={46} height={46} className={styles.logo} />
        <span aria-hidden="true">
          {first}
          <span className={styles.light}>{second}</span>
        </span>
        <span className={utilities.visuallyHidden}>{en.brand.name}</span>
      </div>
      {!compact && <p className={styles.tagline}>{en.brand.tagline}</p>}
    </div>
  )
}
