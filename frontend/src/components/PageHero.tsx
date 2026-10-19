import { PageArt, type PageArtName } from './PageArt.tsx'
import { PageHeading } from './PageHeading.tsx'
import styles from './PageHero.module.css'

interface PageHeroProps {
  /** The page's name: its h1, drawn as the banner's eyebrow. */
  heading: string
  /** The headline, drawn on two lines with the second in blue. */
  title: string
  accent: string
  lead: string
  art: PageArtName
}

/**
 * A page's banner (classic/presentation.py page_hero): the page's name, a two-tone headline, a lead and a
 * picture. The name is the h1, so a heading list and the focus after a navigation name the page; the headline
 * reads as its tagline.
 */
export function PageHero({ heading, title, accent, lead, art }: PageHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.copy}>
        <PageHeading className={styles.eyebrow}>{heading}</PageHeading>
        <p className={styles.title}>
          {title}
          <br />
          <span>{accent}</span>
        </p>
        <p className={styles.lead}>{lead}</p>
      </div>
      <div className={styles.art}>
        <PageArt name={art} />
      </div>
    </section>
  )
}
