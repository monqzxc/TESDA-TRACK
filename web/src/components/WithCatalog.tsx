import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { qualificationsQuery, type Qualification } from '../api/queries.ts'
import { en } from '../copy/en.ts'
import buttons from '../styles/buttons.module.css'
import { EmptyState } from './EmptyState.tsx'
import { Icon } from './Icon.tsx'
import { QueryBoundary, throwWithoutData } from './QueryBoundary.tsx'
import styles from './WithCatalog.module.css'

interface WithCatalogProps {
  /** The part of the page that needs the catalog, given the whole of it. */
  children: (qualifications: Qualification[]) => ReactNode
  /** Show this instead of children when the catalog has no qualifications yet. */
  emptyState?: boolean
}

/**
 * Its children once the qualifications catalog has loaded. While it loads, it says so; if it can't be loaded, the
 * service-unavailable state takes its place with Try again (as the Streamlit app does for every page but Home). With
 * `emptyState`, an empty catalog shows "New possibilities are on the way" and a Refresh button instead.
 */
export function WithCatalog({ children, emptyState = false }: WithCatalogProps) {
  return (
    <QueryBoundary>
      <CatalogLoader emptyState={emptyState}>{children}</CatalogLoader>
    </QueryBoundary>
  )
}

function CatalogLoader({ children, emptyState }: Required<WithCatalogProps>) {
  const catalog = useQuery({ ...qualificationsQuery, throwOnError: throwWithoutData })
  if (catalog.data === undefined) {
    return (
      <p role="status" className={styles.loading}>
        {en.catalog.loading}
      </p>
    )
  }
  if (emptyState && catalog.data.length === 0) {
    const copy = en.catalog.empty
    return (
      <EmptyState icon="learn" heading={copy.heading} body={copy.body}>
        <Button
          className={buttons.button}
          onPress={() => void catalog.refetch()}
          isPending={catalog.isFetching}
        >
          <Icon name="refresh" />
          {copy.refresh}
        </Button>
      </EmptyState>
    )
  }
  return children(catalog.data)
}
