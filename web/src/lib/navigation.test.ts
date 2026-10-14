import { describe, expect, expectTypeOf, it } from 'vitest'
import { en } from '../copy/en.ts'
import { pageTitle, type PageKey } from './navigation.ts'

describe('pageTitle', () => {
  it('takes a page, never a string, so nothing a learner typed can reach the title', () => {
    expectTypeOf(pageTitle).parameter(0).toEqualTypeOf<PageKey | undefined>()
    // @ts-expect-error: a goal is a string, not a page.
    expectTypeOf(pageTitle).toBeCallableWith('I want to be a welder')
  })

  it('gives every page a title with the app name in it', () => {
    for (const page of Object.keys(en.pages) as PageKey[]) {
      expect(pageTitle(page)).toContain('TESDA-TRACK')
    }
    expect(pageTitle(undefined)).toBe('TESDA-TRACK')
  })
})
