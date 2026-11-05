import { useEffect, useId, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { coreSkills, type Occupation } from './occupations.ts'
import { card, cardHeading, muted } from './styles.ts'

interface RelatedOccupationsProps {
  occupations: readonly Occupation[]
  /** Training & Assessment for a qualification. */
  centersFor: (code: string) => string
  onCheck: (code: string) => void
}

/**
 * A skills search's related occupations (US-20), before a qualification is chosen: the jobs the matches lead to as
 * the catalog names them. Choosing one shows the qualifications that lead to it, each with its core skills, a
 * readiness check and its training centers. One occupation is open at a time; its heading takes focus.
 */
export function RelatedOccupations({ occupations, centersFor, onCheck }: RelatedOccupationsProps) {
  const en = useCopy()
  const copy = en.finder.occupations

  const [openKey, setOpenKey] = useState<string | null>(null)
  const headingId = useId()
  const panelId = useId()
  const panelHeading = useRef<HTMLHeadingElement>(null)
  const open = occupations.find((occupation) => occupation.key === openKey) ?? null

  useEffect(() => {
    if (openKey) panelHeading.current?.focus()
  }, [openKey])

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
        <p className={cx(muted, 'mt-1')}>{copy.lead}</p>
      </div>
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

      {open && (
        <div id={panelId} className="flex flex-col gap-3 rounded-12 bg-panel p-4 max-xs:p-3">
          <div>
            <h4
              ref={panelHeading}
              tabIndex={-1}
              className="m-0 text-17 leading-[1.35] font-bold text-navy outline-none"
            >
              {open.title}
            </h4>
            <p className={cx(muted, 'mt-1')}>{copy.leadsTo(open.qualifications.length)}</p>
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-md:grid-cols-1">
            {open.qualifications.map((qualification) => {
              const skills = coreSkills(qualification)
              return (
                <li
                  key={qualification.code}
                  className="flex min-w-0 flex-col gap-2 rounded-12 border border-border bg-surface p-4"
                >
                  <p className="m-0 text-13 text-muted">{qualification.sector}</p>
                  <p className="m-0 text-15 leading-[1.4] font-bold wrap-anywhere text-navy">
                    {qualification.name}
                  </p>
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
                    <p className={muted}>{copy.noSkills}</p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      className={button({ variant: 'secondary' })}
                      aria-label={`${en.finder.matches.check}: ${qualification.name}`}
                      onPress={() => onCheck(qualification.code)}
                    >
                      {en.finder.matches.check}
                      <Icon name="arrowRight" />
                    </Button>
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
      )}
    </section>
  )
}
