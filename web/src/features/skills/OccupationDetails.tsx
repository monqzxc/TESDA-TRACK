import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type { Qualification } from '../../api/queries.ts'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { en } from '../../copy/en.ts'
import { occupationQuery } from './api.ts'
import { BridgeQualification } from './BridgeQualification.tsx'
import styles from './SkillsPage.module.css'

const copy = en.skills.details

/**
 * An occupation from Skills Bridge (frontend/skills_bridge_view.py show_occupation_details): its qualifications, a
 * preview of its skills to tick off as already known, and its international mappings. The heading takes focus once
 * it shows.
 */
export function OccupationDetails({
  occupationId,
  catalog,
}: {
  occupationId: number
  catalog: readonly Qualification[]
}) {
  const details = useQuery(occupationQuery(occupationId))
  const heading = useRef<HTMLHeadingElement>(null)
  const [known, setKnown] = useState<ReadonlySet<number>>(new Set())
  const skillsId = useId()
  const mappingsId = useId()
  const standardsId = useId()

  useEffect(() => {
    if (!details.data) return
    heading.current?.scrollIntoView({ block: 'start' })
    heading.current?.focus({ preventScroll: true })
  }, [details.data])

  if (details.isPending) {
    return (
      <p role="status" className={styles.muted}>
        {en.skills.occupations.loading}
      </p>
    )
  }
  if (details.isError) {
    return (
      <p role="alert" className={styles.note}>
        {details.error.message}
      </p>
    )
  }
  const { data } = details.data
  const occupation = data.profile.occupation
  if (!occupation?.title) return <p className={styles.note}>{copy.notFound}</p>

  const standards = data.profile.standards ?? []
  const skills = (data.skills ?? []).filter(
    (skill): skill is typeof skill & { skill_id: number } => typeof skill.skill_id === 'number',
  )
  const remaining = skills.filter((skill) => !known.has(skill.skill_id))
  const benchmarks = data.benchmarks ?? []

  return (
    <section className={styles.occupation} aria-labelledby={`${skillsId}-title`}>
      <h2 id={`${skillsId}-title`} ref={heading} tabIndex={-1} className={styles.occupationTitle}>
        {occupation.title}
      </h2>
      <p className={styles.muted}>{copy.lead}</p>
      {data.warnings.map((warning) => (
        <p key={warning} className={styles.note}>
          {warning}
        </p>
      ))}

      <section aria-labelledby={standardsId}>
        <h3 id={standardsId} className={styles.subheading}>
          {copy.standards}
        </h3>
        {standards.length === 0 ? (
          <p className={styles.muted}>{copy.noStandards}</p>
        ) : (
          <ul className={styles.list}>
            {standards.map((standard, index) => (
              <li key={standard.code ?? index}>
                <BridgeQualification item={standard} catalog={catalog} headingLevel={4} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={skillsId}>
        <h3 id={skillsId} className={styles.subheading}>
          {copy.skills}
        </h3>
        <p className={styles.muted}>{copy.skillsLead}</p>
        {skills.length === 0 ? (
          <p className={styles.muted}>{copy.noSkills}</p>
        ) : (
          <>
            <fieldset className={styles.known}>
              <legend>{copy.known}</legend>
              {skills.map((skill) => (
                <CheckboxRow
                  key={skill.skill_id}
                  isSelected={known.has(skill.skill_id)}
                  onChange={(selected) =>
                    setKnown((current) => {
                      const next = new Set(current)
                      if (selected) next.add(skill.skill_id)
                      else next.delete(skill.skill_id)
                      return next
                    })
                  }
                >
                  {skill.name}
                </CheckboxRow>
              ))}
            </fieldset>
            <p className={styles.muted} aria-live="polite">
              {copy.tally(known.size, remaining.length)}
            </p>
            {remaining.length === 0 ? (
              <p className={styles.note}>{copy.allKnown}</p>
            ) : (
              <div className={styles.tableBox}>
                <table className={styles.table}>
                  <caption className={styles.caption}>{copy.toExplore}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.skill}</th>
                      <th scope="col">{copy.category}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remaining.map((skill) => (
                      <tr key={skill.skill_id}>
                        <td>{skill.name}</td>
                        <td>{category(skill.type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby={mappingsId}>
        <h3 id={mappingsId} className={styles.subheading}>
          {copy.mappings}
        </h3>
        <p className={styles.muted}>{copy.mappingsLead}</p>
        {benchmarks.length === 0 ? (
          <p className={styles.muted}>{copy.noMappings}</p>
        ) : (
          <ul className={styles.list}>
            {benchmarks.map((benchmark, index) => (
              <li key={index} className={styles.card}>
                <span className={styles.level}>
                  {capitalize(benchmark.status) || copy.unspecified}
                </span>
                <h4 className={styles.cardTitle}>{benchmark.title || copy.fallbackMapping}</h4>
                <p className={styles.muted}>
                  {[benchmark.source, benchmark.standard].filter(Boolean).join(' · ') ||
                    copy.noFramework}
                </p>
                <p className={styles.text}>{copy.sampleSkills(benchmark.sample_skills ?? [])}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

/** "soft_skill" as "Soft skill"; none as General. */
function category(type: string | null | undefined): string {
  return capitalize(type?.replace(/_/g, ' ')) || copy.general
}

function capitalize(text: string | null | undefined): string {
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}
