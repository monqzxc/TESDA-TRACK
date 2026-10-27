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
import { useCopy } from '../../i18n/copy.ts'
import { pageOf } from '../../lib/paging.ts'
import { catalogNames, filterQualifications, sectorsOf } from '../../lib/qualifications.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { useFinderStore } from '../finder/store.ts'
import { QualificationCard } from './QualificationCard.tsx'
import { useLibraryCollection } from './useLibraryCollection.ts'

/** Cards a page: the whole catalog at once (hundreds of cards) is slow on a phone. */
export const LIBRARY_PAGE_SIZE = 12

/** The sector picker's choice for every sector. Sector names have capitals, so it can't clash with one. */
const ALL = 'all'

/**
 * Qualifications Library, at /qualifications (classic/app.py show_library; US-04). The search, the sector and the
 * page are in the address (?q=&sector=&page=), so a search can be shared and Back returns to it.
 */
export default function LibraryPage() {
  const en = useCopy()
  const copy = en.library

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
  const en = useCopy()
  const copy = en.library

  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const startWithGoal = useFinderStore((state) => state.startWithGoal)
  const summary = useRef<HTMLParagraphElement>(null)
  // Set by the pager, so only a move to another page (not a search, nor the first showing) moves focus.
  const pageChanged = useRef(false)
  const filtersId = useId()
  const collection = useLibraryCollection()

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
  const showAll = params.get('view') === 'all'
  const shown = pageOf(
    filtered,
    showAll ? 1 : Number(params.get('page') ?? '1'),
    showAll ? Math.max(1, filtered.length) : LIBRARY_PAGE_SIZE,
  )
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
    setParams(showAll ? new URLSearchParams({ view: 'all' }) : new URLSearchParams(), {
      preventScrollReset: true,
    })
  }

  const toggleView = () => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (showAll) next.delete('view')
        else next.set('view', 'all')
        next.delete('page')
        return next
      },
      { preventScrollReset: true },
    )
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
      {/* After classic/styles.css's .st-key-library_filters: the search beside the sector, on one card. */}
      <section
        data-tour="library-filters"
        aria-labelledby={filtersId}
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 rounded-18 bg-surface p-5 max-[801px]:grid-cols-1 max-xs:rounded-14 max-xs:p-[1.1rem]"
      >
        <h2 id={filtersId} className="sr-only">
          {copy.filters}
        </h2>
        <SearchField
          data-tour="library-search"
          className="flex min-w-0 flex-col gap-[0.35rem]"
          value={query}
          onChange={(value) => setFilter('q', value)}
        >
          <Label className="text-15 font-semibold text-navy">{copy.search}</Label>
          <div className="relative flex items-center">
            <Icon
              name="search"
              className="pointer-events-none absolute left-[0.8rem] text-[1.15rem] text-muted"
            />
            {/* The browser's own clear button would double up with ours. */}
            <Input
              className="min-h-11.5 w-full rounded-12 border border-hover-border bg-surface py-[0.55rem] pr-11 pl-10 text-16 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-hovered:border-blue [&::-webkit-search-cancel-button]:hidden"
              placeholder={copy.searchPlaceholder}
            />
            {query && (
              <Button
                className="absolute right-[0.3rem] grid size-9.5 cursor-pointer place-items-center rounded-9 border-0 bg-transparent text-muted data-hovered:bg-soft data-hovered:text-navy"
                aria-label={copy.clearSearch}
              >
                <Icon name="close" />
              </Button>
            )}
          </div>
        </SearchField>
        <SelectField
          label={copy.sector}
          options={sectorOptions}
          value={sector ?? ALL}
          onChange={(value) => setFilter('sector', value === ALL ? undefined : value)}
        />
      </section>

      <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p
          ref={summary}
          tabIndex={-1}
          className="m-0 scroll-mt-4 text-14 text-muted focus:outline-none"
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
        <div className="flex flex-wrap items-center gap-2">
          {qualifications.length > LIBRARY_PAGE_SIZE && (
            <Button
              className={button({ variant: 'tertiary' })}
              onPress={toggleView}
              aria-pressed={showAll}
            >
              {showAll ? copy.collection.showPages : copy.collection.showAll}
            </Button>
          )}
          {isFiltered && (
            <Button className={button({ variant: 'tertiary' })} onPress={clearFilters}>
              <Icon name="filterOff" />
              {copy.clear}
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="search" heading={copy.empty.heading} body={copy.empty.body} />
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 max-[801px]:grid-cols-1">
          {shown.items.map((qualification) => (
            <li key={qualification.code}>
              <QualificationCard
                qualification={qualification}
                catalogNames={names}
                onExplore={() => explore(qualification)}
                collection={
                  collection.isSignedIn
                    ? {
                        added: collection.saved.has(qualification.code),
                        pending:
                          collection.add.isPending &&
                          collection.add.variables?.code === qualification.code,
                        disabled: collection.loading || collection.add.isPending,
                        error:
                          collection.add.isError &&
                          collection.add.variables?.code === qualification.code
                            ? collection.add.error
                            : null,
                        onAdd: () => collection.add.mutate(qualification),
                      }
                    : undefined
                }
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
