import type { ReactElement } from 'react'

// The landing page's own small drawings, which the app's icon set (components/icons.ts) doesn't have. Like <Icon>,
// they draw in currentColor and are decorative.
const GLYPHS = {
  arrow: { width: 2.4, shape: <path d="M5 12h14m-6-6 6 6-6 6" /> },
  tick: { width: 2.2, shape: <path d="m5 12.5 4.5 4.5L19 7.5" /> },
  plane: { width: 2, shape: <path d="M3 13.5 21 6l-4 14-4.5-5L8 18v-5l9-6.5" /> },
  calendar: {
    width: 2,
    shape: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4m6-4v4" />
      </>
    ),
  },
  shield: {
    width: 2,
    shape: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
} satisfies Record<string, { width: number; shape: ReactElement }>

export type GlyphName = keyof typeof GLYPHS

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  const { width, shape } = GLYPHS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {shape}
    </svg>
  )
}
