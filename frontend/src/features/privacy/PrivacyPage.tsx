import { Link } from 'react-router'
import type { en } from '../../copy/en.ts'
import { Icon } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { PrivacyPlaceholder } from './PrivacyPlaceholder.tsx'

type Section = (typeof en.privacy.sections)[number]
type Item = NonNullable<Extract<Section, { items: unknown }>['items']>[number]

// A summary card and readable policy sections, with a sticky, scrollable contents list on desktop.
const heading = 'mt-0 mb-4 text-20 leading-[1.35] font-semibold text-(--l-ink)'
const box = 'rounded-[24px] border border-solid border-(--l-line) bg-(--l-surface) p-7 max-sm:p-5'
const list = 'mt-0 mb-3 flex flex-col gap-[0.55rem] pl-5'

/** A point of a section: a sentence, or a term and what it means. */
function SectionItem({ item }: { item: Item }) {
  if (typeof item === 'string') return <li>{item}</li>
  return (
    <li>
      <strong className="font-semibold text-(--l-ink)">{item.term}.</strong> {item.detail}
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
  const en = useCopy()
  const copy = en.privacy
  const page = en.pages.privacy

  return (
    <article className="mx-auto flex w-full flex-col gap-8 leading-[1.75] text-(--l-body)">
      <header className="flex flex-col items-start gap-5 rounded-[28px] border border-(--l-line) bg-(--l-surface) p-10 max-sm:p-6 [&_:is(h1,p)]:m-0">
        <span className="grid size-12 place-items-center rounded-14 bg-(--l-navy-soft) text-(--l-navy)">
          <Icon name="document" size="1.5rem" />
        </span>
        <PageHeading className="font-text text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.1] font-medium tracking-[-0.03em] text-(--l-ink)">
          {page.heading}
        </PageHeading>
        <p className="max-w-[720px] text-18 leading-[1.6]">{page.lead}</p>
        <p className="text-13 text-(--l-muted)">{copy.updated}</p>
        <PrivacyPlaceholder />
      </header>

      <section
        className={cx(box, 'border-[#cbdcf3] bg-[#edf4fd] dark:border-[#314765] dark:bg-[#1c2a3d]')}
        aria-labelledby="privacy-summary"
      >
        <h2 id="privacy-summary" className={heading}>
          {copy.summary}
        </h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-8 gap-y-5 p-0 max-md:grid-cols-1">
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

      <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-8 max-lg:grid-cols-1">
        <nav
          className={cx(
            box,
            'sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto max-lg:static max-lg:max-h-none',
          )}
          aria-labelledby="privacy-contents"
        >
          <h2 id="privacy-contents" className={heading}>
            {copy.contents}
          </h2>
          <ol className="m-0 flex list-none flex-col gap-1 p-0 max-lg:grid max-lg:grid-cols-2 max-sm:grid-cols-1">
            {copy.sections.map(({ id, heading: title }) => (
              <li key={id}>
                <Link
                  to={{ hash: `#${id}` }}
                  className="block rounded-10 px-3 py-2 text-14 leading-[1.45] text-(--l-body) no-underline hover:bg-(--l-panel) hover:text-(--l-navy)"
                >
                  {title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {copy.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              // Clear of the phone bar when a contents link brings it into view.
              className={cx(box, 'scroll-mt-20 [&>:last-child]:mb-0')}
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

          <p className="m-0 rounded-16 border border-(--l-line) bg-(--l-surface) p-5 text-14">
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
        </div>
      </div>
    </article>
  )
}
