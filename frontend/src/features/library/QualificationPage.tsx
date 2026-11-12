import { useId, useMemo, useState, type MouseEvent } from 'react'
import { Button } from 'react-aria-components'
import { Link, useLocation, useParams } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Icon } from '../../components/Icon.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { catalogNames, competencyGroups } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { QualificationFacts } from './QualificationCard.tsx'
import { useLibraryCollection } from './useLibraryCollection.ts'

/** The assessment action's fill: TESDA-TRACK's green, with the page's own surface as its text in either theme. */
const assessButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-12 border border-good-ink bg-good-ink px-[1.1rem] py-2 text-15 leading-[1.3] font-[650] text-surface no-underline transition-[filter] duration-150 hover:brightness-110 [&_svg]:size-[1.2em] [&_svg]:flex-none'

/**
 * A qualification's own page, at /qualifications/:code (and in the TSP webview): its level and record, the way to
 * the centers that train or assess for it, and its competencies by group, Basic, Common, then Core.
 */
export default function QualificationPage() {
  const { code = '' } = useParams()
  return (
    <WithCatalog emptyState>
      {(qualifications) => <Details qualifications={qualifications} code={code} />}
    </WithCatalog>
  )
}

function Details({ qualifications, code }: { qualifications: Qualification[]; code: string }) {
  const en = useCopy()
  const copy = en.library.detail
  const { pathname, state } = useLocation()
  const inTsp = pathname.startsWith(paths.tspWebview)
  const library = inTsp ? paths.tspQualifications : paths.qualifications
  // Back to the library as the learner left it: their search, sector and page.
  const from = typeof state?.from === 'string' ? state.from : ''
  const names = useMemo(() => catalogNames(qualifications), [qualifications])
  const qualification = qualifications.find((item) => item.code === code)

  if (!qualification) {
    return (
      <>
        <PageHeading>{copy.notFound.heading}</PageHeading>
        <EmptyState heading={copy.notFound.heading} body={copy.notFound.body}>
          <Link className={button()} to={library}>
            {en.pages.qualifications.heading}
          </Link>
        </EmptyState>
      </>
    )
  }

  const groups = competencyGroups(qualification.competencies)
  // The map page in the app; the TSP webview keeps its own Training & Assessment.
  const centers = (type: 'training' | 'assessment') =>
    `${inTsp ? paths.tspTraining : paths.explore}?${new URLSearchParams({ qualification: qualification.code, type })}`

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={copy.breadcrumb} className="text-14">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-muted">
          <li>
            <Link className="font-semibold text-blue" to={`${library}${from}`}>
              {en.pages.qualifications.heading}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="wrap-anywhere">
            {qualification.name}
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-4 rounded-16 border border-border bg-surface p-6 max-xs:p-4">
        <div>
          <p className="m-0 text-13 leading-[1.5] text-muted">{qualification.sector}</p>
          <PageHeading className="mt-1 mb-0 font-display text-[1.75rem] leading-[1.2] font-bold tracking-[-0.025em] wrap-anywhere text-navy max-xs:text-24">
            {qualification.name}
          </PageHeading>
          <QualificationFacts qualification={qualification} catalogNames={names} breakdown />
        </div>
        <DataProvenance value={qualification.provenance} />
        <div className="flex flex-wrap items-center gap-3">
          <Link className={button({ variant: 'primary' })} to={centers('training')}>
            {copy.findTraining}
            <Icon name="arrowRight" />
          </Link>
          <Link className={assessButton} to={centers('assessment')}>
            {copy.findAssessment}
            <Icon name="arrowRight" />
          </Link>
          {!inTsp && <SaveToProgress qualification={qualification} />}
        </div>
      </header>

      {groups.length > 0 && (
        <>
          <p className="m-0 flex items-start gap-2 text-13 leading-[1.5] text-muted">
            <span
              className="mt-[0.45em] size-2 flex-none rounded-full bg-legend-assessment"
              aria-hidden="true"
            />
            {copy.sample}
          </p>
          <Competencies groups={groups} />
        </>
      )}
    </div>
  )
}

/** Signed in, the qualification can be saved to My Progress, as the library's cards used to offer. */
function SaveToProgress({ qualification }: { qualification: Qualification }) {
  const copy = useCopy().library.collection
  const collection = useLibraryCollection()
  if (!collection.isSignedIn) return null
  const pending = collection.add.isPending
  if (collection.saved.has(qualification.code)) {
    return (
      <>
        <Button
          className="inline-flex min-h-11 cursor-default items-center gap-2 border-0 bg-transparent px-2 text-15 font-[650] text-good-ink [&_svg]:size-[1.2em] [&_svg]:flex-none"
          isDisabled
        >
          <Icon name="check" />
          {copy.added}
        </Button>
        <Link to={paths.progress} className={button({ variant: 'tertiary', height: 44 })}>
          {copy.view}
          <Icon name="arrowRight" />
        </Link>
      </>
    )
  }
  return (
    <>
      <Button
        className={button({ variant: 'tertiary', height: 44 })}
        isPending={pending}
        isDisabled={collection.loading || pending}
        onPress={() => collection.add.mutate(qualification)}
      >
        <Icon name="plus" />
        {pending ? copy.adding : copy.add}
      </Button>
      {collection.add.isError && (
        <p role="alert" className="m-0 basis-full text-14 text-warn-ink">
          {failureMessage(collection.add.error)}
        </p>
      )}
    </>
  )
}

/** "On this page" beside the groups, each a numbered list; the numbers run on from one group to the next. */
function Competencies({ groups }: { groups: ReturnType<typeof competencyGroups> }) {
  const copy = useCopy().library.detail
  const baseId = useId()
  const sectionId = (category: string) => `${baseId}-${category.toLowerCase()}`
  const [current, setCurrent] = useState(groups[0]?.category ?? '')
  const starts = groups.map((_, index) =>
    groups.slice(0, index).reduce((sum, group) => sum + group.competencies.length, 1),
  )

  // A jump within the page: no history entry for each group, and focus goes to the group's heading.
  const jump = (event: MouseEvent<HTMLAnchorElement>, category: string) => {
    event.preventDefault()
    const target = document.getElementById(sectionId(category))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
    setCurrent(category)
  }

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-6 max-md:grid-cols-1">
      <nav aria-label={copy.onThisPage} className="sticky top-6 max-md:static">
        <p className="mt-0 mb-2 text-12 font-bold tracking-[0.06em] text-muted uppercase">
          {copy.onThisPage}
        </p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 max-md:flex-row max-md:flex-wrap">
          {groups.map(({ category, competencies }) => (
            <li key={category}>
              <a
                href={`#${sectionId(category)}`}
                onClick={(event) => jump(event, category)}
                aria-current={current === category ? 'true' : undefined}
                className={cx(
                  'flex min-h-10 items-center gap-2.5 rounded-10 px-3 text-14 no-underline',
                  current === category
                    ? 'bg-tint font-semibold text-blue'
                    : 'font-medium text-ink hover:bg-panel',
                )}
              >
                <Icon name="book" className="flex-none" />
                {copy.groupLink(category, competencies.length)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-8">
        {groups.map(({ category, competencies }, index) => (
          <section key={category} aria-labelledby={sectionId(category)}>
            <h2
              id={sectionId(category)}
              tabIndex={-1}
              className="m-0 scroll-mt-6 text-18 leading-[1.35] text-navy focus:outline-none"
            >
              {copy.group(category, competencies.length)}
            </h2>
            {copy.groupHelp[category] && (
              <p className="mt-1 mb-0 text-14 text-muted">{copy.groupHelp[category]}</p>
            )}
            <ol
              start={starts[index]}
              className="mt-3 mb-0 list-none overflow-hidden rounded-14 border border-border bg-surface p-0"
            >
              {competencies.map((competency, offset) => (
                <li
                  key={competency.id}
                  className="flex items-center gap-4 border-0 border-t border-rule px-4 py-3.5 first:border-t-0"
                >
                  <span
                    className="grid size-7 flex-none place-items-center rounded-full bg-panel text-13 font-semibold text-muted tabular-nums"
                    aria-hidden="true"
                  >
                    {starts[index] + offset}
                  </span>
                  <span className="text-15 leading-[1.45] font-semibold text-navy">
                    {competency.name}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
