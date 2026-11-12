import { Fragment, useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { competencyGroups, higherLevel, ncLevel } from '../../lib/qualifications.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'

const label = 'm-0 text-13 leading-[1.5] text-muted'

/** A qualification's own page, in the app or in the TSP webview. */
export function qualificationHref(code: string, inTsp: boolean): string {
  return `${inTsp ? paths.tspQualifications : paths.qualifications}/${encodeURIComponent(code)}`
}

/**
 * "NC II · 17 competencies · NC III also available": the NC level in blue (where the qualification sits on TESDA's
 * ladder), how many competencies, and the next level up when the catalog has it. With `breakdown`, the count says
 * how many are in each group, "(6 basic, 5 common, 6 core)".
 */
export function QualificationFacts({
  qualification,
  catalogNames,
  breakdown = false,
}: {
  qualification: Qualification
  catalogNames: ReadonlySet<string>
  breakdown?: boolean
}) {
  const en = useCopy()
  const copy = en.library
  const groups = competencyGroups(qualification.competencies)
  const level = ncLevel(qualification.name)
  const higher = higherLevel(qualification, catalogNames)
  const count = en.qualification.tags.competencies(qualification.competencies.length)
  const facts: ReactNode[] = [
    level && <span className="font-semibold text-blue">{en.qualification.tags.level(level)}</span>,
    groups.length > 0 && (
      <span>
        {breakdown
          ? `${count} ${copy.detail.breakdown(groups.map((group) => copy.detail.part(group.competencies.length, group.category)))}`
          : count}
      </span>
    ),
    higher && <span>{copy.alsoAvailable(higher)}</span>,
  ].filter(Boolean)
  if (!facts.length) return null
  return (
    <p className="mt-1.5 mb-0 text-14 leading-[1.5] text-muted">
      {facts.map((fact, index) => (
        <Fragment key={index}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          {fact}
        </Fragment>
      ))}
    </p>
  )
}

interface QualificationCardProps {
  qualification: Qualification
  catalogNames: ReadonlySet<string>
  /** The qualification's own page. */
  href: string
  /** The library's search, sector and page, so the page's breadcrumb returns to them. */
  from: string
}

/**
 * A qualification in the library: its sector, its name, its level and competencies, where its record comes from, and
 * "See competencies", which opens its own page.
 */
export function QualificationCard({
  qualification,
  catalogNames,
  href,
  from,
}: QualificationCardProps) {
  const copy = useCopy().library
  const headingId = useId()
  return (
    <article
      data-tour="qualification-card"
      // Raised off the page, and a little more under the pointer: it grows slightly and its shadow deepens.
      className="flex h-full flex-col gap-4 rounded-16 border border-border bg-surface p-5 shadow-[0_6px_20px_rgb(var(--track-shadow-rgb)/0.10)] transition-[scale,box-shadow] duration-200 ease-out hover:scale-[1.02] hover:shadow-[0_14px_34px_rgb(var(--track-shadow-rgb)/0.16)] motion-reduce:transition-none motion-reduce:hover:scale-100 max-xs:p-4"
      aria-labelledby={headingId}
    >
      <div>
        <p className={label}>{qualification.sector}</p>
        <h2 id={headingId} className="mt-1 mb-0 text-18 leading-[1.35] wrap-anywhere text-navy">
          {qualification.name}
        </h2>
        <QualificationFacts qualification={qualification} catalogNames={catalogNames} />
      </div>
      {/* What an unverified record asks of the learner is said once, above the cards. */}
      <DataProvenance value={qualification.provenance} advice={false} />
      {/* At the foot of the card, so cards side by side line up. */}
      <div className="mt-auto">
        <Link
          data-tour="qualification-explore"
          to={href}
          state={{ from }}
          aria-describedby={headingId}
          className={button({ variant: 'secondary', height: 38 })}
        >
          {copy.seeCompetencies}
          <Icon name="arrowRight" />
        </Link>
      </div>
    </article>
  )
}
