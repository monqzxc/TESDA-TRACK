import type { ReactElement } from 'react'

// The landing page's own small drawing, the buttons' arrow, which the app's icon set (components/icons.ts) doesn't
// have. Like <Icon>, it draws in currentColor and is decorative.
const GLYPHS = {
  arrow: { width: 2.4, shape: <path d="M5 12h14m-6-6 6 6-6 6" /> },
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
