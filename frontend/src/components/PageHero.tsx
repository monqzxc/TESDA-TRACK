import { PageArt, type PageArtName } from './PageArt.tsx'
import { PageHeading } from './PageHeading.tsx'

/** A banner's h1, drawn as its eyebrow (here, in the finder's and in Training's). Its text stays as written; only
 *  its drawing is in capitals. */
export const eyebrowHeading =
  'm-0 font-text text-11 leading-[1.6] font-bold tracking-[0.14em] text-eyebrow uppercase'

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
 * A page's banner (classic/presentation.py page_hero, classic/styles.css's .page-hero): the page's name, a two-tone
 * headline, a lead and a picture. The name is the h1, so a heading list and the focus after a navigation name the
 * page; the headline reads as its tagline. Phones keep the banner to its headline.
 */
export function PageHero({ heading, title, accent, lead, art }: PageHeroProps) {
  return (
    <section className="relative mb-[1.1rem] flex min-h-47 items-center justify-between gap-6 overflow-hidden rounded-22 border border-banner-border bg-(image:--track-banner) px-[2.1rem] py-[1.6rem] max-xs:min-h-0 max-xs:rounded-16 max-xs:px-[1.2rem] max-xs:py-[1.3rem]">
      <div className="relative z-1 max-w-[680px] min-w-0">
        <PageHeading className={eyebrowHeading}>{heading}</PageHeading>
        <p className="mt-2 mb-3 font-display text-[length:clamp(1.75rem,2.6vw,2.4rem)] leading-[1.08] font-[750] tracking-[-0.045em] text-balance text-navy max-xs:text-[1.65rem]">
          {title}
          <br />
          <span className="text-blue">{accent}</span>
        </p>
        <p className="m-0 max-w-[580px] text-15 leading-[1.6] text-muted">{lead}</p>
      </div>
      <div className="w-[min(32%,290px)] flex-[0_0_auto] max-[801px]:hidden">
        <PageArt name={art} />
      </div>
    </section>
  )
}
