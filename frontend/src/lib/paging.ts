// Showing a long list a page at a time (classic/portal/journey.py: page_count, page_items).

/** How many pages `total` items fill, at least one. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage))
}

/** A page number read from an address: a whole number from 1 to `pages`, or 1 when it isn't one. */
export function clampPage(page: number, pages: number): number {
  return Number.isInteger(page) ? Math.min(Math.max(page, 1), pages) : 1
}

export interface Page<T> {
  items: T[]
  /** The page shown, after clamping. */
  page: number
  pages: number
  /** The first item's place in the whole list, counting from 1 (0 when the list is empty). */
  first: number
  /** The last item's place in the whole list. */
  last: number
}

/** One page of `items`. A page past the end shows the last page; anything that isn't a page shows the first. */
export function pageOf<T>(items: readonly T[], page: number, perPage: number): Page<T> {
  const pages = pageCount(items.length, perPage)
  const current = clampPage(page, pages)
  const start = (current - 1) * perPage
  const shown = items.slice(start, start + perPage)
  return {
    items: shown,
    page: current,
    pages,
    first: shown.length ? start + 1 : 0,
    last: start + shown.length,
  }
}
