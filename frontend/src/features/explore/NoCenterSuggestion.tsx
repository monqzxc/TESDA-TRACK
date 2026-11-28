import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import type { Match } from '../finder/api.ts'

/**
 * No center lists the qualification anywhere (QA-2026-11-28-NEW4, US-0014 AC5). A wider range can't help, so instead
 * of a dead end the learner gets ways to widen the search: the other qualifications of the same sector in the library,
 * and the TESDA office to ask which providers plan to offer it.
 */
export function NoCenterSuggestion({ match, className }: { match: Match; className?: string }) {
  const copy = useCopy().explore.results
  const { name, sector } = match.qualification
  return (
    <div
      data-testid="none-anywhere"
      role="status"
      className={cx(
        'flex flex-col items-start gap-2 rounded-12 border border-border bg-surface p-3',
        className,
      )}
    >
      <p className="m-0 text-13 leading-[1.45] text-ink">{copy.noCenterAnywhere(name)}</p>
      {sector && (
        <Link
          to={`${paths.qualifications}?sector=${encodeURIComponent(sector)}`}
          className="inline-flex min-h-9 items-center gap-1 rounded-10 border border-border bg-surface px-3 py-1.5 text-left text-13 font-semibold text-blue no-underline hover:border-navy data-hovered:border-navy"
        >
          {copy.noCenterSector(sector)}
          <Icon name="arrowRight" />
        </Link>
      )}
      <p className="m-0 text-13 leading-[1.45] text-muted">{copy.noCenterAsk}</p>
    </div>
  )
}
