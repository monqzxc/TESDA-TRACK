import { useEffect, useId, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { coreSkills, type Occupation } from './occupations.ts'
import { OccupationDemand } from '../labor-market/OccupationDemand.tsx'
import type { MarketIndicator } from '../labor-market/api.ts'
import { card, cardHeading, muted } from './styles.ts'

// Keep journey goal selection available for a future account/progress integration.
const SHOW_CAREER_GOAL_SELECTION = true

interface RelatedOccupationsProps {
  occupations: readonly Occupation[]
  /** Training & Assessment for a qualification. */
  centersFor: (code: string) => string
  onCheck: (code: string) => void
  selectedCode?: string
  recommendedCodes?: readonly string[]
  demandEvidence?: readonly MarketIndicator[]
  /** Final recommendations only; browse-only placements retain their existing behavior. */
  goalSelection?: {
    selected: { key: string; title: string } | null
    help?: string
    isSaving?: boolean
    error?: string | null
    onSelect: (occupation: { key: string; title: string }) => void
  }
}

/**
 * A skills search's related occupations (US-20), before a qualification is chosen: the jobs the matches lead to as
 * the catalog names them. Choosing one shows the qualifications that lead to it, each with its core skills, a
 * readiness check and its training centers. One occupation is open at a time; its heading takes focus.
 */
export function RelatedOccupations({
  occupations,
  centersFor,
  onCheck,
  selectedCode,
  recommendedCodes = [],
  demandEvidence = [],
  goalSelection,
}: RelatedOccupationsProps) {
  const en = useCopy()
  const copy = en.finder.occupations
  const detailMuted = goalSelection ? muted.replace('text-muted', 'text-ink') : muted

  const [openKey, setOpenKey] = useState<string | null>(() =>
    goalSelection
      ? (occupations.find((job) => job.key === goalSelection.selected?.key)?.key ??
        occupations[0]?.key ??
        null)
      : null,
  )
  const headingId = useId()
  const panelId = useId()
  const panelHeading = useRef<HTMLHeadingElement>(null)
  const open = occupations.find((occupation) => occupation.key === openKey) ?? null

  useEffect(() => {
    if (openKey && !goalSelection) panelHeading.current?.focus()
  }, [openKey, goalSelection])

  const qualificationPanel = (occupation: Occupation, detailsId: string) => (
    <div id={detailsId} className="flex flex-col gap-3 rounded-12 bg-panel p-4 max-xs:p-3">
      <div>
        {!goalSelection && (
          <h4
            ref={panelHeading}
            tabIndex={-1}
            className="m-0 text-17 leading-[1.35] font-bold text-navy outline-none"
          >
            {occupation.title}
          </h4>
        )}
        <p className={cx(detailMuted, 'mt-1')}>{copy.leadsTo(occupation.qualifications.length)}</p>
        {selectedCode && (
          <p className={cx(detailMuted, 'mt-2')}>{en.finder.unified.associatedHelp}</p>
        )}
      </div>
      <ul
        className={cx(
          'm-0 grid list-none gap-3 p-0',
          occupation.qualifications.length > 1 && 'md:grid-cols-2',
        )}
      >
        {occupation.qualifications.map((qualification) => {
          const skills = coreSkills(qualification)
          return (
            <li
              key={qualification.code}
              className="flex min-w-0 flex-col gap-2 rounded-12 border border-border bg-surface p-4"
            >
              {selectedCode && qualification.code !== selectedCode && (
                <p className="m-0 text-12 font-semibold text-blue">
                  {recommendedCodes.includes(qualification.code)
                    ? en.finder.unified.alternativeBadge
                    : en.finder.unified.associatedBadge}
                </p>
              )}
              {(!goalSelection || qualification.code !== selectedCode) && (
                <>
                  <p className={cx('m-0 text-13', goalSelection ? 'text-ink' : 'text-muted')}>
                    {qualification.sector}
                  </p>
                  <p className="m-0 text-15 leading-[1.4] font-bold wrap-anywhere text-navy">
                    {qualification.name}
                  </p>
                </>
              )}
              <p className="m-0 text-13 font-semibold text-navy">{copy.skills}</p>
              {skills.length ? (
                <ul
                  className="m-0 grid gap-1 pl-[1.1rem] text-14 leading-[1.5] text-ink"
                  aria-label={`${copy.skills}: ${qualification.name}`}
                >
                  {skills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
              ) : (
                <p className={detailMuted}>{copy.noSkills}</p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {(!selectedCode || qualification.code !== selectedCode) && (
                  <Button
                    className={button({ variant: 'secondary' })}
                    aria-label={`${en.finder.matches.check}: ${qualification.name}`}
                    onPress={() => onCheck(qualification.code)}
                  >
                    {en.finder.matches.check}
                    <Icon name="arrowRight" />
                  </Button>
                )}
                <Link
                  to={centersFor(qualification.code)}
                  className={button({ variant: 'tertiary' })}
                  aria-label={`${en.finder.matches.centers}: ${qualification.name}`}
                >
                  <Icon name="pin" />
                  {en.finder.matches.centers}
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )

  if (occupations.length === 0) return null
  return (
    <section
      data-tour="related-occupations"
      aria-labelledby={headingId}
      className={cx(card, 'mt-3 flex flex-col gap-3')}
    >
      <div>
        <h3 id={headingId} className={cardHeading}>
          {copy.heading}
        </h3>
        <p className={cx(detailMuted, 'mt-1')}>
          {selectedCode ? en.finder.unified.jobsLead : copy.lead}
        </p>
      </div>
      {goalSelection ? (
        <>
          {SHOW_CAREER_GOAL_SELECTION && (
            <div className="rounded-12 border border-border bg-panel p-4">
              <p role="status" aria-live="polite" className="m-0 text-15 font-semibold text-navy">
                {goalSelection.selected
                  ? `${en.finder.unified.careerGoalLabel}: ${goalSelection.selected.title}`
                  : en.finder.unified.careerGoalEmpty}
              </p>
              <p className={cx(detailMuted, 'mt-2')}>
                {goalSelection.help ?? en.finder.unified.careerGoalHelp}
              </p>
            </div>
          )}
          {goalSelection.error && (
            <p role="alert" className="text-14 text-ink">
              {goalSelection.error} Your previous selection is unchanged. Try again.
            </p>
          )}
          <ul className="m-0 grid list-none gap-3 p-0">
            {occupations.map((occupation) => {
              const isGoal =
                SHOW_CAREER_GOAL_SELECTION && occupation.key === goalSelection.selected?.key
              return (
                <li
                  key={occupation.key}
                  className={cx(
                    'min-w-0 rounded-12 border p-4 max-xs:p-3',
                    isGoal ? 'border-blue bg-panel' : 'border-border bg-surface',
                  )}
                >
                  <h4 className="m-0 flex min-h-11 items-center gap-2 text-17 font-bold wrap-anywhere text-navy">
                    <Icon name="briefcase" />
                    <span className="min-w-0 flex-1">{occupation.title}</span>
                  </h4>
                  <OccupationDemand
                    evidence={demandEvidence.filter(
                      (item) => item.occupation_key === occupation.key,
                    )}
                  />
                  {SHOW_CAREER_GOAL_SELECTION && (
                    <Button
                      isDisabled={goalSelection.isSaving}
                      className={cx(
                        button({ variant: isGoal ? 'primary' : 'secondary', text: 14 }),
                        'mt-3 min-h-11 max-w-full whitespace-normal',
                      )}
                      aria-label={`${isGoal ? en.finder.unified.careerGoalSelected : en.finder.unified.setCareerGoal}: ${occupation.title}`}
                      aria-pressed={isGoal}
                      onPress={() =>
                        goalSelection.onSelect({ key: occupation.key, title: occupation.title })
                      }
                    >
                      {isGoal
                        ? en.finder.unified.careerGoalSelected
                        : en.finder.unified.setCareerGoal}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {occupations.map((occupation) => {
            const isOpen = occupation.key === openKey
            return (
              <li key={occupation.key} className="max-w-full">
                <Button
                  className={cx(
                    button({ variant: 'chip', on: isOpen, text: 14 }),
                    'max-w-full text-left wrap-anywhere',
                  )}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  onPress={() => setOpenKey(isOpen ? null : occupation.key)}
                >
                  <Icon name="briefcase" />
                  {occupation.title}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {!goalSelection && open && qualificationPanel(open, panelId)}
    </section>
  )
}
