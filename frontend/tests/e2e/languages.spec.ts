import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const width of [1440, 768, 390]) {
  test(`language preference survives navigation and reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
    await page.goto('/')
    const selector = page.getByRole('combobox', { name: 'Language / Wika' })
    await expect(selector).toBeVisible()
    await expect(selector.locator('option')).toHaveCount(9)
    await selector.selectOption('tl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'tl')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('May landas ka. Tuklasin mo.')
    await page.reload()
    await expect(selector).toHaveValue('tl')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('May landas ka. Tuklasin mo.')
    await expect(page).not.toHaveTitle('TESDA-TRACK · Your next step')
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
    await page.screenshot({ path: test.info().outputPath(`tagalog-home-${width}.png`) })
    await expect(page.locator('[data-entering]')).toHaveCount(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

    // The header action is translated too. Navigate via the visible control.
    await page.locator('header a[href$="/find"]').click()
    await expect(page).toHaveURL(/\/find$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hanapin ang aking landas' }),
    ).toBeVisible()
    if (width <= 768) {
      await page.getByRole('button', { name: 'Menu' }).click()
      const menu = page.getByRole('dialog', { name: 'Menu' })
      await menu.getByRole('combobox', { name: 'Language / Wika' }).selectOption('pam')
      await expect(menu.getByRole('link', { name: 'Alapan ing dalan ku' })).toBeVisible()
      await page.keyboard.press('Escape')
    } else {
      await selector.selectOption('pam')
      await expect(page.getByRole('link', { name: 'Alapan ing dalan ku' })).toBeVisible()
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'pam')
    await page.screenshot({ path: test.info().outputPath(`kapampangan-finder-${width}.png`) })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pam')
  })
}
