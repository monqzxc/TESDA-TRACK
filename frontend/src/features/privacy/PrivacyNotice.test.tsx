import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from '../../copy/en.ts'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { readAppFile } from '../../test/files.ts'
import {
  hasSeenPrivacyNotice,
  markPrivacyNoticeSeen,
  PRIVACY_NOTICE_KEY,
  PRIVACY_NOTICE_VERSION,
} from './notice.ts'

const NOTICE = 'Your privacy on TESDA Track'

afterEach(() => {
  window.localStorage.clear()
})

const findNotice = () => screen.findByRole('dialog', { name: NOTICE })

describe('the privacy notice', () => {
  it('opens over the first page of a first visit, and says what is collected', async () => {
    renderApp('/', undefined, { firstVisit: true })

    const notice = await findNotice()
    for (const point of en.privacy.notice.points) {
      expect(within(notice).getByText(point)).toBeInTheDocument()
    }
    expect(within(notice).getByRole('link', { name: 'Read the privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('closes on "I understand", and stays closed for this browser', async () => {
    const user = userEvent.setup()
    const first = renderApp('/', undefined, { firstVisit: true })

    await user.click(within(await findNotice()).getByRole('button', { name: 'I understand' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.localStorage.getItem(PRIVACY_NOTICE_KEY)).toBe(PRIVACY_NOTICE_VERSION)
    first.unmount()

    // The next visit, as renderApp opens it without firstVisit: the same browser, with the notice seen.
    renderApp('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: en.pages.home.heading }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('counts Escape as seen', async () => {
    const user = userEvent.setup()
    renderApp('/', undefined, { firstVisit: true })
    await findNotice()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.localStorage.getItem(PRIVACY_NOTICE_KEY)).toBe(PRIVACY_NOTICE_VERSION)
  })

  it('opens the privacy policy from "Read the privacy policy"', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/', undefined, { firstVisit: true })

    await user.click(
      within(await findNotice()).getByRole('link', { name: 'Read the privacy policy' }),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy policy' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/privacy')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(PRIVACY_NOTICE_KEY)).toBe(PRIVACY_NOTICE_VERSION)
  })

  it("doesn't cover the privacy policy itself", async () => {
    renderApp('/privacy', undefined, { firstVisit: true })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy policy' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Not seen yet: it opens on the next page.
    expect(window.localStorage.getItem(PRIVACY_NOTICE_KEY)).toBeNull()
  })

  it('counts as unseen once the policy has changed', () => {
    window.localStorage.setItem(PRIVACY_NOTICE_KEY, '2026-01-01')
    expect(hasSeenPrivacyNotice()).toBe(false)

    markPrivacyNoticeSeen()
    expect(hasSeenPrivacyNotice()).toBe(true)
  })

  it('is marked seen for the end-to-end tests with the same key and version', () => {
    const config = readAppFile('playwright.config.ts')
    expect(config).toContain(
      `{ name: '${PRIVACY_NOTICE_KEY}', value: '${PRIVACY_NOTICE_VERSION}' }`,
    )
  })

  it('has the version of the policy it sums up', () => {
    const [year, month, day] = PRIVACY_NOTICE_VERSION.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(en.privacy.updated).toBe(`Last updated ${date}`)
  })
})

describe('the privacy policy', () => {
  it('opens with the summary, lists its sections, and links each one', async () => {
    renderApp('/privacy')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy policy' }),
    ).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: en.privacy.summary })
    expect(within(summary).getAllByRole('listitem')).toHaveLength(en.privacy.notice.points.length)

    const contents = screen.getByRole('navigation', { name: en.privacy.contents })
    const links = within(contents).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(
      en.privacy.sections.map(({ heading }) => heading),
    )
    for (const { id, heading } of en.privacy.sections) {
      expect(
        screen.getByRole('heading', { level: 2, name: heading }).parentElement,
      ).toHaveAttribute('id', id)
      expect(within(contents).getByRole('link', { name: heading })).toHaveAttribute(
        'href',
        `/privacy#${id}`,
      )
    }
  })

  it('names what an account keeps, and how to download or delete it', async () => {
    renderApp('/privacy')

    const account = await screen.findByRole('heading', {
      level: 2,
      name: 'When you create an account',
    })
    const section = account.parentElement!
    for (const term of [
      'Account details',
      'Readiness checks',
      'Certifications',
      'A sign-in cookie',
    ]) {
      expect(within(section).getByText(`${term}.`)).toBeInTheDocument()
    }
    const rights = screen.getByRole('heading', { level: 2, name: 'Your rights' }).parentElement!
    expect(rights).toHaveTextContent('Download my data')
    expect(rights).toHaveTextContent('Delete my account')
    expect(screen.getByRole('link', { name: 'National Privacy Commission' })).toHaveAttribute(
      'href',
      'https://privacy.gov.ph',
    )
  })
})

describe('links to the privacy policy', () => {
  it("are in Home's footer", async () => {
    renderApp('/')

    const footer = await screen.findByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('are in each page footer, marked on the policy itself', async () => {
    serveCatalog()
    renderApp('/qualifications')
    await screen.findByRole('heading', { level: 1, name: 'Qualifications Library' })

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(en.footer.copyright)
    const link = within(footer).getByRole('link', { name: 'Privacy policy' })
    expect(link).toHaveAttribute('href', '/privacy')
    await userEvent.setup().click(link)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy policy' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Privacy policy' }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
