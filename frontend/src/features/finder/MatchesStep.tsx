import { useId, useMemo } from 'react'
import { Link } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageArt } from '../../components/PageArt.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { catalogNames } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
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
import { card, notice, status } from './styles.ts'
import type { JourneyContext } from './useJourney.ts'

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
  const found = matches.data?.matches ?? []

  return (
    <>
      <StartingPoint journey={journey} profile={context.matchedProfile ?? context.profile} />

      {/* Qualifications for you: the heading with its link, then one wide card per match. */}
      <section data-tour="matches" aria-labelledby={headingId} className="mt-3 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-start gap-3">
            <Icon name="sparkle" size={26} className="mt-[0.2rem] shrink-0 text-[#f5a524]" />
            <div>
              <h3 id={headingId} className="m-0 text-[1.4rem] leading-[1.3] font-[750] text-navy">
                {copy.matches.heading}
              </h3>
              <p className="mt-[0.2rem] mb-0 text-15 leading-[1.5] text-muted">
                {found.length ? copy.matches.lead : copy.matches.leadNone}
              </p>
            </div>
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
            {found.length === 0 && <p className={notice()}>{copy.matches.none}</p>}
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

const FACT_ICONS: readonly IconName[] = ['briefcase', 'clock', 'award', 'target']

// Your starting point, after classic/styles.css's .start-point: the facts in a row with dividers, beside a stack of
// books. The card is a size container, so the row wraps by the card's width: two facts a row, then one.
const start = cx(
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 [grid-template-areas:"head_art"_"facts_art"_"skills_art"_"follow_follow"]',
  '@max-[981px]:grid-cols-1 @max-[981px]:[grid-template-areas:"head"_"facts"_"skills"_"follow"]',
)

/**
 * A fact: its icon beside the label over the value. The icon sits in the label (dt), drawn in the fact's gutter
 * (--pad, then --icon-gap). The first of each row has no divider before it.
 */
function factClass(index: number): string {
  return cx(
    'relative flex min-w-0 flex-col justify-center py-[0.15rem] pr-(--pad) pl-[calc(var(--pad)_+_var(--icon-gap))] [--icon-gap:calc(30px_+_0.85rem)]',
    index === 0 ? 'border-l-0 [--pad:0.4rem]' : 'border-l border-border [--pad:1.25rem]',
    index === 2 && '@max-[641px]:border-l-0 @max-[641px]:[--pad:0.4rem]',
    '@max-[481px]:border-l-0 @max-[481px]:[--pad:0.4rem]',
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
      <div className={start}>
        <div className="[grid-area:head]">
          <CardHeading icon="clipboard" id={headingId} description={startCopy.lead}>
            {startCopy.heading}
          </CardHeading>
        </div>
        <dl className="mt-[1.2rem] mb-0 grid grid-cols-[repeat(4,auto)] [grid-area:facts] @max-[641px]:grid-cols-2 @max-[641px]:gap-y-4 @max-[481px]:grid-cols-1 @max-[481px]:gap-y-[0.8rem]">
          {facts.map(([label, value], i) => (
            <div key={label} className={factClass(i)}>
              <dt className="text-13 leading-[1.4] font-[650] text-navy">
                <Icon
                  name={FACT_ICONS[i]}
                  size={30}
                  className="absolute top-1/2 left-(--pad) -translate-y-1/2 text-blue"
                />
                {label}
              </dt>
              <dd className="mt-[0.15rem] mb-0 ml-0 text-17 leading-[1.35] font-medium wrap-anywhere text-navy">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {skills.length > 0 && (
          <p className="mt-[0.8rem] mb-0 ml-[0.4rem] text-13 text-muted [grid-area:skills]">
            {startCopy.skills(skills)}
          </p>
        )}
        <div className="w-[230px] [grid-area:art] @max-[981px]:hidden">
          <PageArt name="books" />
        </div>

        {(askExperience || askCertification) && (
          <div className="mt-4 border-t border-border pt-4 [grid-area:follow]">
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
