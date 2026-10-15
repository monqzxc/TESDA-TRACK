import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

// Account journeys against a mocked API: sign in from the sidebar and out again, create an account, and delete it
// after confirming. Each runs in both themes, on a phone (390 px) and a desktop, with axe at every dialog.

const LEARNER = {
  id: '6f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
  email: 'maria@example.com',
  full_name: 'Maria Santos',
  role: 'learner',
  created_at: '2026-10-01T08:00:00Z',
}
const PASSWORD = 'correct horse battery'
// Must match SESSION_HINT_KEY in src/auth/session.ts.
const SESSION_HINT_KEY = 'tesda-track.signed-in'

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

interface AccountState {
  signedIn: boolean
  registered: unknown
  deleted: boolean
  signInBodies: Record<string, string>[]
}

/**
 * The catalog and the account routes, answered as the API does. The session is a flag the tests can read. Served
 * to a whole browser context, its tabs share the session, as they share the cookie.
 */
async function serveApi(
  target: Page | BrowserContext,
  { signedIn = false } = {},
): Promise<AccountState> {
  const state: AccountState = { signedIn, registered: null, deleted: false, signInBodies: [] }
  await target.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
  await target.route('**/api/v1/me', (route) => {
    const method = route.request().method()
    if (method === 'DELETE') {
      state.signedIn = false
      state.deleted = true
      return route.fulfill({ status: 204 })
    }
    return state.signedIn
      ? route.fulfill({ json: LEARNER })
      : route.fulfill({ status: 401, json: { detail: 'Sign in to continue.' } })
  })
  await target.route('**/api/v1/auth/session', (route) => {
    const request = route.request()
    // The API refuses cookie writes without it.
    if (request.headers()['x-requested-with'] !== 'XMLHttpRequest') {
      return route.fulfill({ status: 403, json: { detail: 'X-Requested-With is required.' } })
    }
    if (request.method() === 'DELETE') {
      state.signedIn = false
      return route.fulfill({ status: 204 })
    }
    const form = Object.fromEntries(new URLSearchParams(request.postData() ?? ''))
    state.signInBodies.push(form)
    if (form.username !== LEARNER.email || form.password !== PASSWORD) {
      return route.fulfill({ status: 401, json: { detail: 'Incorrect email or password.' } })
    }
    state.signedIn = true
    return route.fulfill({ json: { learner: LEARNER, expires_in: 3600 } })
  })
  // The learner's own records, none yet, for My Progress.
  await target.route(
    /\/api\/v1\/me\/(recommendations|readiness-checks|pathways|assessment-applications|goals|certifications)/,
    (route) =>
      state.signedIn
        ? route.fulfill({ json: [] })
        : route.fulfill({ status: 401, json: { detail: 'Sign in to continue.' } }),
  )
  await target.route('**/api/v1/auth/register', (route) => {
    state.registered = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: LEARNER })
  })
  return state
}

/** Signs in with the sign-in dialog, which is open. */
async function signInWithDialog(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Sign in' })
  await dialog.getByLabel('Email').fill(LEARNER.email)
  await dialog.getByLabel('Password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Sign in' }).click()
  await expect(dialog).toBeHidden()
}

async function expectAccessible(page: Page) {
  // Dialogs and menus fade in: checked mid-fade, their colors would be blends of the page behind.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

/** Where the account control is: the sidebar, or on a phone, the menu that holds it. */
async function accountArea(page: Page, phone: boolean): Promise<Locator> {
  if (!phone) return page.getByRole('banner')
  await page.getByRole('button', { name: 'Menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu).toBeVisible()
  return menu
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    const phone = size === 'phone'

    test.describe(`${colorScheme} theme, ${size}`, () => {
      test.use({ colorScheme, viewport })

      test('signs in from the sidebar, shows the name, and signs out', async ({ page }) => {
        const api = await serveApi(page)
        await page.goto('/qualifications')
        await expect(
          page.getByRole('heading', { level: 1, name: 'Qualifications Library' }),
        ).toBeVisible()

        let area = await accountArea(page, phone)
        await area.getByRole('button', { name: 'Sign in' }).click()

        const dialog = page.getByRole('dialog', { name: 'Sign in' })
        await expect(dialog).toBeVisible()
        await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden()
        await expectAccessible(page)

        // A wrong password first: the API's message, and the dialog stays.
        await dialog.getByLabel('Email').fill(LEARNER.email)
        await dialog.getByLabel('Password').fill('not my password')
        await dialog.getByRole('button', { name: 'Sign in' }).click()
        await expect(dialog.getByRole('alert')).toHaveText('Incorrect email or password.')
        await expectAccessible(page)

        await dialog.getByLabel('Password').fill(PASSWORD)
        await dialog.getByRole('button', { name: 'Sign in' }).click()

        await expect(dialog).toBeHidden()
        await expect(page).toHaveURL('/qualifications')
        expect(api.signInBodies.at(-1)).toEqual({
          username: LEARNER.email,
          password: PASSWORD,
          scope: '',
        })
        // Focus goes back to where the learner was: the account button, or on a phone the Menu button.
        if (phone) await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused()
        area = phone ? await accountArea(page, phone) : area
        const account = area.getByRole('button', { name: 'Your account: Maria Santos' })
        await expect(account).toBeVisible()
        if (!phone) await expect(account).toBeFocused()

        await account.click()
        const menu = page.getByRole('menu')
        await expect(menu.getByText('maria@example.com')).toBeVisible()
        await menu.getByRole('menuitem', { name: 'Sign out' }).click()

        const signIn = area.getByRole('button', { name: 'Sign in' })
        await expect(signIn).toBeVisible()
        await expect(signIn).toBeFocused()
        expect(api.signedIn).toBe(false)
        expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_HINT_KEY)).toBeNull()
        // Sign out sat over the page links: the pointer moves off, so axe checks the links at rest, not hovered.
        await page.mouse.move(0, 0)
        await expectAccessible(page)
      })

      test('creates an account with the privacy notice and consent', async ({ page }) => {
        const api = await serveApi(page)
        await page.goto('/training')
        await expect(
          page.getByRole('heading', { level: 1, name: 'Training & Assessment' }),
        ).toBeVisible()

        const area = await accountArea(page, phone)
        await area.getByRole('button', { name: 'Sign in' }).click()
        await page.getByRole('button', { name: 'New here? Create an account' }).click()

        const dialog = page.getByRole('dialog', { name: 'Create an account' })
        await expect(dialog.getByLabel('Full name')).toBeFocused()
        await expect(dialog.getByText(/are never sold/)).toBeVisible()

        // Without consent nothing is sent.
        await dialog.getByLabel('Full name').fill('Maria Santos')
        await dialog.getByLabel('Email').fill(LEARNER.email)
        await dialog.getByLabel('Password').fill(PASSWORD)
        await dialog.getByRole('button', { name: 'Create account' }).click()
        await expect(
          dialog.getByText('Agree to the privacy notice to create your account.'),
        ).toBeVisible()
        expect(api.registered).toBeNull()
        await expectAccessible(page)

        // The box is drawn by its label (the input itself is visually hidden), so that's what a learner clicks.
        await dialog.getByText('I agree to the privacy notice').click()
        await expect(
          dialog.getByRole('checkbox', { name: 'I agree to the privacy notice' }),
        ).toBeChecked()
        await dialog.getByRole('button', { name: 'Create account' }).click()

        await expect(dialog).toBeHidden()
        expect(api.registered).toEqual({
          full_name: 'Maria Santos',
          email: LEARNER.email,
          password: PASSWORD,
          privacy_consent: true,
        })
        expect(api.signedIn).toBe(true)
        const signedIn = phone ? await accountArea(page, phone) : area
        await expect(
          signedIn.getByRole('button', { name: 'Your account: Maria Santos' }),
        ).toBeVisible()
      })

      test('deletes the account after confirming', async ({ page }) => {
        const api = await serveApi(page, { signedIn: true })
        await page.addInitScript((key) => localStorage.setItem(key, '1'), SESSION_HINT_KEY)
        await page.goto('/progress')
        await expect(page.getByRole('heading', { name: 'Continue your journey' })).toBeVisible()

        const area = await accountArea(page, phone)
        await area.getByRole('button', { name: 'Your account: Maria Santos' }).click()
        await page.getByRole('menuitem', { name: 'Delete my account' }).click()

        const dialog = page.getByRole('alertdialog', { name: 'Delete my account' })
        await expect(dialog).toBeVisible()
        const remove = dialog.getByRole('button', { name: 'Delete my account' })
        await expect(remove).toBeDisabled()
        await expectAccessible(page)

        const confirm = 'I understand this permanently deletes my account and saved records.'
        await dialog.getByText(confirm).click()
        await expect(dialog.getByRole('checkbox', { name: confirm })).toBeChecked()
        await remove.click()

        await expect(dialog).toBeHidden()
        await expect(page.getByText('Your account and saved records were deleted.')).toBeVisible()
        expect(api.deleted).toBe(true)
        expect(api.signedIn).toBe(false)
        await expect(area.getByRole('button', { name: 'Sign in' })).toBeFocused()

        // Signed out now: My Progress asks the learner to sign in.
        if (phone) await page.keyboard.press('Escape')
        await expect(
          page.getByRole('heading', { level: 2, name: 'Your journey deserves a place to grow' }),
        ).toBeVisible()
        await expectAccessible(page)
      })
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('the account menu passes axe in both themes', async ({ page }) => {
    await serveApi(page, { signedIn: true })
    await page.addInitScript((key) => localStorage.setItem(key, '1'), SESSION_HINT_KEY)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await page.goto('/skills')
      await page.getByRole('button', { name: 'Your account: Maria Santos' }).click()
      await expect(page.getByRole('menu')).toBeVisible()
      await expectAccessible(page)
    }
  })

  test("Home's top bar has the account control, and /sign-in returns to ?next=", async ({
    page,
  }) => {
    await serveApi(page)
    await page.goto('/sign-in?next=%2Fprogress')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await expectAccessible(page)

    const main = page.getByRole('main')
    await main.getByLabel('Email').fill(LEARNER.email)
    await main.getByLabel('Password').fill(PASSWORD)
    await main.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/progress')
    await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeFocused()

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Your account: Maria Santos' })).toHaveText(
      'Maria',
    )
  })

  test('/sign-in never sends the learner to another site', async ({ page }) => {
    await serveApi(page)
    await page.goto('/sign-in?next=%2F%2Fevil.com')
    const main = page.getByRole('main')
    await main.getByLabel('Email').fill(LEARNER.email)
    await main.getByLabel('Password').fill(PASSWORD)
    await main.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
  })

  test("signing in from My Progress's button puts focus on the page's heading", async ({
    page,
  }) => {
    await serveApi(page)
    await page.goto('/progress')

    await page.getByRole('button', { name: 'Sign in or create an account' }).click()
    await signInWithDialog(page)

    // The button has gone with the sign-in: the page's heading takes focus, as after a navigation.
    await expect(page.getByRole('heading', { name: 'Continue your journey' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeFocused()
  })

  test('signing in or out in one tab shows in the others', async ({ context }) => {
    await serveApi(context)
    const first = await context.newPage()
    const second = await context.newPage()
    await first.goto('/qualifications')
    await second.goto('/progress')
    await expect(second.getByRole('button', { name: 'Sign in or create an account' })).toBeVisible()

    await first.getByRole('button', { name: 'Sign in' }).click()
    await signInWithDialog(first)

    const account = second.getByRole('button', { name: 'Your account: Maria Santos' })
    await expect(account).toBeVisible()
    await expect(second.getByRole('heading', { name: 'Continue your journey' })).toBeVisible()

    await account.click()
    await second.getByRole('menuitem', { name: 'Sign out' }).click()

    await expect(first.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(first.getByRole('button', { name: /^Your account/ })).toBeHidden()
  })

  test("the sign-in dialog's code failing to download leaves the page working, and says so", async ({
    page,
  }) => {
    await serveApi(page)
    await page.goto('/qualifications')
    const heading = page.getByRole('heading', { level: 1, name: 'Qualifications Library' })
    await expect(heading).toBeVisible()
    // Offline, or a new release has replaced the old files.
    await page.route('**/src/auth/SignInDialog.tsx*', (route) => route.abort())

    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(
      page.getByText("We can't open sign-in right now. Check your connection, then try again."),
    ).toBeVisible()
    await expect(heading).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expectAccessible(page)

    // Try again reloads the app, which is how its code comes back.
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Try again' }).click(),
    ])
  })

  test("the account menu's code failing to download leaves a button that says so", async ({
    page,
  }) => {
    await serveApi(page, { signedIn: true })
    await page.addInitScript((key) => localStorage.setItem(key, '1'), SESSION_HINT_KEY)
    await page.route('**/src/features/account/SignedInMenu.tsx*', (route) => route.abort())
    await page.goto('/qualifications')

    const account = page.getByRole('button', { name: 'Your account: Maria Santos' })
    await expect(account).toBeEnabled()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await account.click()

    await expect(
      page.getByText(
        "We can't open your account menu right now. Check your connection, then try again.",
      ),
    ).toBeVisible()
  })
})
