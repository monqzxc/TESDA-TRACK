import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { qualificationsQuery } from '../api/queries.ts'
import { en } from '../copy/en.ts'
import { useCurrentPage } from '../lib/navigation.ts'
import { PageHeading } from './PageHeading.tsx'
import { QueryBoundary, throwWithoutData } from './QueryBoundary.tsx'
import styles from './Placeholder.module.css'

type PlaceholderProps = {
  /**
   * The page can't work without the qualifications catalog. The Streamlit app loads it before every page but Home,
   * and shows the service-unavailable state instead of the page when it can't.
   */
  needsCatalog?: boolean
}

/** A page still to be built: its heading (from its route's handle) and a line on what's coming. */
export function Placeholder({ needsCatalog = false }: PlaceholderProps) {
  const page = useCurrentPage()
  if (!page) return null
  const copy = en.pages[page]
  const lead = <p className={styles.lead}>{copy.lead}</p>
  return (
    <div className={styles.placeholder}>
      <PageHeading>{copy.heading}</PageHeading>
      {needsCatalog ? (
        <QueryBoundary>
          <RequireCatalog>{lead}</RequireCatalog>
        </QueryBoundary>
      ) : (
        lead
      )}
    </div>
  )
}

/** Its children once the catalog has loaded. A failure goes to the QueryBoundary around it. */
function RequireCatalog({ children }: { children: ReactNode }) {
  const catalog = useQuery({ ...qualificationsQuery, throwOnError: throwWithoutData })
  if (catalog.data === undefined) {
    return (
      <p role="status" className={styles.lead}>
        {en.catalog.loading}
      </p>
    )
  }
  return children
}
