import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type { Qualification } from '../../api/queries.ts'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { useCopy, getCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { occupationQuery } from './api.ts'
import { BridgeQualification } from './BridgeQualification.tsx'
import { ui } from './styles.ts'

const subheading = 'mt-0 mb-[0.35rem] text-[1.15rem] text-navy'

/**
 * An occupation from Skills Bridge (classic/skills_bridge_view.py show_occupation_details): its qualifications, a
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
  const en = useCopy()
  const copy = en.skills.details

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
      <p role="status" className={ui.muted}>
        {en.skills.occupations.loading}
      </p>
    )
  }
  if (details.isError) {
    return (
      <p role="alert" className={ui.note}>
        {details.error.message}
      </p>
    )
  }
  const { data } = details.data
  const occupation = data.profile.occupation
  if (!occupation?.title) return <p className={ui.note}>{copy.notFound}</p>

  const standards = data.profile.standards ?? []
  const skills = (data.skills ?? []).filter(
    (skill): skill is typeof skill & { skill_id: number } => typeof skill.skill_id === 'number',
  )
  const remaining = skills.filter((skill) => !known.has(skill.skill_id))
  const benchmarks = data.benchmarks ?? []

  return (
    <section
      className="flex flex-col gap-5 border-t border-border pt-5"
      aria-labelledby={`${skillsId}-title`}
    >
      <h2
        id={`${skillsId}-title`}
        ref={heading}
        tabIndex={-1}
        className="m-0 scroll-mt-4 font-display text-[1.6rem] leading-[1.25] text-navy focus:outline-none"
      >
        {occupation.title}
      </h2>
      <p className={cx(ui.muted, 'mt-[-0.9rem]')}>{copy.lead}</p>
      {data.warnings.map((warning) => (
        <p key={warning} className={ui.note}>
          {warning}
        </p>
      ))}

      <section aria-labelledby={standardsId}>
        <h3 id={standardsId} className={subheading}>
          {copy.standards}
        </h3>
        {standards.length === 0 ? (
          <p className={cx(ui.muted, 'mb-3')}>{copy.noStandards}</p>
        ) : (
          <ul className={ui.list}>
            {standards.map((standard, index) => (
              <li key={standard.code ?? index}>
                <BridgeQualification item={standard} catalog={catalog} headingLevel={4} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={skillsId}>
        <h3 id={skillsId} className={subheading}>
          {copy.skills}
        </h3>
        <p className={cx(ui.muted, 'mb-3')}>{copy.skillsLead}</p>
        {skills.length === 0 ? (
          <p className={ui.muted}>{copy.noSkills}</p>
        ) : (
          <>
            <fieldset className="mx-0 mt-0 mb-[0.6rem] grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-[0.15rem] rounded-14 border border-border bg-surface px-4 py-[0.85rem]">
              <legend className="px-[0.35rem] text-15 font-[650] text-navy">{copy.known}</legend>
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
            <p className={ui.muted} aria-live="polite">
              {copy.tally(known.size, remaining.length)}
            </p>
            {remaining.length === 0 ? (
              <p className={ui.note}>{copy.allKnown}</p>
            ) : (
              <div className={ui.tableBox}>
                <table className={ui.table}>
                  <caption className={ui.caption}>{copy.toExplore}</caption>
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
        <h3 id={mappingsId} className={subheading}>
          {copy.mappings}
        </h3>
        <p className={cx(ui.muted, 'mb-3')}>{copy.mappingsLead}</p>
        {benchmarks.length === 0 ? (
          <p className={ui.muted}>{copy.noMappings}</p>
        ) : (
          <ul className={ui.list}>
            {benchmarks.map((benchmark, index) => (
              <li key={index} className={ui.card}>
                <span className={ui.level}>{capitalize(benchmark.status) || copy.unspecified}</span>
                <h4 className={ui.cardTitle}>{benchmark.title || copy.fallbackMapping}</h4>
                <p className={ui.muted}>
                  {[benchmark.source, benchmark.standard].filter(Boolean).join(' · ') ||
                    copy.noFramework}
                </p>
                <p className={ui.text}>{copy.sampleSkills(benchmark.sample_skills ?? [])}</p>
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
  const en = getCopy()
  const copy = en.skills.details

  return capitalize(type?.replace(/_/g, ' ')) || copy.general
}

function capitalize(text: string | null | undefined): string {
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}
