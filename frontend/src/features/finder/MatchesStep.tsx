import { useId, useMemo } from 'react'
import { Link } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageArt } from '../../components/PageArt.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { en } from '../../copy/en.ts'
import { catalogNames } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
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
import type { JourneyContext } from './useJourney.ts'
import shared from './finder.module.css'
import styles from './MatchesStep.module.css'

const copy = en.finder

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
  const { matches, chosen, isOwnChoice } = context
  const choose = useFinderStore((state) => state.choose)
  const results = useFinderStore((state) => state.checks)
  const names = useMemo(() => catalogNames(catalog), [catalog])
  const headingId = useId()
  const byCode = useMemo(
    () => new Map(catalog.map((qualification) => [qualification.code, qualification])),
    [catalog],
  )
  const found = matches.data?.matches ?? []

  return (
    <>
      <StartingPoint journey={journey} profile={context.matchedProfile ?? context.profile} />

      <section aria-labelledby={headingId} className={styles.matches}>
        <div className={styles.matchesHeading}>
          <div className={styles.sectionTitle}>
            <Icon name="sparkle" size={26} className={styles.sparkle} />
            <div>
              <h3 id={headingId}>{copy.matches.heading}</h3>
              <p>{found.length ? copy.matches.lead : copy.matches.leadNone}</p>
            </div>
          </div>
          <Link to={paths.qualifications} className={cx(buttons.button, buttons.tertiary)}>
            {copy.matches.viewAll}
            <Icon name="arrowRight" />
          </Link>
        </div>

        {matches.isPending ? (
          <p role="status" className={shared.status}>
            {copy.matches.loading}
          </p>
        ) : matches.isError && matches.data === undefined ? (
          <RequestFailed error={matches.error} onRetry={() => void matches.refetch()} />
        ) : (
          <>
            {found.length === 0 && <p className={shared.notice}>{copy.matches.none}</p>}
            <ul className={styles.cards} aria-busy={matches.isFetching || undefined}>
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
          className={styles.other}
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

const FACT_ICONS: readonly IconName[] = ['briefcase', 'clock', 'award', 'target']

/** What the finder understood from the goal, as facts in a row, with the follow-up questions under them. */
function StartingPoint({ journey, profile }: { journey: Journey; profile: Profile }) {
  const experience = useFinderStore((state) => state.experience)
  const certification = useFinderStore((state) => state.certification)
  const setExperience = useFinderStore((state) => state.setExperience)
  const setCertification = useFinderStore((state) => state.setCertification)
  const headingId = useId()
  const start = copy.start
  const followUp = copy.followUp
  const askExperience = asksExperience(journey.profile)
  const askCertification = asksCertification(journey.profile)

  const years = profile.experience_years
  const experienceText =
    askExperience && experience !== null
      ? followUp.experienceOptions[experience]
      : years !== null && years !== undefined
        ? start.years(years)
        : start.notSpecified
  const certificationText =
    profile.has_certification === true
      ? start.certified
      : profile.has_certification === false
        ? start.none
        : certification === 'unsure'
          ? start.unsure
          : start.notSpecified
  const facts = [
    [start.goal, profile.career_goal || start.exploring],
    [start.experience, experienceText],
    [start.certification, certificationText],
    [start.intent, start.intents[profile.intent ?? 'unknown']],
  ] as const
  const skills = profile.existing_skills ?? []

  return (
    <section aria-labelledby={headingId} className={cx(shared.card, styles.startBox)}>
      <div className={styles.start}>
        <div className={styles.startHead}>
          <CardHeading icon="clipboard" id={headingId} description={start.lead}>
            {start.heading}
          </CardHeading>
        </div>
        <dl className={styles.facts}>
          {facts.map(([label, value], i) => (
            <div key={label} className={styles.fact}>
              <dt>
                <Icon name={FACT_ICONS[i]} size={30} className={styles.factIcon} />
                {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {skills.length > 0 && <p className={styles.skills}>{start.skills(skills)}</p>}
        <div className={styles.startArt}>
          <PageArt name="books" />
        </div>

        {(askExperience || askCertification) && (
          <div className={styles.followUp}>
            <p className={styles.followUpTitle}>
              {followUp.heading} <span>{followUp.lead}</span>
            </p>
            <div className={styles.questions}>
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
