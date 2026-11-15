import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { api } from '../../api/client.ts'
import { ApiError, unwrap } from '../../api/errors.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { useCopy } from '../../i18n/copy.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'

const PAGE_SIZE = 25

export default function SuggestionReportInbox() {
  const { learner } = useAuth()
  const copy = useCopy().suggestionFeedback
  const [offset, setOffset] = useState(0)
  const reports = useQuery({
    queryKey: ['suggestion-reports', learner?.id, offset],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/feedback/suggestions/reports', { params: { query: { offset } }, signal }),
      ),
    enabled: Boolean(learner),
    retry: false,
    gcTime: 0,
  })
  const forbidden = reports.error instanceof ApiError && reports.error.status === 403

  return (
    <section
      aria-labelledby="suggestion-report-heading"
      className="rounded-18 border border-border bg-surface p-5 max-xs:p-4"
    >
      <h1 id="suggestion-report-heading" className="m-0 text-20 text-navy">
        Wrong-suggestion reports
      </h1>
      {!learner && (
        <Link
          to={`${paths.signIn}?next=${encodeURIComponent(paths.suggestionReports)}`}
          className={button()}
        >
          Sign in to review reports
        </Link>
      )}
      {learner && reports.isPending && <p role="status">Loading reports…</p>}
      {reports.isError && (
        <div role="alert">
          <p>{failureMessage(reports.error)}</p>
          {!forbidden && (
            <Button className={button()} onPress={() => void reports.refetch()}>
              Retry
            </Button>
          )}
        </div>
      )}
      {learner && !reports.isError && reports.data && (
        <>
          <p className="text-14 text-muted">Assigned to {learner.email ?? learner.full_name}</p>
          {reports.data.length === 0 && <p>No reports on this page.</p>}
          <ul className="m-0 list-none p-0">
            {reports.data.map((report) => (
              <li key={report.receipt} className="border-t border-rule py-3">
                <h3 className="m-0 text-16 wrap-anywhere text-navy">{report.result_name}</h3>
                <p className="my-1 text-14 text-ink">{copy.reasons[report.reason]}</p>
                <p className="my-1 text-13 text-muted">
                  {[
                    report.result_kind,
                    report.qualification_code,
                    new Date(report.created_at).toLocaleString(),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {report.shared_goal && (
                  <p className="my-1 text-14 wrap-anywhere text-ink">
                    Goal shared with consent — “{report.shared_goal}”
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {offset > 0 && (
              <Button className={button()} onPress={() => setOffset(offset - PAGE_SIZE)}>
                Previous
              </Button>
            )}
            {reports.data.length === PAGE_SIZE && (
              <Button className={button()} onPress={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
