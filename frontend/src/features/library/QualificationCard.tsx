import { useId } from 'react'
import { Button } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { QualificationMedia } from '../../components/QualificationMedia.tsx'
import { TagChips } from '../../components/TagChips.tsx'
import { en } from '../../copy/en.ts'
import { competencyGroups, qualificationTags } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import styles from './QualificationCard.module.css'

const copy = en.library

interface QualificationCardProps {
  qualification: Qualification
  catalogNames: ReadonlySet<string>
  onExplore: () => void
}

/**
 * A qualification in the library (classic/app.py show_library's cards): its picture and sector, its name, the
 * careers it leads to, its facts, its competencies by group, and "Explore this pathway".
 */
export function QualificationCard({
  qualification,
  catalogNames,
  onExplore,
}: QualificationCardProps) {
  const headingId = useId()
  const groups = competencyGroups(qualification.competencies)
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <div className={styles.top}>
        <span className={styles.media}>
          <QualificationMedia
            name={qualification.name}
            sector={qualification.sector}
            size="thumb"
          />
        </span>
        <p className={styles.kicker}>{qualification.sector}</p>
      </div>
      <h2 id={headingId} className={styles.name}>
        {qualification.name}
      </h2>
      <p className={styles.kicker}>{copy.careers}</p>
      <p className={styles.careers}>{qualification.possible_jobs.join(', ') || copy.noCareers}</p>
      <TagChips tags={qualificationTags(qualification, catalogNames)} />
      {groups.length > 0 && (
        <details className={styles.competencies}>
          <summary>
            <Icon name="checklist" className={styles.summaryIcon} />
            {copy.competencies(qualification.competencies.length)}
            <Icon name="chevron" className={styles.chevron} />
          </summary>
          {groups.map(({ category, competencies }) => (
            <div key={category} className={styles.group}>
              <h3>{en.qualification.category(category)}</h3>
              <ul>
                {competencies.map((competency) => (
                  <li key={competency.id}>{competency.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      <Button className={cx(buttons.button, buttons.wide, styles.explore)} onPress={onExplore}>
        {copy.explore}
        <Icon name="arrowRight" />
      </Button>
    </article>
  )
}
