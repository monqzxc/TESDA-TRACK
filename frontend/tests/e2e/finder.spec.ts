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

const gap = {
  competency_id: 3,
  name: 'Weld carbon steel plates',
  category: 'Core',
  status: 'not_familiar',
  priority: 'high',
  action: 'learn',
  basis: 'required_unit',
  must_learn: true,
  what_to_do: 'Learn to weld carbon steel plates.',
  why_it_matters: `It's a core unit: the technical work specific to ${welding.name}.`,
  activities: [
    'Learn it in a training program with supervised, hands-on practice using the tools and equipment it needs.',
  ],
  relevance: `Part of what the ${welding.name} assessment covers, and of the work in jobs such as Welder.`,
  evidence: ['You answered “I am not familiar with this”.'],
}

/** The personalized report, with every section filled, so axe sees all of it. */
const report = {
  policy_version: 'pathway-report-v1',
  generated_at: '2026-10-21T01:00:00Z',
  qualification: { ...summary, possible_jobs: welding.possible_jobs, unit_count: 3 },
  match: {
    strength: 'named',
    rank: 1,
    match_count: 1,
    score: 76,
    explanation: 'Your goal’s own words point to this qualification.',
    alternatives: [],
  },
  route: 'SKILL_GAP_CHECK',
  readiness: {
    available: true,
    score: 67,
    level: 'Moderate Readiness',
    counts: { confident: 2, some_experience: 0, not_familiar: 1, not_answered: 0 },
    summary: 'Moderate Readiness (67%): you rated yourself confident in 2 of 3 units.',
    limitations: ['Self-reported: this is not an official competency assessment.'],
  },
  strengths: [],
  training_to_consider: [
    {
      kind: 'focused_training',
      title: 'Take focused training on your gaps, then the assessment',
      recommended: true,
      service_kind: 'training',
      reasons: ['You marked 1 unit as a gap: Weld carbon steel plates.'],
      qualification: null,
    },
    {
      kind: 'direct_assessment',
      title: 'Ask an assessment center about going straight to assessment',
      recommended: false,
      service_kind: 'assessment',
      reasons: ['You reported about 2 years of experience.'],
      qualification: null,
    },
  ],
  skills_to_improve: [gap],
  competencies_to_learn_or_practice: [gap],
  reasoning: [
    {
      topic: 'skill_gaps',
      summary: 'Start with Weld carbon steel plates.',
      points: ['Your 1 gap: 1 high-priority.'],
    },
    {
      topic: 'employment',
      summary: 'Use this as general guidance on where the qualification can lead.',
      points: ['TESDA-TRACK has no job-vacancy or labor-market data.'],
    },
  ],
  employment: {
    observed_data: false,
    possible_jobs: welding.possible_jobs,
    source: 'Training Regulation',
    note: 'TESDA-TRACK has no job-vacancy or labor-market data.',
  },
  considerations: [
    {
      topic: 'verification',
      text: 'Some options aren’t verified in TESDA-TRACK yet.',
      items: ['Options marked “Verified” have current verification evidence.'],
    },
    {
      topic: 'cost_and_schedule',
      text: 'Listed fees are below; check them with the provider before you decide.',
      items: ['Manila Welding Institute: training cost ₱8,500.00, 268 hours'],
    },
  ],
  providers: [
    {
      kind: 'training',
      service_id: 1,
      site_id: 1,
      name: 'Manila Welding Institute',
      title: 'SMAW NC II Batch 1',
      city: 'Manila',
      region_code: 'NCR',
      distance_km: 2,
      starts_on: '2026-11-10',
      cost: '8500.00',
      duration_hours: 268,
      delivery_mode: 'institution_based',
      scholarship_available: true,
      seats_left: null,
      status: 'confirmed',
      score: 95,
      notes: ['An assessment with open seats is available nearby'],
    },
    {
      kind: 'assessment',
      service_id: 4,
      site_id: 2,
      name: 'Quezon City Assessment Center',
      title: null,
      city: 'Quezon City',
      region_code: 'NCR',
      distance_km: 11,
      starts_on: '2026-11-04',
      cost: null,
      duration_hours: null,
      delivery_mode: null,
      scholarship_available: null,
      seats_left: 3,
      status: 'needs_verification',
      score: null,
      notes: ['This center’s authority to assess this qualification requires verification.'],
    },
  ],
  region_name: null,
  next_steps: [
    {
      position: 1,
      kind: 'review_gaps',
      title: 'Start with your highest-priority gaps',
      detail: 'Weld carbon steel plates.',
      competency_ids: [3],
    },
    {
      position: 2,
      kind: 'compare_providers',
      title: 'Compare training providers',
      detail: 'Start with Manila Welding Institute.',
      competency_ids: [],
    },
  ],
  final: {
    summary: `Your best next step for ${welding.name} is focused training on the units you marked as gaps, then the assessment.`,
    next_action: 'Start with your highest-priority gaps: Weld carbon steel plates.',
    pathway: 'Take focused training on your gaps, then the assessment',
    focus: ['Weld carbon steel plates'],
    providers: ['Manila Welding Institute'],
  },
  disclaimer: 'This report is guidance. It doesn’t guarantee certification or employment.',
  rankings: {
    training_audit_id: 1,
    training_policy: 'verified-services-v2',
    assessment_audit_id: 2,
    assessment_policy: 'assessment-center-v1',
  },
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
  await page.route('**/api/v1/regions', (route) =>
    route.fulfill({
      json: [
        {
          code: 'NCR',
          name: 'National Capital Region',
          center_city: 'Manila',
          latitude: 14.5995,
          longitude: 120.9842,
        },
      ],
    }),
  )
  await page.route('**/api/v1/recommendations/report', (route) => route.fulfill({ json: report }))
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
      // The personalized report, between the verdict and the curated pathway.
      for (const name of [
        'Recommendations for you',
        'Why we recommend these',
        'Other things to consider',
        'Your next steps',
        'Final recommendation',
      ]) {
        await expect(page.getByRole('region', { name })).toBeVisible()
      }
      await expect(page.getByText('Learn to weld carbon steel plates.')).toBeVisible()
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
