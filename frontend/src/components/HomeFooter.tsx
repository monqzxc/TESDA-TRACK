import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { paths } from '../paths.ts'
import { logoSrc } from './Brand.tsx'
import { Icon } from './Icon.tsx'
import styles from './HomeFooter.module.css'

const [first, second] = en.brand.wordmark

/**
 * Home's footer, from the landing page: the brand, what the pilot's matches and checks are worth, and the privacy
 * policy.
 */
export function HomeFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.wrap}>
        <Link to={paths.home} className={styles.brand} aria-label={en.brand.homeLink}>
          <img src={logoSrc} alt="" width={28} height={28} loading="lazy" decoding="async" />
          <span aria-hidden="true">
            {first}
            <b>{second}</b>
          </span>
        </Link>
        <p>{en.home.footer}</p>
        <Link to={paths.privacy} className={styles.privacy}>
          <Icon name="document" />
          {en.privacy.link}
        </Link>
      </div>
    </footer>
  )
}
