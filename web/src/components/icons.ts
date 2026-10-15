// The icons from frontend/presentation.py's icon(), plus a few for the app shell, drawn on a 24 by 24 grid with a
// 1.7 stroke in currentColor (see Icon.tsx). Shapes are data, not markup, so nothing here is ever parsed as HTML.

export type IconShape =
  | { readonly tag: 'path'; readonly d: string; readonly filled?: boolean }
  | { readonly tag: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly tag: 'rect'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly rx?: number
    }

export const icons = {
  route: [
    { tag: 'path', d: 'M5 19h5a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h10m-4 0 4 0 0 4' },
    { tag: 'circle', cx: 5, cy: 19, r: 2 },
  ],
  learn: [{ tag: 'path', d: 'm2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6m4-3v9' }],
  award: [
    { tag: 'circle', cx: 12, cy: 8, r: 5 },
    { tag: 'path', d: 'm8 12-2 9 6-3 6 3-2-9' },
  ],
  growth: [{ tag: 'path', d: 'M4 19V5m0 14h16M7 14l5-5 4 3 5-7m-5 0h5v5' }],
  search: [
    { tag: 'circle', cx: 10, cy: 10, r: 6 },
    { tag: 'path', d: 'm15 15 6 6' },
  ],
  cloud: [
    { tag: 'path', d: 'M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10h-1M12 13v4m0 3v1' },
  ],
  target: [
    { tag: 'circle', cx: 11, cy: 13, r: 8 },
    { tag: 'circle', cx: 11, cy: 13, r: 4 },
    { tag: 'path', d: 'm11 13 9-9m-4 0h4v4' },
  ],
  person: [
    { tag: 'circle', cx: 12, cy: 8, r: 4 },
    { tag: 'path', d: 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7' },
  ],
  compass: [
    { tag: 'circle', cx: 12, cy: 12, r: 9 },
    { tag: 'path', d: 'm15.5 8.5-2 5-5 2 2-5 5-2Z' },
  ],
  bars: [
    { tag: 'rect', x: 4, y: 13, width: 4, height: 7, rx: 1 },
    { tag: 'rect', x: 10, y: 8, width: 4, height: 12, rx: 1 },
    { tag: 'rect', x: 16, y: 3, width: 4, height: 17, rx: 1 },
  ],
  document: [
    { tag: 'path', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z' },
    { tag: 'path', d: 'M14 3v5h5M9 13h6M9 17h6' },
  ],
  clipboard: [
    { tag: 'path', d: 'M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2' },
    { tag: 'rect', x: 9, y: 2.5, width: 6, height: 3.5, rx: 1 },
    { tag: 'path', d: 'M8.5 11h7M8.5 15h7' },
  ],
  briefcase: [
    { tag: 'rect', x: 3, y: 7, width: 18, height: 13, rx: 2 },
    { tag: 'path', d: 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18M10.5 12.5v1.5h3v-1.5' },
  ],
  clock: [
    { tag: 'circle', cx: 12, cy: 12, r: 9 },
    { tag: 'path', d: 'M12 7v5l3 2' },
  ],
  sparkle: [
    {
      tag: 'path',
      d: 'M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z',
      filled: true,
    },
    {
      tag: 'path',
      d: 'M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z',
      filled: true,
    },
  ],
  check: [
    { tag: 'circle', cx: 12, cy: 12, r: 9 },
    { tag: 'path', d: 'm8 12.3 2.7 2.7L16 9.5' },
  ],
  lightbulb: [
    {
      tag: 'path',
      d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
    },
  ],
  info: [
    { tag: 'circle', cx: 12, cy: 12, r: 9 },
    { tag: 'path', d: 'M12 11v5.5M12 7.6v.4' },
  ],
  checklist: [
    {
      tag: 'path',
      d: 'm4 6 1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9',
    },
  ],
  pin: [
    { tag: 'path', d: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z' },
    { tag: 'circle', cx: 12, cy: 10, r: 2.3 },
  ],
  network: [
    { tag: 'circle', cx: 12, cy: 12, r: 2.6 },
    { tag: 'circle', cx: 5, cy: 6, r: 2 },
    { tag: 'circle', cx: 19, cy: 6, r: 2 },
    { tag: 'circle', cx: 5, cy: 18, r: 2 },
    { tag: 'circle', cx: 19, cy: 18, r: 2 },
    { tag: 'path', d: 'm6.6 7.3 3.3 3.1M17.4 7.3l-3.3 3.1M6.6 16.7l3.3-3.1M17.4 16.7l-3.3-3.1' },
  ],
  // Sector tiles.
  helmet: [{ tag: 'path', d: 'M3 18h18M5 18v-2.5a7 7 0 0 1 14 0V18M10 8.8V6h4v2.8' }],
  sprout: [
    {
      tag: 'path',
      d: 'M12 21v-9M12 12c0-4.2 3-7 8-7 0 5-3 7.6-8 7.6M12 14.5c0-3-2.2-5-6.2-5 0 3.2 2.3 5 6.2 5',
    },
  ],
  wrench: [
    {
      tag: 'path',
      d: 'M14.7 6.3a4 4 0 0 0 5 5L11.5 19.5a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 1-2-2Z',
    },
  ],
  heart: [
    { tag: 'path', d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z' },
    { tag: 'path', d: 'M8 12h2l1-2 2 4 1-2h2' },
  ],
  cloche: [{ tag: 'path', d: 'M3.5 17.5h17M5.5 17.5a6.5 6.5 0 0 1 13 0M12 9V7M10.5 7h3' }],
  monitor: [
    { tag: 'rect', x: 3, y: 4, width: 18, height: 12, rx: 2 },
    { tag: 'path', d: 'M8 20h8M12 16v4' },
  ],
  car: [
    { tag: 'path', d: 'M3.5 16v-3l2-5.5h13l2 5.5v3Z' },
    { tag: 'path', d: 'M3.5 13h17' },
    { tag: 'circle', cx: 7.5, cy: 16.5, r: 1.8 },
    { tag: 'circle', cx: 16.5, cy: 16.5, r: 1.8 },
  ],
  bolt: [{ tag: 'path', d: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z' }],
  drop: [{ tag: 'path', d: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z' }],
  anchor: [
    { tag: 'circle', cx: 12, cy: 5, r: 2 },
    { tag: 'path', d: 'M12 7v14M5 13a7 7 0 0 0 14 0M8.5 10h7' },
  ],
  fan: [
    { tag: 'circle', cx: 12, cy: 12, r: 1.8 },
    {
      tag: 'path',
      d: 'M12 10.2c0-4.2 1-7.2 3.2-7.2 3 0 2.6 4.6-1.4 7.6M13.6 13c3.6 2.1 5.6 4.5 4.5 6.4-1.5 2.6-5.5.6-6-4.4M10.4 13c-3.6 2.1-6.6 2.6-7.7.7-1.5-2.6 2.3-5.2 6.8-3.2',
    },
  ],
  cup: [
    {
      tag: 'path',
      d: 'M5 8h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8ZM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8.5 3v2M12 3v2',
    },
  ],
  palette: [
    {
      tag: 'path',
      d: 'M12 3a9 9 0 0 0 0 18c1.1 0 1.6-.8 1.3-1.7-.4-1.2.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z',
    },
    { tag: 'circle', cx: 7.5, cy: 11, r: 1 },
    { tag: 'circle', cx: 10, cy: 7, r: 1 },
    { tag: 'circle', cx: 15, cy: 7.5, r: 1 },
  ],
  shirt: [{ tag: 'path', d: 'M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z' }],
  truck: [
    { tag: 'path', d: 'M3 6h11v10H3zM14 10h4l3 3v3h-7' },
    { tag: 'circle', cx: 7, cy: 17, r: 1.8 },
    { tag: 'circle', cx: 17, cy: 17, r: 1.8 },
  ],
  // The app shell's own icons, standing in for the Material icons of the Streamlit sidebar (home, menu_book)
  // and of its header and service message (menu, close, refresh).
  home: [{ tag: 'path', d: 'm3 11 9-7.5 9 7.5M5.5 9v11h4.5v-6h4v6h4.5V9' }],
  book: [
    {
      tag: 'path',
      d: 'M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Zm0 0v13',
    },
  ],
  menu: [{ tag: 'path', d: 'M4 7h16M4 12h16M4 17h16' }],
  close: [{ tag: 'path', d: 'm6 6 12 12M18 6 6 18' }],
  refresh: [{ tag: 'path', d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3L20 9.5M20 4v5.5h-5.5' }],
  // The pages' controls, for the Material icons on the Streamlit pages' buttons (expand_more, check,
  // arrow_forward, arrow_back, edit, bookmark_border, filter_alt_off).
  chevron: [{ tag: 'path', d: 'm6 9 6 6 6-6' }],
  tick: [{ tag: 'path', d: 'm5 12.5 4.5 4.5L19 7.5' }],
  arrowRight: [{ tag: 'path', d: 'M4.5 12h15m-6-6 6 6-6 6' }],
  arrowLeft: [{ tag: 'path', d: 'M19.5 12h-15m6-6-6 6 6 6' }],
  edit: [{ tag: 'path', d: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4' }],
  bookmark: [{ tag: 'path', d: 'M6.5 3.5h11v17L12 16l-5.5 4.5v-17Z' }],
  filterOff: [
    { tag: 'path', d: 'M4 4.5h16l-6 7.5v5.5l-4 2.5v-8L4 4.5ZM16 15l4.5 4.5m0-4.5L16 19.5' },
  ],
} as const satisfies Record<string, readonly IconShape[]>

export type IconName = keyof typeof icons

export const iconNames = Object.keys(icons) as IconName[]
