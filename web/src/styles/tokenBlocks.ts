// Reads the --track-* tokens out of a stylesheet: the same rules as frontend/tests/test_theme.py, so a block runs
// from "<selector> {" to the first "}" at the start of a line.

export const LIGHT_SELECTOR = ':root'
export const DARK_SELECTOR = ':root[data-theme="dark"]'

export function cssBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`No "${selector} {" block`)
  const end = css.indexOf('\n}', start)
  if (end === -1) throw new Error(`The "${selector}" block isn't closed`)
  return css.slice(start, end)
}

/** Token name to value, in the order they are declared. */
export function tokens(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, name, value] of block.matchAll(/(--track-[a-z0-9-]+):\s*([^;]+);/g)) {
    found.set(name, value.trim())
  }
  return found
}

export function lightAndDark(css: string) {
  return {
    light: tokens(cssBlock(css.replace(/\r\n/g, '\n'), LIGHT_SELECTOR)),
    dark: tokens(cssBlock(css.replace(/\r\n/g, '\n'), DARK_SELECTOR)),
  }
}
