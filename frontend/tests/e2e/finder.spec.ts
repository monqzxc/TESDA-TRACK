import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Find my pathway (US-01, US-03, US-06, US-14): a goal, its matches with the follow-up questions, the readiness
// check part by part, and the pathway, on a phone and a desktop, in both themes, with axe at every step; and the
// same journey with the keyboard alone (US-13). The API is answered here.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

const GOAL = 'I want to be a welder.'

const welding = {
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  sector: 'Metals and Engineering',
  possible_jobs: ['Welder', 'Fabricator'],
  competencies: [
    { id: 1, position: 1, name: 'Participate in workplace communication', category: 'Basic' },
    { id: 2, position: 2, name: 'Apply safety practices', category: 'Common' },
    { id: 3, position: 3, name: 'Weld carbon steel plates', category: 'Core' },
  ],
}
const summary = { code: welding.code, name: welding.name, sector: welding.sector }
const profile = {
  career_goal: 'Welder',
  existing_skills: ['welding'],
  experience_years: null,
  has_certification: null,
  intent: 'training_recommendation',
}

/** The finder's routes. The goal is only ever in a request body: `goalInAddress` records any address with it. */
async function serveFinder(page: Page) {
  const seen = { goalInAddress: [] as string[] }
  page.on('request', (request) => {
    if (decodeURIComponent(request.url()).toLowerCase().includes('welder.')) {
      seen.goalInAddress.push(request.url())
    }
  })
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [welding] }))
  await page.route('**/api/v1/analysis/goal', (route) =>
    route.fulfill({ json: { profile, source: 'rules' } }),
  )
  await page.route('**/api/v1/analysis/matches', async (route) => {
    const body = route.request().postDataJSON() as { profile: typeof profile }
    await route.fulfill({
      json: {
        profile: body.profile,
        matches: [{ qualification: summary, score: 76, reason: 'Matched your words: welder' }],
      },
    })
  })
  await page.route('**/api/v1/analysis/pathway', (route) =>
    route.fulfill({
      json: {
        recommendation: 'SKILL_GAP_CHECK',
        reason: 'Your experience makes a competency check useful first.',
        next_step: 'Check your skills.',
        pathway: null,
      },
    }),
  )
  await page.route('**/api/v1/analysis/readiness', (route) =>
    route.fulfill({
      json: {
        score: 67,
        level: 'Moderate readiness',
        strengths: ['Participate in workplace communication', 'Apply safety practices'],
        skill_gaps: ['Weld carbon steel plates'],
        recommendation: 'Train on the skills you marked as gaps.',
      },
    }),
  )
  await page.route('**/api/v1/pathways?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 7,
          qualification: summary,
          route: 'SKILL_GAP_CHECK',
          title: 'Close your skill gaps',
          description: 'Train only on the competencies you still need.',
          steps: [
            {
              id: 1,
              position: 1,
              kind: 'self_check',
              title: 'Complete the readiness check',
              description: '',
            },
            {
              id: 2,
              position: 2,
              kind: 'training',
              title: 'Take focused training',
              description: '',
            },
          ],
        },
      ],
    }),
  )
  await page.route('**/api/v1/feedback/recommendations', async (route) => {
    const { satisfied } = route.request().postDataJSON() as { satisfied: boolean }
    await route.fulfill({ status: 201, json: { id: 'feedback-1', satisfied, reason: null } })
  })
  await page.route('**/api/v1/feedback/recommendations/*', async (route) => {
    const { reason } = route.request().postDataJSON() as { reason: string }
    await route.fulfill({ json: { id: 'feedback-1', satisfied: false, reason } })
  })
  return seen
}

async function expectSettledAndAccessible(page: Page) {
  // No step is still sliding in, nor any request still showing its loading line.
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
  // Nothing runs off the side of the screen. If something does, it's named: the first element past the edge that
  // no clipping box (overflow other than visible) holds in.
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    if (root.scrollWidth <= root.clientWidth) return null
    const clipped = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      ) {
        if (getComputedStyle(parent).overflowX !== 'visible') return true
      }
      return false
    }
    const wide = [...document.querySelectorAll('body *')].find(
      (element) =>
        element.getBoundingClientRect().right > root.clientWidth + 1 && !clipped(element),
    )
    return wide ? wide.outerHTML.slice(0, 160) : `${root.scrollWidth - root.clientWidth}px`
  })
  expect(overflow).toBeNull()
  // React Aria's live announcer holds what it just read out for a few seconds after a choice in a list: entries
  // labelled by the chosen option, which has gone with the list. Screen readers have read them by then.
  const results = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
  expect(
    results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.html) })),
  ).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: goal to pathway, each step passing axe`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      const seen = await serveFinder(page)
      await page.goto('/find')

      await expect(
        page.getByRole('heading', { level: 2, name: 'What would you like to achieve?' }),
      ).toBeVisible()
      await expectSettledAndAccessible(page)
      await page.getByRole('button', { name: 'Become a welder' }).click()
      await page.getByRole('button', { name: 'Get recommendation' }).click()

      await expect(page).toHaveURL('/find/matches')
      await expect(page.getByRole('article', { name: welding.name })).toBeVisible()
      await page.getByRole('button', { name: /welding experience/ }).click()
      await page.getByRole('option', { name: '1–3 years' }).click()
      await expectSettledAndAccessible(page)
      await page.getByRole('button', { name: 'Check my readiness' }).click()

      await expect(page).toHaveURL('/find/readiness')
      await expect(page.getByText('Part 1 of 3 · Basic skills')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Why we ask' })).toBeVisible()
      await expectSettledAndAccessible(page)
      for (const [number, answer, next] of [
        ['1', 'I can do this confidently', 'Next: Common skills'],
        ['2', 'I can do this confidently', 'Next: Core skills'],
        ['3', 'I am not familiar with this', 'Analyze my skills'],
      ]) {
        await page
          .getByRole('radiogroup', { name: new RegExp(`^${number}\\. `) })
          .getByText(answer)
          .click()
        await page.getByRole('button', { name: next }).click()
      }

      await expect(page).toHaveURL('/find/pathway')
      await expect(
        page.getByRole('heading', { name: 'Take focused training, then the NC assessment' }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Close your skill gaps' })).toBeVisible()
      await expectSettledAndAccessible(page)

      // The question under the recommendation, and a reason after No.
      const question = page.getByRole('region', {
        name: 'Are you satisfied with this recommendation?',
      })
      await question.getByRole('button', { name: 'No', exact: true }).click()
      await expect(question.getByText(/What didn’t fit\?/)).toBeFocused()
      await expectSettledAndAccessible(page)
      await question
        .getByRole('button', { name: 'It’s the wrong qualification for my goal' })
        .click()
      await expect(question.getByText('Thank you. That tells us what to improve.')).toBeFocused()
      await expectSettledAndAccessible(page)

      // A refresh keeps the learner's work (US-14), the answer included: the question isn't asked again.
      await page.reload()
      await expect(
        page.getByRole('heading', { name: 'Take focused training, then the NC assessment' }),
      ).toBeVisible()
      await expect(question).toHaveCount(0)
      expect(seen.goalInAddress).toEqual([])
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('works with the keyboard alone, from the goal to the training it suggests', async ({
    page,
  }) => {
    await serveFinder(page)
    await page.goto('/find')
    const box = page.getByRole('textbox', { name: 'Or tell us in your own words' })
    await box.focus()
    await page.keyboard.type(GOAL)

    // Tab on to the button, past the sample goals.
    const submit = page.getByRole('button', { name: 'Get recommendation' })
    for (
      let i = 0;
      i < 12 && !(await submit.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab')
    }
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/find/matches')

    const check = page.getByRole('button', { name: 'Check my readiness' })
    await check.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/find/readiness')

    // Each skill's answers are one Tab stop, and the arrows choose; Next takes focus to the new part.
    for (const [number, next] of [
      ['1', 'Next: Common skills'],
      ['2', 'Next: Core skills'],
      ['3', 'Analyze my skills'],
    ]) {
      const group = page.getByRole('radiogroup', { name: new RegExp(`^${number}\\. `) })
      await group.getByRole('radio').first().focus()
      await page.keyboard.press('Space')
      await expect(group.getByRole('radio', { name: 'I can do this confidently' })).toBeChecked()
      await page.getByRole('button', { name: next }).focus()
      await page.keyboard.press('Enter')
    }

    await expect(page).toHaveURL('/find/pathway')
    await page.getByRole('button', { name: 'Find training near you' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(
      '/training?type=training&qualification=SMAW-NCII&q=Shielded+Metal+Arc+Welding',
    )
  })

  test('says what to do with an empty goal, beside the box', async ({ page }) => {
    await serveFinder(page)
    await page.goto('/find')

    await page.getByRole('button', { name: 'Get recommendation' }).click()

    await expect(
      page.getByText('Describe your career goal or skills to get started.'),
    ).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Or tell us in your own words' })).toBeFocused()
    await expect(page).toHaveURL('/find')
  })
})
