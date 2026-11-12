import { create } from 'zustand'

interface SidebarState {
  /** The sidebar is open over the page (Sidebar.tsx). */
  open: boolean
  /** The burger that opened it, where focus goes back when it closes. */
  opener: HTMLElement | null
  openMenu: (opener: HTMLElement | null) => void
  /** Closes it and hands focus back to its burger, unless focus is going elsewhere (to a new page's heading). */
  closeMenu: (options?: { restoreFocus?: boolean }) => void
}

/** The app's one sidebar, opened from any page's burger: the top bar's, or the Career Map's search bar's. */
export const useSidebarStore = create<SidebarState>()((set, get) => ({
  open: false,
  opener: null,
  openMenu: (opener) => set({ open: true, opener }),
  closeMenu: ({ restoreFocus = true } = {}) => {
    const { open, opener } = get()
    if (!open) return
    set({ open: false, opener: null })
    if (restoreFocus && opener?.isConnected) opener.focus()
  },
}))
