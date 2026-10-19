import { useId } from 'react'
import { Button } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { ScoreRing, SkillBars } from '../../components/Meters.tsx'
import { QualificationMedia } from '../../components/QualificationMedia.tsx'
import { TagChips } from '../../components/TagChips.tsx'
import { en } from '../../copy/en.ts'
import { qualificationBlurb, qualificationTags } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import type { Match } from './api.ts'
import type { SubmittedCheck } from './store.ts'
import styles from './MatchCard.module.css'

const copy = en.finder.matches

interface MatchCardProps {
  qualification: Qualification
  catalogNames: ReadonlySet<string>
  /** The match, when the qualification is one; a qualification the learner picked has none. */
  match?: Match
  badge?: 'top' | 'choice'
  /** The qualification the learner is working on. */
  chosen: boolean
  /** Its last readiness check, once the learner has done one. */
  check?: SubmittedCheck
  onCheck: () => void
}

/**
 * A qualification for the goal (classic/app.py show_match_card): its picture, sector, name, a sentence about it and
 * its facts beside a panel with the goal match and either the skills the learner rated or why it matched.
 */
export function MatchCard({
  qualification,
  catalogNames,
  match,
  badge,
  chosen,
  check,
  onCheck,
}: MatchCardProps) {
  const headingId = useId()
  const total = qualification.competencies.length
  const blurb = qualificationBlurb(qualification)
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <div className={styles.half}>
        <div className={styles.summary}>
          <div className={styles.media}>
            <QualificationMedia
              name={qualification.name}
              sector={qualification.sector}
              size="card"
            />
          </div>
          <div className={styles.body}>
            <p className={styles.kicker}>{qualification.sector}</p>
            <div className={styles.title}>
              <h4 id={headingId}>{qualification.name}</h4>
              {badge && (
                <span className={cx(styles.badge, badge === 'choice' && styles.choice)}>
                  <Icon name={badge === 'top' ? 'check' : 'pin'} size={17} />
                  {badge === 'top' ? copy.topMatch : copy.yourChoice}
                </span>
              )}
            </div>
            {blurb && <p className={styles.blurb}>{blurb}</p>}
            <TagChips tags={qualificationTags(qualification, catalogNames)} />
          </div>
        </div>
      </div>

      <div className={styles.half}>
        <div className={styles.fit}>
          {match && <ScoreRing score={match.score} label={copy.goalMatchScore(match.score)} />}
          <div className={styles.fitText}>
            <p className={styles.fitTitle}>
              {match ? copy.goalMatch : qualification.name}
              {match && (
                <span className={styles.hint} title={copy.hint}>
                  <Icon name="info" size={16} label={copy.hint} />
                </span>
              )}
            </p>
            {/* Once the learner has rated its skills, the card shows how many they already have. */}
            {check && total ? (
              <SkillBars
                bars={[
                  {
                    label: copy.relevant,
                    count: check.result.strengths.length,
                    total,
                    tone: 'blue',
                  },
                  {
                    label: copy.develop,
                    count: check.result.skill_gaps.length,
                    total,
                    tone: 'violet',
                  },
                ]}
              />
            ) : (
              <>
                {match && <p className={styles.note}>{match.reason}</p>}
                {total > 0 && <p className={styles.noteMuted}>{copy.rate(total)}</p>}
              </>
            )}
            <Button
              className={cx(buttons.button, buttons.wide, chosen && buttons.primary)}
              onPress={onCheck}
            >
              {copy.check}
              <Icon name="arrowRight" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
