import { create } from 'zustand'

interface SidebarState {
  /** The sidebar is folded away by its burger, so the page has the whole window. */
  folded: boolean
  setFolded: (folded: boolean) => void
}

/** The sidebar beside every page (AppLayout): folded or not, for the visit, so it stays as it was from page to page. */
export const useSidebarStore = create<SidebarState>()((set) => ({
  folded: false,
  setFolded: (folded) => set({ folded }),
}))
