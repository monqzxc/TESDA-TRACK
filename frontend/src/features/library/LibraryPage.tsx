import { useEffect, useId, useMemo, useRef } from 'react'
import { Button, Input, Label, SearchField } from 'react-aria-components'
import { useNavigate, useSearchParams } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Icon } from '../../components/Icon.tsx'
import { PageHero } from '../../components/PageHero.tsx'
import { Pager } from '../../components/Pager.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { en } from '../../copy/en.ts'
import { pageOf } from '../../lib/paging.ts'
import { catalogNames, filterQualifications, sectorsOf } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import utilities from '../../styles/utilities.module.css'
import { useFinderStore } from '../finder/store.ts'
import { QualificationCard } from './QualificationCard.tsx'
import styles from './LibraryPage.module.css'

const copy = en.library

/** Cards a page: the whole catalog at once (hundreds of cards) is slow on a phone. */
export const LIBRARY_PAGE_SIZE = 12

/** The sector picker's choice for every sector. Sector names have capitals, so it can't clash with one. */
const ALL = 'all'

/**
 * Qualifications Library, at /qualifications (classic/app.py show_library; US-04). The search, the sector and the
 * page are in the address (?q=&sector=&page=), so a search can be shared and Back returns to it.
 */
export default function LibraryPage() {
  const page = en.pages.qualifications
  return (
    <>
      <PageHero
        heading={page.heading}
        title={copy.hero.title}
        accent={copy.hero.accent}
        lead={page.lead}
        art="books"
      />
      <WithCatalog emptyState>
        {(qualifications) => <Library qualifications={qualifications} />}
      </WithCatalog>
    </>
  )
}

function Library({ qualifications }: { qualifications: Qualification[] }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const startWithGoal = useFinderStore((state) => state.startWithGoal)
  const summary = useRef<HTMLParagraphElement>(null)
  // Set by the pager, so only a move to another page (not a search, nor the first showing) moves focus.
  const pageChanged = useRef(false)
  const filtersId = useId()

  const sectors = useMemo(() => sectorsOf(qualifications), [qualifications])
  const names = useMemo(() => catalogNames(qualifications), [qualifications])
  const query = params.get('q') ?? ''
  const sectorParam = params.get('sector')
  // An address with a sector the catalog doesn't have shows every sector.
  const sector = sectorParam !== null && sectors.includes(sectorParam) ? sectorParam : undefined
  const filtered = useMemo(
    () => filterQualifications(qualifications, { query, sector }),
    [qualifications, query, sector],
  )
  const shown = pageOf(filtered, Number(params.get('page') ?? '1'), LIBRARY_PAGE_SIZE)
  const isFiltered = query.trim() !== '' || sector !== undefined

  /** A new search or sector starts again at the first page. Typing replaces the address rather than adding to it. */
  const setFilter = (name: 'q' | 'sector', value: string | undefined) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(name, value)
        else next.delete(name)
        next.delete('page')
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  }

  const clearFilters = () => {
    setParams(new URLSearchParams(), { preventScrollReset: true })
  }

  const pageAddress = (page: number) => {
    const next = new URLSearchParams(params)
    if (page > 1) next.set('page', String(page))
    else next.delete('page')
    const search = next.toString()
    return search ? `?${search}` : '?'
  }

  /** A new page opens at the results, with focus on their count, so the keyboard carries on from the top. */
  useEffect(() => {
    if (!pageChanged.current) return
    pageChanged.current = false
    summary.current?.scrollIntoView({ block: 'start' })
    summary.current?.focus({ preventScroll: true })
  }, [shown.page])

  const explore = (qualification: Qualification) => {
    startWithGoal(copy.exploreGoal(qualification.name))
    void navigate(paths.finder)
  }

  const sectorOptions = [
    { id: ALL, label: copy.allSectors },
    ...sectors.map((name) => ({ id: name, label: name })),
  ]

  return (
    <>
      <section aria-labelledby={filtersId} className={styles.filters}>
        <h2 id={filtersId} className={utilities.visuallyHidden}>
          {copy.filters}
        </h2>
        <SearchField
          className={styles.search}
          value={query}
          onChange={(value) => setFilter('q', value)}
        >
          <Label className={styles.label}>{copy.search}</Label>
          <div className={styles.searchBox}>
            <Icon name="search" className={styles.searchIcon} />
            <Input className={styles.input} placeholder={copy.searchPlaceholder} />
            {query && (
              <Button className={styles.clearSearch} aria-label={copy.clearSearch}>
                <Icon name="close" />
              </Button>
            )}
          </div>
        </SearchField>
        <SelectField
          className={styles.sector}
          label={copy.sector}
          options={sectorOptions}
          value={sector ?? ALL}
          onChange={(value) => setFilter('sector', value === ALL ? undefined : value)}
        />
      </section>

      <div className={styles.summaryRow}>
        <p
          ref={summary}
          tabIndex={-1}
          className={styles.summary}
          aria-live="polite"
          aria-atomic="true"
        >
          {[
            copy.count(filtered.length, qualifications.length),
            shown.pages > 1 && copy.showing(shown.first, shown.last),
            isFiltered ? copy.filtered : copy.unfiltered,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {isFiltered && (
          <Button className={cx(buttons.button, buttons.tertiary)} onPress={clearFilters}>
            <Icon name="filterOff" />
            {copy.clear}
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="search" heading={copy.empty.heading} body={copy.empty.body} />
      ) : (
        <ul className={styles.cards}>
          {shown.items.map((qualification) => (
            <li key={qualification.code}>
              <QualificationCard
                qualification={qualification}
                catalogNames={names}
                onExplore={() => explore(qualification)}
              />
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={shown.page}
        pages={shown.pages}
        to={pageAddress}
        onNavigate={() => {
          pageChanged.current = true
        }}
      />
    </>
  )
}
