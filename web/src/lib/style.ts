import type { CSSProperties } from 'react'

/** Class names, leaving out the ones whose condition is false (none at all: no class attribute). */
export function cx(...names: (string | false | null | undefined)[]): string | undefined {
  return names.filter(Boolean).join(' ') || undefined
}

/** Custom properties for an element's style, e.g. cssVars({ '--i': 2 }), added to any other style it has. */
export function cssVars(vars: Record<`--${string}`, string | number>, style?: CSSProperties) {
  return { ...style, ...vars } as CSSProperties
}
