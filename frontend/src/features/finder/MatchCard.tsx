import { useId } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { SkillBars } from '../../components/Meters.tsx'
import { QualificationMedia } from '../../components/QualificationMedia.tsx'
import { TagChips } from '../../components/TagChips.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { qualificationBlurb, qualificationTags } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import type { Match } from './api.ts'
import type { SearchMode, SubmittedCheck } from './store.ts'

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
  /** How the learner searched: a skills search scores a skill match, not a goal match. */
  mode?: SearchMode
  /** Training & Assessment for this qualification, offered beside the readiness check (skills searches). */
  centersHref?: string
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
  mode = 'goal',
  centersHref,
}: MatchCardProps) {
  const en = useCopy()
  const copy = en.finder.matches

  const headingId = useId()
  const total = qualification.competencies.length
  const blurb = qualificationBlurb(qualification)
  return (
    <article
      className="grid grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] items-stretch gap-5 rounded-16 border border-border bg-surface p-5 max-[1001px]:grid-cols-1 max-xs:p-4"
      aria-labelledby={headingId}
    >
      <div className="@container min-w-0">
        <div className="flex min-w-0 items-center gap-[1.35rem] @max-[481px]:flex-col @max-[481px]:items-stretch @max-[481px]:gap-[0.9rem]">
          <div className="aspect-[16/10] flex-[0_0_236px] self-start overflow-hidden rounded-10 bg-panel @max-[701px]:basis-[160px] @max-[481px]:basis-auto">
            <QualificationMedia
              name={qualification.name}
              sector={qualification.sector}
              size="card"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-[0.4rem]">
              <h4
                id={headingId}
                className="m-0 text-20 leading-[1.3] font-bold wrap-anywhere text-navy"
              >
                {qualification.name}
              </h4>
              {badge && (
                <span
                  className={cx(
                    'inline-flex flex-none items-center rounded-full px-[0.6rem] py-[0.15rem] text-12 font-semibold whitespace-nowrap',
                    badge === 'choice' ? 'bg-chip text-ink' : 'bg-good-bg text-good-ink',
                  )}
                >
                  {match?.basis === 'demand_evidence'
                    ? 'Demand-linked pathway'
                    : badge === 'top'
                      ? copy.topMatch
                      : copy.yourChoice}
                </span>
              )}
            </div>
            <p className="mt-[0.15rem] mb-2 text-13 leading-[1.5] text-muted">
              {qualification.sector}
            </p>
            {blurb && <p className="mt-0 mb-[0.8rem] text-15 leading-[1.55] text-ink">{blurb}</p>}
            <TagChips tags={qualificationTags(qualification, catalogNames)} />
            <DataProvenance value={qualification.provenance} compact />
          </div>
        </div>
      </div>

      {/* The score panel, a step off the card: the goal match as a figure over its bar, then bars or notes, then the
          button. */}
      <div className="min-w-0">
        <div className="flex h-full min-w-0 flex-col gap-3 rounded-12 bg-panel px-5 py-4">
          <p className="m-0 flex items-center gap-[0.35rem] text-14 text-muted">
            {match?.basis === 'demand_evidence'
              ? 'Demand-linked pathway'
              : match
                ? mode === 'skills'
                  ? copy.skillMatch
                  : copy.goalMatch
                : qualification.name}
            {match && match.basis !== 'demand_evidence' && (
              <span className="inline-grid cursor-help" title={copy.hint}>
                <Icon name="info" size={15} label={copy.hint} />
              </span>
            )}
          </p>
          {match && match.basis !== 'demand_evidence' && (
            <MatchScore
              score={match.score}
              label={
                mode === 'skills'
                  ? copy.skillMatchScore(match.score)
                  : copy.goalMatchScore(match.score)
              }
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
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
              className={cx(
                button({ variant: chosen ? 'primary' : 'secondary', wide: true }),
                'mt-auto',
              )}
              onPress={onCheck}
            >
              {copy.check}
              <Icon name="arrowRight" />
            </Button>
            {centersHref && (
              <Link to={centersHref} className={button({ variant: 'tertiary', wide: true })}>
                <Icon name="pin" />
                {copy.centers}
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

/** How closely the qualification fits the goal: the figure over a bar at its true ratio. Screen readers hear its label. */
function MatchScore({ score, label }: { score: number; label: string }) {
  const shown = Math.round(Math.min(Math.max(score, 0), 100))
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-2">
      <span
        className="font-display text-[2rem] leading-none font-semibold tracking-[-0.02em] text-navy tabular-nums"
        aria-hidden="true"
      >
        {shown}%
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-bar" aria-hidden="true">
        <i className="block h-full rounded-[inherit] bg-blue" style={{ width: `${shown}%` }} />
      </span>
    </div>
  )
}
