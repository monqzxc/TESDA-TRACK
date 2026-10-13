import { describe, expect, it } from 'vitest'
import { readWebFile } from '../test/files.ts'
import { lightAndDark } from './tokenBlocks.ts'

const tokensCss = readWebFile('src/styles/tokens.css')
// The Streamlit app's stylesheet, which these tokens were copied from.
const streamlitCss = readWebFile('../frontend/styles.css')

describe('tokens.css', () => {
  // Ported from frontend/tests/test_theme.py: a color added to one theme needs a value in the other.
  it('gives every color a value in both light and dark', () => {
    const { light, dark } = lightAndDark(tokensCss)
    expect(light.size, 'tokens.css defines its colors on :root').toBeGreaterThan(0)
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort())
  })

  // Until the Streamlit app is removed, both apps must show the same colors.
  it('has the same tokens and values as frontend/styles.css', () => {
    const ours = lightAndDark(tokensCss)
    const streamlit = lightAndDark(streamlitCss)
    expect(streamlit.light.size).toBeGreaterThan(0)
    expect(Object.fromEntries(ours.light)).toEqual(Object.fromEntries(streamlit.light))
    expect(Object.fromEntries(ours.dark)).toEqual(Object.fromEntries(streamlit.dark))
  })

  it('includes the map tile filter', () => {
    const { light, dark } = lightAndDark(tokensCss)
    expect(light.get('--track-map-tiles')).toBe('none')
    expect(dark.get('--track-map-tiles')).toMatch(/^invert\(1\)/)
  })
})
