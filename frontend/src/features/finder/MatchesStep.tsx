import { useId, useMemo } from 'react'
import { Link, useLocation } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { catalogNames } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { trainingAddress } from '../training/address.ts'
import { CardHeading } from './CardHeading.tsx'
import { MatchCard } from './MatchCard.tsx'
import { RequestFailed } from './RequestFailed.tsx'
import { asksCertification, asksExperience } from './rules.ts'
import {
  useFinderStore,
  type CertificationAnswer,
  type ExperienceAnswer,
  type Journey,
  type Profile,
} from './store.ts'
import { card, cardHeading, notice, status } from './styles.ts'
import type { JourneyContext } from './useJourney.ts'
import { DemandLocation } from './DemandLocation.tsx'

interface MatchesStepProps {
  journey: Journey
  context: JourneyContext
  catalog: readonly Qualification[]
  onCheck: (code: string) => void
}

/**
 * Your match (classic/app.py show_matches): what the finder understood from the goal, with questions for what it
 * didn't say; the matching qualifications, each with its reason; and any other qualification to choose instead.
 */
export function MatchesStep({ journey, context, catalog, onCheck }: MatchesStepProps) {
  const en = useCopy()
  const copy = en.finder

  const { matches, chosen, isOwnChoice } = context
  const choose = useFinderStore((state) => state.choose)
  const results = useFinderStore((state) => state.checks)
  const names = useMemo(() => catalogNames(catalog), [catalog])
  const headingId = useId()
  const byCode = useMemo(
    () => new Map(catalog.map((qualification) => [qualification.code, qualification])),
    [catalog],
  )
  const found = useMemo(() => matches.data?.matches ?? [], [matches.data])
  const skills = journey.mode === 'skills'
  const search = matches.data?.search
  const inTsp = useLocation().pathname.startsWith(paths.tspWebview)
  // A skills search can go straight to the centers for a result; a goal goes on to readiness first, as before.
  const centersHref = (code: string) =>
    trainingAddress({ qualifications: [code] }).replace(
      paths.training,
      inTsp ? paths.tspTraining : paths.training,
    )
  const centersFor = (code: string) => (skills ? centersHref(code) : undefined)

  return (
    <>
      <StartingPoint journey={journey} profile={context.matchedProfile ?? context.profile} />
      <DemandLocation query={journey.query} />

      {/* Qualifications for you: the heading with its link, then one wide card per match. */}
      <section data-tour="matches" aria-labelledby={headingId} className="mt-3 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 id={headingId} className={cardHeading}>
              {copy.matches.heading}
            </h3>
            <p className="mt-1 mb-0 text-15 leading-[1.5] text-muted">
              {found.length
                ? skills
                  ? copy.matches.skillsLead
                  : copy.matches.lead
                : copy.matches.leadNone}
            </p>
            {skills && search && search.terms.length > 0 && (
              <p className="mt-1 mb-0 text-14 leading-[1.5] wrap-anywhere text-ink">
                {copy.matches.searched(search.terms)}
              </p>
            )}
            {skills && search && search.unmatched.length > 0 && (
              <p className="mt-1 mb-0 text-14 leading-[1.5] wrap-anywhere text-muted">
                {copy.matches.unmatched(search.unmatched)}
              </p>
            )}
          </div>
          <Link to={paths.qualifications} className={button({ variant: 'tertiary' })}>
            {copy.matches.viewAll}
            <Icon name="arrowRight" />
          </Link>
        </div>

        {matches.isPending ? (
          <p role="status" className={status}>
            {copy.matches.loading}
          </p>
        ) : matches.isError && matches.data === undefined ? (
          <RequestFailed error={matches.error} onRetry={() => void matches.refetch()} />
        ) : (
          <>
            {found.length === 0 && (
              <p className={notice()}>{skills ? copy.matches.skillsNone : copy.matches.none}</p>
            )}
            <ul
              className="m-0 flex list-none flex-col gap-4 p-0 aria-busy:opacity-60 aria-busy:transition-opacity aria-busy:duration-200 aria-busy:ease-[ease]"
              aria-busy={matches.isFetching || undefined}
            >
              {found.map((match, rank) => {
                const code = match.qualification.code
                return (
                  <li key={code}>
                    <MatchCard
                      qualification={
                        byCode.get(code) ?? {
                          ...match.qualification,
                          possible_jobs: [],
                          competencies: [],
                        }
                      }
                      catalogNames={names}
                      match={match}
                      badge={rank === 0 ? 'top' : undefined}
                      chosen={chosen?.code === code}
                      check={results[code]}
                      onCheck={() => onCheck(code)}
                      mode={journey.mode}
                      centersHref={centersFor(code)}
                    />
                  </li>
                )
              })}
              {/* A qualification picked from the full list has a card of its own, labelled as the learner's choice. */}
              {chosen && isOwnChoice && (
                <li>
                  <MatchCard
                    qualification={chosen}
                    catalogNames={names}
                    badge="choice"
                    chosen
                    check={results[chosen.code]}
                    onCheck={() => onCheck(chosen.code)}
                  />
                </li>
              )}
            </ul>
          </>
        )}

        <SelectField
          className="max-w-[640px]"
          label={copy.matches.other}
          placeholder={copy.followUp.choose}
          options={context.options.map((qualification) => ({
            id: qualification.code,
            label: qualification.name,
          }))}
          value={chosen?.code ?? null}
          onChange={choose}
        />
      </section>
    </>
  )
}

// Your starting point, after classic/styles.css's .start-point: the facts in one strip split by dividers, label over
// value. The card is a size container, so the strip wraps by the card's width: two facts a row, then one.

/** A fact: its label over its value. The first of each row has no divider before it. */
function factClass(index: number): string {
  return cx(
    'flex min-w-0 flex-col py-[0.15rem]',
    index === 0 ? 'pr-5' : 'border-l border-border px-5',
    index === 2 && '@max-[641px]:border-l-0 @max-[641px]:pl-0',
    '@max-[481px]:border-l-0 @max-[481px]:px-0',
  )!
}

/** What the finder understood from the goal, as facts in a row, with the follow-up questions under them. */
function StartingPoint({ journey, profile }: { journey: Journey; profile: Profile }) {
  const en = useCopy()
  const copy = en.finder

  const experience = useFinderStore((state) => state.experience)
  const certification = useFinderStore((state) => state.certification)
  const setExperience = useFinderStore((state) => state.setExperience)
  const setCertification = useFinderStore((state) => state.setCertification)
  const headingId = useId()
  const startCopy = copy.start
  const followUp = copy.followUp
  const askExperience = asksExperience(journey.profile)
  const askCertification = asksCertification(journey.profile)

  const years = profile.experience_years
  const experienceText =
    askExperience && experience !== null
      ? followUp.experienceOptions[experience]
      : years !== null && years !== undefined
        ? startCopy.years(years)
        : startCopy.notSpecified
  const certificationText =
    profile.has_certification === true
      ? startCopy.certified
      : profile.has_certification === false
        ? startCopy.none
        : certification === 'unsure'
          ? startCopy.unsure
          : startCopy.notSpecified
  const facts = [
    [startCopy.goal, profile.career_goal || startCopy.exploring],
    [startCopy.experience, experienceText],
    [startCopy.certification, certificationText],
    [startCopy.intent, startCopy.intents[profile.intent ?? 'unknown']],
  ] as const
  const skills = profile.existing_skills ?? []

  return (
    <section
      data-tour="starting-point"
      aria-labelledby={headingId}
      className={cx(card, '@container')}
    >
      <div>
        <CardHeading id={headingId} description={startCopy.lead}>
          {startCopy.heading}
        </CardHeading>
        <dl className="mt-5 mb-0 grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] @max-[641px]:grid-cols-2 @max-[641px]:gap-y-4 @max-[481px]:grid-cols-1 @max-[481px]:gap-y-3">
          {facts.map(([label, value], i) => (
            <div key={label} className={factClass(i)}>
              <dt className="text-13 leading-[1.4] text-muted">{label}</dt>
              <dd className="mt-[0.2rem] mb-0 ml-0 text-17 leading-[1.35] font-semibold wrap-anywhere text-navy">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {skills.length > 0 && (
          <p className="mt-4 mb-0 text-13 text-muted">{startCopy.skills(skills)}</p>
        )}

        {(askExperience || askCertification) && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="mt-0 mb-3 text-15 font-[650] text-navy">
              {followUp.heading}{' '}
              <span className="ml-[0.4rem] text-13 font-normal text-muted">{followUp.lead}</span>
            </p>
            <div className="grid grid-cols-2 gap-4 @max-[641px]:grid-cols-1">
              {askExperience && (
                <SelectField<ExperienceAnswer>
                  label={
                    journey.profile.career_goal === 'Welder'
                      ? followUp.experienceWelder
                      : followUp.experience
                  }
                  placeholder={followUp.choose}
                  options={(['none', 'under-1', '1-3', 'over-3'] as const).map((id) => ({
                    id,
                    label: followUp.experienceOptions[id],
                  }))}
                  value={experience}
                  onChange={setExperience}
                />
              )}
              {askCertification && (
                <SelectField<CertificationAnswer>
                  label={followUp.certification}
                  placeholder={followUp.choose}
                  options={(['yes', 'no', 'unsure'] as const).map((id) => ({
                    id,
                    label: followUp.certificationOptions[id],
                  }))}
                  value={certification}
                  onChange={setCertification}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
