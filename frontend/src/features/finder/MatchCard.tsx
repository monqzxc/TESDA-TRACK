import { useId } from 'react'
import { Button } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { ScoreRing, SkillBars } from '../../components/Meters.tsx'
import { QualificationMedia } from '../../components/QualificationMedia.tsx'
import { TagChips } from '../../components/TagChips.tsx'
import { en } from '../../copy/en.ts'
import { qualificationBlurb, qualificationTags } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import type { Match } from './api.ts'
import type { SubmittedCheck } from './store.ts'
import { kicker } from './styles.ts'

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
 * its facts beside a panel with the goal match and either the skills the learner rated or why it matched. Drawn
 * after classic/styles.css's match cards. Each half is a size container, so the picture and text share whatever
 * width their half gets.
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
    <article
      className="grid grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] items-center gap-[1.1rem] rounded-16 border border-border bg-surface p-[1.1rem] shadow-card max-[1001px]:grid-cols-1"
      aria-labelledby={headingId}
    >
      <div className="@container min-w-0">
        <div className="flex min-w-0 items-center gap-[1.35rem] @max-[481px]:flex-col @max-[481px]:items-stretch @max-[481px]:gap-[0.9rem]">
          <div className="aspect-[16/10] flex-[0_0_236px] overflow-hidden rounded-12 bg-tint @max-[701px]:basis-[160px] @max-[481px]:basis-auto">
            <QualificationMedia
              name={qualification.name}
              sector={qualification.sector}
              size="card"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={kicker}>{qualification.sector}</p>
            <div className="mt-[0.3rem] mb-[0.4rem] flex flex-wrap items-center gap-x-[0.8rem] gap-y-[0.4rem]">
              <h4
                id={headingId}
                className="m-0 text-20 leading-[1.3] font-bold wrap-anywhere text-navy"
              >
                {qualification.name}
              </h4>
              {badge && (
                <span
                  className={cx(
                    'inline-flex items-center gap-[0.35rem] rounded-full px-3 py-[0.3rem] text-13 font-[650] whitespace-nowrap',
                    badge === 'choice' ? 'bg-tint text-blue' : 'bg-good-bg text-good-ink',
                  )}
                >
                  <Icon name={badge === 'top' ? 'check' : 'pin'} size={17} />
                  {badge === 'top' ? copy.topMatch : copy.yourChoice}
                </span>
              )}
            </div>
            {blurb && <p className="mt-0 mb-[0.8rem] text-15 leading-[1.55] text-ink">{blurb}</p>}
            <TagChips tags={qualificationTags(qualification, catalogNames)} />
            <DataProvenance value={qualification.provenance} compact />
          </div>
        </div>
      </div>

      {/* The score panel: a ring, then bars or notes, then the button. */}
      <div className="@container min-w-0">
        <div className="flex min-w-0 items-center gap-4 rounded-14 border border-panel-border bg-panel px-[1.15rem] py-4 @max-[301px]:flex-col @max-[301px]:items-stretch">
          {match && <ScoreRing score={match.score} label={copy.goalMatchScore(match.score)} />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="m-0 flex items-center gap-[0.35rem] text-15 font-[650] text-navy">
              {match ? copy.goalMatch : qualification.name}
              {match && (
                <span className="inline-grid cursor-help text-muted" title={copy.hint}>
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
                {match && <p className="m-0 text-14 leading-[1.45] text-ink">{match.reason}</p>}
                {total > 0 && (
                  <p className="m-0 text-13 leading-[1.45] text-muted">{copy.rate(total)}</p>
                )}
              </>
            )}
            <Button
              className={button({ variant: chosen ? 'primary' : 'secondary', wide: true })}
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
