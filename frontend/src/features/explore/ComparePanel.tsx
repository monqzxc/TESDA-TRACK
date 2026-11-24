import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
import { compareColumns, type CompareColumn } from './compare.ts'
import type { Explore } from './useExplore.ts'

/**
 * The search's qualifications side by side (only those picked, once any are): how the learner's Skill Passport fits each (when they have one), then what
 * each course involves near them. Values no source lists show a dash, never a guess.
 */
export function ComparePanel({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.compare
  // Nothing to compare with one match, or with one qualification chosen from the library.
  if (explore.search?.chosen || explore.allMatches.length < 2) return null
  const columns = compareColumns({
    matches: explore.matches,
    centers: explore.centers,
    rangeKm: explore.rangeKm,
    hasReference: explore.reference !== null,
    fits: explore.fits,
    catalog: explore.catalog,
  })
  const hasPassport = Boolean(explore.passport)

  const fitText = (column: CompareColumn) =>
    column.fit === undefined
      ? copy.checking
      : column.fit === null
        ? copy.noFit
        : `${column.fit.score} · ${copy.step[column.fit.next_step]}`
  const rows: [string, (column: CompareColumn) => ReactNode][] = [
    ...(hasPassport
      ? ([
          [copy.rowFit, fitText],
          [
            copy.rowCore,
            (column) =>
              column.coreHave !== null && column.coreTotal
                ? copy.coreOf(column.coreHave, column.coreTotal)
                : copy.none,
          ],
        ] as [string, (column: CompareColumn) => ReactNode][])
      : []),
    [
      copy.rowHours,
      ({ hours }) =>
        !hours ? copy.none : hours.min === hours.max ? `${hours.min}` : `${hours.min}–${hours.max}`,
    ],
    [
      copy.rowCenters,
      ({ trainNear, assessNear }) =>
        trainNear === null || assessNear === null
          ? copy.none
          : copy.centersValue(trainNear, assessNear),
    ],
    [
      copy.rowScholarship,
      ({ scholarship }) => (scholarship === null ? copy.none : scholarship ? copy.yes : copy.no),
    ],
    [copy.rowJobs, ({ jobs }) => (jobs.length ? jobs.join(', ') : copy.none)],
  ]

  return (
    <section aria-label={copy.title} className="flex flex-col gap-2 rounded-12 bg-panel p-3">
      <h3 className="m-0 text-14 font-semibold text-navy">{copy.title}</h3>
      {/* A wide table scrolls inside its own box: the page never scrolls sideways on a phone. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-collapse text-left text-13 leading-[1.4] text-ink">
          <thead>
            <tr>
              <td className="sticky left-0 bg-panel" />
              {columns.map((column) => (
                <th
                  key={column.code}
                  scope="col"
                  className="min-w-[8.5rem] px-2 pb-2 align-bottom font-semibold text-navy"
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 min-w-[7rem] bg-panel py-2 pr-2 align-top font-semibold text-muted"
                >
                  {label}
                </th>
                {columns.map((column) => (
                  <td key={column.code} className="px-2 py-2 align-top">
                    {value(column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hasPassport && (
        <Link
          to={explore.learnerId ? paths.profile : paths.signIn}
          className="text-13 font-semibold text-navy underline underline-offset-2"
        >
          {copy.signIn}
        </Link>
      )}
    </section>
  )
}
