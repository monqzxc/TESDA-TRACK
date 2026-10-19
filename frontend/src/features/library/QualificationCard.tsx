import { useId } from 'react'
import { Button } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { QualificationMedia } from '../../components/QualificationMedia.tsx'
import { TagChips } from '../../components/TagChips.tsx'
import { en } from '../../copy/en.ts'
import { competencyGroups, qualificationTags } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'

const copy = en.library

const kicker = 'm-0 text-11 leading-[1.5] font-bold tracking-[0.1em] text-ink uppercase'

interface QualificationCardProps {
  qualification: Qualification
  catalogNames: ReadonlySet<string>
  onExplore: () => void
}

/**
 * A qualification in the library (classic/app.py show_library's cards, after classic/styles.css's): its small
 * picture beside its sector, its name, the careers it leads to, its facts, its competencies by group, and "Explore
 * this pathway".
 */
export function QualificationCard({
  qualification,
  catalogNames,
  onExplore,
}: QualificationCardProps) {
  const headingId = useId()
  const groups = competencyGroups(qualification.competencies)
  return (
    <article
      className="flex h-full flex-col gap-[0.6rem] rounded-16 border border-border bg-surface px-5 py-[1.15rem] shadow-card"
      aria-labelledby={headingId}
    >
      <div className="flex items-center gap-[0.85rem]">
        <span className="size-13 flex-[0_0_52px] overflow-hidden rounded-12">
          <QualificationMedia
            name={qualification.name}
            sector={qualification.sector}
            size="thumb"
          />
        </span>
        <p className={kicker}>{qualification.sector}</p>
      </div>
      <h2 id={headingId} className="mt-[0.2rem] mb-[0.1rem] text-20 wrap-anywhere text-navy">
        {qualification.name}
      </h2>
      <p className={kicker}>{copy.careers}</p>
      <p className="mt-[-0.35rem] mb-[0.15rem] text-15 leading-[1.5] wrap-anywhere text-navy">
        {qualification.possible_jobs.join(', ') || copy.noCareers}
      </p>
      <TagChips tags={qualificationTags(qualification, catalogNames)} />
      {groups.length > 0 && (
        // Streamlit's expander.
        <details className="group mt-[0.35rem] rounded-12 border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-[0.6rem] px-[0.85rem] py-2 text-15 font-semibold text-navy hovered:text-blue [&::-webkit-details-marker]:hidden">
            <Icon name="checklist" className="flex-none text-[1.2rem] text-blue" />
            {copy.competencies(qualification.competencies.length)}
            <Icon
              name="chevron"
              className="ml-auto flex-none text-muted transition-transform duration-200 ease-[ease] group-open:rotate-180"
            />
          </summary>
          {groups.map(({ category, competencies }) => (
            <div key={category} className="px-[0.95rem] pb-[0.6rem]">
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
      {/* The button sits at the foot of the card, so cards side by side line up. */}
      <Button className={cx(button({ wide: true }), 'mt-auto')} onPress={onExplore}>
        {copy.explore}
        <Icon name="arrowRight" />
      </Button>
    </article>
  )
}
