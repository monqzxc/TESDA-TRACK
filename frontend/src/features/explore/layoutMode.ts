// Which Career Map layout to show: the guided chat layout, or the classic panel. Chosen per visit with
// ?layout=guided|classic (kept in sessionStorage), else the build's VITE_EXPLORE_LAYOUT, else classic.

export type LayoutMode = 'guided' | 'classic'
export const LAYOUT_KEY = 'tesda-track.explore-layout'

const isMode = (value: unknown): value is LayoutMode => value === 'guided' || value === 'classic'

export function layoutMode(search: string, fallback: string | undefined): LayoutMode {
  const asked = new URLSearchParams(search).get('layout')
  if (isMode(asked)) {
    try {
      sessionStorage.setItem(LAYOUT_KEY, asked)
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
    return asked
  }
  try {
    const saved = sessionStorage.getItem(LAYOUT_KEY)
    if (isMode(saved)) return saved
  } catch {
    // Storage blocked: fall through to the build's default.
  }
  return isMode(fallback) ? fallback : 'classic'
}
