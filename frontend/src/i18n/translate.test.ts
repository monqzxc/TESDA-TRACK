import { describe, expect, it } from 'vitest'
import { createTranslator } from './translate.ts'

describe('interface translation', () => {
  it('keeps missing copy readable and preserves the structure of rich copy', () => {
    const translate = createTranslator({ Next: 'Susunod', 'Step {0} of {1}': 'Hakbang {0} sa {1}' })
    const copy = translate({
      title: 'Next',
      lead: 'A message awaiting translation',
      parts: ['Next', { quote: 'Next' }],
      step: (current: number, total: number) => `Step ${current} of ${total}`,
    })
    expect(copy.title).toBe('Susunod')
    expect(copy.lead).toBe('A message awaiting translation')
    expect(copy.parts).toEqual(['Susunod', { quote: 'Next' }])
    expect(copy.step(2, 4)).toBe('Hakbang 2 sa 4')
  })

  it('preserves inserted text, including literal placeholder syntax and markup', () => {
    const translate = createTranslator({ 'For {0}': 'Para sa {0}' })
    const copy = translate({ for: (name: string) => `For ${name}` })
    expect(copy.for('<script>{1}</script>')).toBe('Para sa <script>{1}</script>')
  })

  it('uses a full sentence pattern before a shorter suffix pattern', () => {
    const translate = createTranslator({
      '{0} skills': '{0} kakayahan',
      'Part {0} of {1} · {2} skills': 'Bahagi {0} sa {1} · {2} kakayahan',
    })
    const copy = translate({ part: () => 'Part 1 of 3 · Basic skills' })
    expect(copy.part()).toBe('Bahagi 1 sa 3 · Basic kakayahan')
  })

  it('keeps inserted names out of template matching', () => {
    const translate = createTranslator({ '{0} skills': '{0} kakayahan', 'For {0}': 'Para sa {0}' })
    const copy = translate({
      for: (name: string) => `For ${name}`,
      unknown: (name: string) => `Lookup failed for ${name}`,
    })
    expect(copy.for('21st Century skills')).toBe('Para sa 21st Century skills')
    expect(copy.unknown('21st Century skills')).toBe('Lookup failed for 21st Century skills')
  })

  it('translates sample labels while keeping API goal payloads and identifiers unchanged', () => {
    const translate = createTranslator({
      'Become a welder': 'Maging welder',
      'I want to be a welder.': 'Gusto kong maging welder.',
      'I want to pursue {0}.': 'Gusto kong kunin ang {0}.',
      home: 'tahanan',
    })
    const copy = translate({
      examples: [{ label: 'Become a welder', goal: 'I want to be a welder.' }],
      id: 'home',
      console: { label: 'A console', goal: 'Become a welder', steps: ['Next'] },
      exploreGoal: (name: string) => `I want to pursue ${name}.`,
    })
    expect(copy.examples[0]).toEqual({ label: 'Maging welder', goal: 'I want to be a welder.' })
    expect(copy.id).toBe('home')
    expect(copy.console.goal).toBe('Maging welder')
    expect(copy.exploreGoal('Cookery NC II')).toBe('I want to pursue Cookery NC II.')
  })
})
