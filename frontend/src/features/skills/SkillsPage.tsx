import { useMutation, useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Label, Text, TextArea, TextField } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Icon } from '../../components/Icon.tsx'
import { ScoreRing } from '../../components/Meters.tsx'
import { PageHero } from '../../components/PageHero.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { clientConfigQuery } from '../training/api.ts'
import { explore, type Exploration, type OccupationMatch } from './api.ts'
import { BridgeQualification } from './BridgeQualification.tsx'
import { OccupationDetails } from './OccupationDetails.tsx'
import { ui } from './styles.ts'

const copy = en.skills

/** The sentence box's limit, as the API takes it. */
const TEXT_MAX_LENGTH = 500

const ABOUT_URL = 'https://skills-bridge.ph'

/**
 * Skills Explorer, at /skills (classic/skills_bridge_view.py show_skills_bridge): a short sentence of skills or
 * roles, the occupations and qualifications Skills Bridge links them to, and an occupation's details. Our API takes
 * the terms out of the sentence and sends only those to Skills Bridge.
 */
export default function SkillsPage() {
  const page = en.pages.skills
  const config = useQuery(clientConfigQuery)
  return (
    <>
      <PageHero
        heading={page.heading}
        title={copy.hero.title}
        accent={copy.hero.accent}
        lead={page.lead}
        art="network"
      />
      {/* Settings that can't be read leave the explorer on: a lookup then says what's wrong. */}
      {config.isPending ? null : config.data?.skills_bridge_enabled === false ? (
        <EmptyState icon="cloud" heading={copy.off.heading} body={copy.off.body} />
      ) : (
        <WithCatalog>{(catalog) => <Explorer catalog={catalog} />}</WithCatalog>
      )}
    </>
  )
}

function Explorer({ catalog }: { catalog: Qualification[] }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [occupationId, setOccupationId] = useState<number | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const headingId = useId()

  const search = useMutation({
    mutationFn: explore,
    onMutate: () => setOccupationId(null),
    onSuccess: (found) => {
      if (!found.searched) {
        setError(copy.search.noTerms)
        field.current?.focus()
      }
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) {
      setError(copy.search.empty)
      field.current?.focus()
      return
    }
    setError(null)
    search.mutate(text.trim())
  }

  const found = search.data?.searched ? search.data : null
  return (
    <>
      <section aria-labelledby={headingId} className="mb-5 rounded-18 bg-surface p-5">
        <h2 id={headingId} className="sr-only">
          {copy.search.label}
        </h2>
        {/* Enter makes a new line, as the sentence may be a list of terms. */}
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <TextField
            className="flex flex-col gap-[0.45rem]"
            value={text}
            onChange={(value) => {
              setText(value)
              setError(null)
            }}
            maxLength={TEXT_MAX_LENGTH}
            isInvalid={error !== null}
            validationBehavior="aria"
          >
            <Label className="text-15 font-semibold text-navy">{copy.search.label}</Label>
            <TextArea
              data-tour="skills-input"
              ref={field}
              className="min-h-[105px] w-full resize-y rounded-12 border border-hover-border bg-surface px-[0.9rem] py-3 text-16 leading-[1.5] text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-hovered:border-blue data-invalid:border-warn-ink"
              placeholder={copy.search.placeholder}
            />
            <div className="flex justify-between gap-4">
              <Text slot="description" className={ui.muted}>
                {copy.search.help}{' '}
                <span className="sr-only">
                  {en.home.closing.countLabel(text.length, TEXT_MAX_LENGTH)}
                </span>
              </Text>
              <span className="flex-none text-13 text-muted" aria-hidden="true">
                {`${text.length}/${TEXT_MAX_LENGTH}`}
              </span>
            </div>
            {/* Words as well as color say what's wrong (US-13). */}
            <FieldError className="text-14 font-semibold text-warn-ink">{error}</FieldError>
          </TextField>
          <p className="m-0 flex items-start gap-2 text-14 leading-[1.5] text-ink">
            <Icon name="info" className="mt-[0.2rem] flex-none text-blue" />
            {copy.search.privacy}
          </p>
          <Button
            data-tour="skills-search"
            type="submit"
            className={cx(
              button({ variant: 'primary', height: 48 }),
              'self-start max-sm:self-stretch',
            )}
            isPending={search.isPending}
          >
            <Icon name="search" />
            {search.isPending ? copy.search.pending : copy.search.submit}
          </Button>
        </form>
        {search.isError && (
          <div
            role="alert"
            className="mt-3 rounded-10 bg-warn-bg px-[0.85rem] py-[0.65rem] text-14 text-warn-ink"
          >
            <p className="m-0 font-[650]">{failureMessage(search.error)}</p>
            <p className="m-0">{copy.search.stillAvailable}</p>
          </div>
        )}
      </section>

      <p role="status" className="sr-only">
        {search.isPending
          ? copy.search.pending
          : found
            ? copy.results.announce(found.occupations.length, found.qualifications.length)
            : ''}
      </p>

      {found ? (
        <Results
          found={found}
          catalog={catalog}
          occupationId={occupationId}
          onExplore={setOccupationId}
        />
      ) : (
        !search.isPending && (
          <EmptyState icon="growth" heading={copy.start.heading} body={copy.start.body} />
        )
      )}
    </>
  )
}

function Results({
  found,
  catalog,
  occupationId,
  onExplore,
}: {
  found: Exploration
  catalog: Qualification[]
  occupationId: number | null
  onExplore: (id: number) => void
}) {
  const occupationsId = useId()
  const linkedId = useId()
  const results = copy.results
  const { occupation_terms: roles, skill_terms: skills, occupations, qualifications } = found
  const caption =
    roles.length && skills.length
      ? copy.occupations.captionBoth
      : roles.length
        ? copy.occupations.captionRoles
        : copy.occupations.captionSkills

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[0.35rem]">
        <p className="m-0 text-15 font-semibold wrap-anywhere text-navy">
          {results.searched(found.terms)}
        </p>
        {found.retrieved_at && (
          <p className={ui.muted}>{results.source(retrieved(found.retrieved_at))}</p>
        )}
        {roles.length > 0 && (
          <p className={ui.muted}>
            {skills.length > 0 ? results.treatedBoth(roles, skills) : results.treatedRoles(roles)}
          </p>
        )}
        {found.unmatched.length > 0 && (
          <p className={ui.note}>{results.unmatched(found.unmatched)}</p>
        )}
        {found.resolution.length > 0 && (
          <details className={ui.details}>
            <summary className={ui.summary}>
              <Icon name="search" className={ui.summaryIcon} />
              {results.understood}
              <Icon name="chevron" className={ui.chevron} />
            </summary>
            <ul className="m-0 pt-0 pr-[0.95rem] pb-[0.85rem] pl-10 text-14 leading-[1.6] text-ink">
              {found.resolution.map((item) => (
                <li key={item.term}>
                  {results.resolution(
                    item.term,
                    item.matched_occupations !== null && item.matched_occupations !== undefined
                      ? results.occupationsFound(item.matched_occupations)
                      : results.skillsFound(item.matched_skills ?? 0),
                    item.strength ?? results.unknownStrength,
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <section data-tour="skills-occupations" aria-labelledby={occupationsId}>
        <h2 id={occupationsId} className="mt-0 mb-[0.35rem] text-[1.3rem] text-navy">
          {copy.occupations.heading}
        </h2>
        <p className="mt-0 mb-[0.85rem] text-14 leading-[1.55] text-muted">
          {caption} {copy.occupations.notAScore}
        </p>
        {occupations.length === 0 ? (
          <EmptyState
            icon="search"
            heading={copy.occupations.none.heading}
            body={copy.occupations.none.body}
            headingLevel={3}
          />
        ) : (
          // Two occupations to a row, as the Streamlit app's columns.
          <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 max-sm:grid-cols-1">
            {occupations.map((occupation) => (
              <li key={occupation.occupation_id} className="flex">
                <OccupationCard
                  occupation={occupation}
                  chosen={occupation.occupation_id === occupationId}
                  onExplore={() => onExplore(occupation.occupation_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {occupationId !== null ? (
        <OccupationDetails key={occupationId} occupationId={occupationId} catalog={catalog} />
      ) : (
        <section data-tour="skills-qualifications" aria-labelledby={linkedId}>
          <h2 id={linkedId} className="mt-0 mb-[0.35rem] text-[1.3rem] text-navy">
            {copy.linked.heading}
          </h2>
          {qualifications.length === 0 ? (
            <p className={ui.muted}>{copy.linked.none}</p>
          ) : (
            <ul className={ui.list}>
              {qualifications.map((item, index) => (
                <li key={item.code ?? index}>
                  <BridgeQualification item={item} catalog={catalog} headingLevel={3} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-border pt-4">
        <p className={cx(ui.muted, 'flex-[1_1_22rem]')}>{copy.footer}</p>
        <a className={button()} href={ABOUT_URL} target="_blank" rel="noopener noreferrer">
          {copy.about}
          <Icon name="external" />
        </a>
      </footer>
    </div>
  )
}

function OccupationCard({
  occupation,
  chosen,
  onExplore,
}: {
  occupation: OccupationMatch
  chosen: boolean
  onExplore: () => void
}) {
  const headingId = useId()
  const label =
    occupation.match_kind === 'occupation'
      ? copy.occupations.titleMatch
      : copy.occupations.skillMatch
  const score = Math.round((occupation.score ?? 0) * 100)
  return (
    <article
      aria-labelledby={headingId}
      className={cx(
        ui.cardFrame,
        'flex-1',
        chosen ? 'border-blue shadow-[0_0_0_1px_var(--track-blue)]' : 'border-border',
      )}
    >
      <p className="m-0 text-11 leading-[1.5] font-bold tracking-[0.1em] text-ink uppercase">
        {occupation.sector || copy.occupations.careerOption}
      </p>
      <h3 id={headingId} className={ui.cardTitle}>
        {occupation.title}
      </h3>
      <div className="mt-[0.35rem] mb-2 flex items-center gap-4">
        <ScoreRing score={score} label={`${label}: ${score}%`} />
        <div className="flex min-w-0 flex-col gap-[0.2rem]">
          <p className="m-0 text-14 font-[650] text-navy">{label}</p>
          <p className={ui.text}>{copy.occupations.matched(occupation.terms_matched)}</p>
          {/* Title matches carry no count, and few job posts are recorded yet: only a real count shows. */}
          {occupation.open_posts ? (
            <p className={ui.muted}>{copy.occupations.openPosts(occupation.open_posts)}</p>
          ) : null}
        </div>
      </div>
      <Button
        className={cx(button({ variant: chosen ? 'primary' : 'secondary', wide: true }), 'mt-auto')}
        aria-label={`${copy.occupations.explore}: ${occupation.title}`}
        aria-pressed={chosen}
        onPress={onExplore}
      >
        {copy.occupations.explore}
        <Icon name="arrowRight" />
      </Button>
    </article>
  )
}

/** When Skills Bridge's data was read, in Philippine time. */
function retrieved(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
