import { Fragment, useId, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { competencyGroups, higherLevel, ncLevel } from '../../lib/qualifications.ts'
import { button } from '../../styles/buttons.ts'
import { paths } from '../../paths.ts'

const label = 'm-0 text-13 leading-[1.5] text-muted'

interface QualificationCardProps {
  qualification: Qualification
  catalogNames: ReadonlySet<string>
  onExplore: () => void
  collection?: {
    added: boolean
    pending: boolean
    disabled: boolean
    error: unknown
    onAdd: () => void
  }
}

/**
 * A qualification in the library (classic/app.py show_library's cards): its sector, its name, its NC level and the
 * level after it, the careers it leads to, where its record comes from, its competencies by group, and "Explore this
 * pathway". The NC level is the card's one blue mark: it's where the qualification sits on TESDA's ladder.
 */
export function QualificationCard({
  qualification,
  catalogNames,
  onExplore,
  collection,
}: QualificationCardProps) {
  const en = useCopy()
  const copy = en.library
  const tags = en.qualification.tags

  const headingId = useId()
  const groups = competencyGroups(qualification.competencies)
  const level = ncLevel(qualification.name)
  const higher = higherLevel(qualification, catalogNames)
  const facts: ReactNode[] = [
    level && <span className="font-semibold text-blue">{tags.level(level)}</span>,
    groups.length > 0 && <span>{tags.competencies(qualification.competencies.length)}</span>,
    higher && <span>{tags.higher(higher)}</span>,
  ].filter(Boolean)
  return (
    <article
      data-tour="qualification-card"
      className="flex h-full flex-col gap-4 rounded-16 border border-border bg-surface p-5 max-xs:p-4"
      aria-labelledby={headingId}
    >
      <div>
        <p className={label}>{qualification.sector}</p>
        <h2 id={headingId} className="mt-1 mb-0 text-18 leading-[1.35] wrap-anywhere text-navy">
          {qualification.name}
        </h2>
        {facts.length > 0 && (
          <p className="mt-1.5 mb-0 text-14 leading-[1.5] text-muted">
            {facts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {fact}
              </Fragment>
            ))}
          </p>
        )}
      </div>
      <div>
        <p className={label}>{copy.careers}</p>
        <p className="mt-0.5 mb-0 text-15 leading-[1.5] wrap-anywhere text-ink">
          {qualification.possible_jobs.join(', ') || copy.noCareers}
        </p>
      </div>
      {/* What an unverified record asks of the learner is said once, above the cards. */}
      <DataProvenance value={qualification.provenance} advice={false} />
      {groups.length > 0 && (
        // A plain disclosure: the label and its chevron, with the groups under it.
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-14 font-semibold text-blue hovered:text-pill-hover-ink [&::-webkit-details-marker]:hidden">
            {copy.competencies(qualification.competencies.length)}
            <Icon
              name="chevron"
              className="flex-none transition-transform duration-200 ease-[ease] group-open:rotate-180"
            />
          </summary>
          {groups.map(({ category, competencies }) => (
            <div key={category} className="pb-[0.6rem]">
              <h3 className="mt-[0.4rem] mb-[0.25rem] font-text text-14 font-bold tracking-normal text-navy">
                {en.qualification.category(category)}
              </h3>
              <ul className="m-0 pl-[1.2rem] text-14 leading-[1.55] text-ink">
                {competencies.map((competency) => (
                  <li key={competency.id}>{competency.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      {/* The actions sit at the foot of the card, so cards side by side line up. */}
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button data-tour="qualification-explore" className={button()} onPress={onExplore}>
            {copy.explore}
            <Icon name="arrowRight" />
          </Button>
          {collection &&
            (collection.added ? (
              <>
                {/* Already in My Progress: a confirmation that stays readable, and the way there. */}
                <Button
                  className="inline-flex min-h-11 cursor-default items-center gap-2 border-0 bg-transparent px-2 text-15 font-[650] text-good-ink [&_svg]:size-[1.2em] [&_svg]:flex-none"
                  isDisabled
                >
                  <Icon name="check" />
                  {copy.collection.added}
                </Button>
                <Link to={paths.progress} className={button({ variant: 'tertiary', height: 44 })}>
                  {copy.collection.view}
                  <Icon name="arrowRight" />
                </Link>
              </>
            ) : (
              <Button
                className={button({ variant: 'tertiary', height: 44 })}
                isPending={collection.pending}
                isDisabled={collection.disabled}
                onPress={collection.onAdd}
              >
                <Icon name="plus" />
                {collection.pending ? copy.collection.adding : copy.collection.add}
              </Button>
            ))}
        </div>
        {collection?.error != null && (
          <p role="alert" className="m-0 text-14 text-warn-ink">
            {failureMessage(collection.error)}
          </p>
        )}
      </div>
    </article>
  )
}
