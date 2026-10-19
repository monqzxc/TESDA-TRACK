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
import buttons from '../../styles/buttons.module.css'
import utilities from '../../styles/utilities.module.css'
import { clientConfigQuery } from '../training/api.ts'
import { explore, type Exploration, type OccupationMatch } from './api.ts'
import { BridgeQualification } from './BridgeQualification.tsx'
import { OccupationDetails } from './OccupationDetails.tsx'
import styles from './SkillsPage.module.css'

const copy = en.skills

/** The sentence box's limit, as the API takes it. */
const TEXT_MAX_LENGTH = 500

const ABOUT_URL = 'https://skills-bridge.ph'

/**
 * Skills Explorer, at /skills (frontend/skills_bridge_view.py show_skills_bridge): a short sentence of skills or
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
      <section aria-labelledby={headingId} className={styles.search}>
        <h2 id={headingId} className={utilities.visuallyHidden}>
          {copy.search.label}
        </h2>
        {/* Enter makes a new line, as the sentence may be a list of terms. */}
        <form onSubmit={submit} noValidate className={styles.form}>
          <TextField
            className={styles.field}
            value={text}
            onChange={(value) => {
              setText(value)
              setError(null)
            }}
            maxLength={TEXT_MAX_LENGTH}
            isInvalid={error !== null}
            validationBehavior="aria"
          >
            <Label className={styles.label}>{copy.search.label}</Label>
            <TextArea
              ref={field}
              className={styles.textarea}
              placeholder={copy.search.placeholder}
            />
            <div className={styles.under}>
              <Text slot="description" className={styles.muted}>
                {copy.search.help}{' '}
                <span className={utilities.visuallyHidden}>
                  {en.home.closing.countLabel(text.length, TEXT_MAX_LENGTH)}
                </span>
              </Text>
              <span className={styles.counter} aria-hidden="true">
                {`${text.length}/${TEXT_MAX_LENGTH}`}
              </span>
            </div>
            <FieldError className={styles.error}>{error}</FieldError>
          </TextField>
          <p className={styles.privacy}>
            <Icon name="info" />
            {copy.search.privacy}
          </p>
          <Button
            type="submit"
            className={cx(buttons.button, buttons.primary, styles.submit)}
            isPending={search.isPending}
          >
            <Icon name="search" />
            {search.isPending ? copy.search.pending : copy.search.submit}
          </Button>
        </form>
        {search.isError && (
          <div role="alert" className={styles.failure}>
            <p>{failureMessage(search.error)}</p>
            <p>{copy.search.stillAvailable}</p>
          </div>
        )}
      </section>

      <p role="status" className={utilities.visuallyHidden}>
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
    <div className={styles.results}>
      <div className={styles.summary}>
        <p className={styles.searched}>{results.searched(found.terms)}</p>
        {found.retrieved_at && (
          <p className={styles.muted}>{results.source(retrieved(found.retrieved_at))}</p>
        )}
        {roles.length > 0 && (
          <p className={styles.muted}>
            {skills.length > 0 ? results.treatedBoth(roles, skills) : results.treatedRoles(roles)}
          </p>
        )}
        {found.unmatched.length > 0 && (
          <p className={styles.note}>{results.unmatched(found.unmatched)}</p>
        )}
        {found.resolution.length > 0 && (
          <details className={styles.details}>
            <summary>
              <Icon name="search" />
              {results.understood}
              <Icon name="chevron" className={styles.chevron} />
            </summary>
            <ul className={styles.resolution}>
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

      <section aria-labelledby={occupationsId}>
        <h2 id={occupationsId} className={styles.sectionHeading}>
          {copy.occupations.heading}
        </h2>
        <p className={styles.lead}>
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
          <ul className={styles.occupations}>
            {occupations.map((occupation) => (
              <li key={occupation.occupation_id}>
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
        <section aria-labelledby={linkedId}>
          <h2 id={linkedId} className={styles.sectionHeading}>
            {copy.linked.heading}
          </h2>
          {qualifications.length === 0 ? (
            <p className={styles.muted}>{copy.linked.none}</p>
          ) : (
            <ul className={styles.list}>
              {qualifications.map((item, index) => (
                <li key={item.code ?? index}>
                  <BridgeQualification item={item} catalog={catalog} headingLevel={3} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        <p className={styles.muted}>{copy.footer}</p>
        <a className={buttons.button} href={ABOUT_URL} target="_blank" rel="noopener noreferrer">
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
      className={cx(styles.card, styles.role, chosen && styles.chosen)}
    >
      <p className={styles.kicker}>{occupation.sector || copy.occupations.careerOption}</p>
      <h3 id={headingId} className={styles.cardTitle}>
        {occupation.title}
      </h3>
      <div className={styles.match}>
        <ScoreRing score={score} label={`${label}: ${score}%`} />
        <div className={styles.matchText}>
          <p className={styles.matchLabel}>{label}</p>
          <p className={styles.text}>{copy.occupations.matched(occupation.terms_matched)}</p>
          {/* Title matches carry no count, and few job posts are recorded yet: only a real count shows. */}
          {occupation.open_posts ? (
            <p className={styles.muted}>{copy.occupations.openPosts(occupation.open_posts)}</p>
          ) : null}
        </div>
      </div>
      <Button
        className={cx(buttons.button, buttons.wide, chosen && buttons.primary, styles.explore)}
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
