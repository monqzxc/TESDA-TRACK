import { useQuery } from '@tanstack/react-query'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import {
  applicationsQuery,
  certificationsQuery,
  checksQuery,
  goalsQuery,
  pathwaysQuery,
  sessionsQuery,
} from '../progress/api.ts'
import { Activity } from '../progress/Activity.tsx'
import { Certifications, Goals } from '../progress/GoalsAndCertifications.tsx'
import { Applications } from '../progress/Records.tsx'

/** Each profile section loads its own records only when the learner opens it. */
export function ProfileActivity() {
  const copy = useCopy().progress
  const sessions = useQuery({ ...sessionsQuery, throwOnError: throwWithoutData })
  const checks = useQuery({ ...checksQuery, throwOnError: throwWithoutData })
  const pathways = useQuery({ ...pathwaysQuery, throwOnError: throwWithoutData })
  const applications = useQuery({ ...applicationsQuery, throwOnError: throwWithoutData })
  const goals = useQuery({ ...goalsQuery, throwOnError: throwWithoutData })
  const certifications = useQuery({ ...certificationsQuery, throwOnError: throwWithoutData })

  if (
    !sessions.data ||
    !checks.data ||
    !pathways.data ||
    !applications.data ||
    !goals.data ||
    !certifications.data
  ) {
    return (
      <p role="status" className="text-17 text-muted">
        {copy.loading}
      </p>
    )
  }

  return (
    <Activity
      sessions={sessions.data}
      checks={checks.data}
      enrollments={pathways.data}
      applications={applications.data}
      goals={goals.data}
      certifications={certifications.data}
    />
  )
}

export function ProfileGoalsAndCertifications() {
  return (
    <WithCatalog>
      {(catalog) => (
        <div className="grid grid-cols-2 items-start gap-4 max-xl:grid-cols-1">
          <Goals catalog={catalog} />
          <Certifications catalog={catalog} />
        </div>
      )}
    </WithCatalog>
  )
}

export function ProfileApplications() {
  const en = useCopy()
  const applications = useQuery({ ...applicationsQuery, throwOnError: throwWithoutData })
  if (!applications.data) {
    return (
      <p role="status" className="text-17 text-muted">
        {en.progress.loading}
      </p>
    )
  }
  return <Applications applications={applications.data} />
}
