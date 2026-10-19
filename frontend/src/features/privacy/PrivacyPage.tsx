import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { en } from '../../copy/en.ts'
import styles from './PrivacyPage.module.css'

const copy = en.privacy
const page = en.pages.privacy

type Section = (typeof copy.sections)[number]
type Item = NonNullable<Extract<Section, { items: unknown }>['items']>[number]

/** A point of a section: a sentence, or a term and what it means. */
function SectionItem({ item }: { item: Item }) {
  if (typeof item === 'string') return <li>{item}</li>
  return (
    <li>
      <strong>{item.term}.</strong> {item.detail}
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
    <article className={styles.page}>
      <header className={styles.header}>
        <PageHeading>{page.heading}</PageHeading>
        <p className={styles.lead}>{page.lead}</p>
        <p className={styles.updated}>{copy.updated}</p>
      </header>

      <section className={styles.summary} aria-labelledby="privacy-summary">
        <h2 id="privacy-summary">{copy.summary}</h2>
        <ul>
          {copy.notice.points.map((point) => (
            <li key={point}>
              <Icon name="check" size="1.1rem" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <nav className={styles.contents} aria-labelledby="privacy-contents">
        <h2 id="privacy-contents">{copy.contents}</h2>
        <ol>
          {copy.sections.map(({ id, heading }) => (
            <li key={id}>
              <Link to={{ hash: `#${id}` }}>{heading}</Link>
            </li>
          ))}
        </ol>
      </nav>

      {copy.sections.map((section) => (
        <section key={section.id} id={section.id} className={styles.section}>
          <h2>{section.heading}</h2>
          {'paragraphs' in section &&
            section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {'items' in section && (
            <ul>
              {section.items.map((item) => (
                <SectionItem key={typeof item === 'string' ? item : item.term} item={item} />
              ))}
            </ul>
          )}
          {'after' in section && <p>{section.after}</p>}
        </section>
      ))}

      <p className={styles.complaint}>
        {copy.complaint.before}
        <a href={copy.complaint.href} target="_blank" rel="noopener noreferrer">
          {copy.complaint.link}
          <Icon name="external" />
        </a>
        {copy.complaint.after}
      </p>
    </article>
  )
}
