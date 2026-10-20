import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'

const copy = en.privacy
const page = en.pages.privacy

type Section = (typeof copy.sections)[number]
type Item = NonNullable<Extract<Section, { items: unknown }>['items']>[number]

// A readable column, the summary in a tinted card, the contents in a plain one, then the sections, each under a rule.
const heading = 'mt-0 mb-[0.6rem] text-20 leading-[1.3] text-navy'
const box = 'rounded-18 border border-solid px-5 py-[1.1rem]'
const list = 'mt-0 mb-3 flex flex-col gap-[0.55rem] pl-5'

/** A point of a section: a sentence, or a term and what it means. */
function SectionItem({ item }: { item: Item }) {
  if (typeof item === 'string') return <li>{item}</li>
  return (
    <li>
      <strong className="text-navy">{item.term}.</strong> {item.detail}
    </li>
  )
}

/**
 * The privacy policy, at /privacy: what TESDA Track collects with and without an account, what stays in the browser,
 * how it's used and shared, how long it's kept, and the learner's rights under the Data Privacy Act. It opens with
 * the notice's summary, and its sections are listed first, as links to them (router links, so ScrollRestoration
 * brings each into view and Back returns to the top).
 */
export default function PrivacyPage() {
  return (
    <article className="flex max-w-[48rem] flex-col gap-6 leading-[1.6] text-ink">
      <header className="flex flex-col gap-2 [&_:is(h1,p)]:m-0">
        <PageHeading>{page.heading}</PageHeading>
        <p className="text-17">{page.lead}</p>
        <p className="text-14 text-muted">{copy.updated}</p>
      </header>

      <section
        className={cx(box, 'border-banner-border bg-(image:--track-banner)')}
        aria-labelledby="privacy-summary"
      >
        <h2 id="privacy-summary" className={heading}>
          {copy.summary}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
          {copy.notice.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-[0.6rem] [&_svg]:mt-1 [&_svg]:flex-none [&_svg]:text-blue"
            >
              <Icon name="check" size="1.1rem" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <nav className={cx(box, 'border-border bg-surface')} aria-labelledby="privacy-contents">
        <h2 id="privacy-contents" className={heading}>
          {copy.contents}
        </h2>
        <ol className="m-0 grid grid-cols-2 gap-x-6 gap-y-[0.35rem] pl-5 max-sm:grid-cols-1">
          {copy.sections.map(({ id, heading: title }) => (
            <li key={id}>
              <Link to={{ hash: `#${id}` }} className="text-blue">
                {title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {copy.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          // Clear of the phone bar when a contents link brings it into view.
          className="scroll-mt-20 border-0 border-t border-solid border-rule pt-5 [&>:last-child]:mb-0"
        >
          <h2 className={heading}>{section.heading}</h2>
          {'paragraphs' in section &&
            section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-0 mb-3">
                {paragraph}
              </p>
            ))}
          {'items' in section && (
            <ul className={list}>
              {section.items.map((item) => (
                <SectionItem key={typeof item === 'string' ? item : item.term} item={item} />
              ))}
            </ul>
          )}
          {'after' in section && <p className="mt-0 mb-3">{section.after}</p>}
        </section>
      ))}

      <p className="m-0">
        {copy.complaint.before}
        <a
          href={copy.complaint.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue"
        >
          {copy.complaint.link}
          <Icon name="external" />
        </a>
        {copy.complaint.after}
      </p>
    </article>
  )
}
