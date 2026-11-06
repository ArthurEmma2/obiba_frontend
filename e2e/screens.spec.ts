import { expect, test, type Page } from '@playwright/test';

const SCREENS: Array<[string, string]> = [
  ['sign-in', '/sign-in'],
  ['sign-up', '/sign-up'],
  ['forgot-password', '/forgot-password'],
  ['onboarding-verify', '/preview?step=verify'],
  ['onboarding-profile', '/preview?step=profile'],
  ['onboarding-device', '/preview?step=device'],
  ['onboarding-device-ios', '/preview?step=device-ios'],
  ['onboarding-device-unsupported', '/preview?step=device-unsupported'],
  ['onboarding-provisioning', '/preview?step=provisioning'],
  ['onboarding-waitlist', '/preview?step=waitlist'],
  ['onboarding-quarantined', '/preview?step=quarantined'],
  ['onboarding-kit', '/preview?step=kit'],
  ['onboarding-authenticator', '/preview?step=authenticator'],
  ['onboarding-done', '/preview?step=done'],
  ['account', '/preview?step=account'],
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function assertAccessibleControls(page: Page) {
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], input:not([type=hidden]):not([hidden])')]
      .filter((el) => {
        const e = el as HTMLElement;
        if (e.offsetParent === null) return false;
        const label = e.getAttribute('aria-label') || e.textContent?.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent?.trim()) || e.getAttribute('alt');
        return !label;
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  expect(unnamed).toEqual([]);
}

for (const [name, path] of SCREENS) {
  test(`${name} renders cleanly`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED|identitytoolkit|googleapis/.test(m.text())) errors.push(m.text());
    });
    await page.goto(path);
    await settle(page);
    if (name === 'onboarding-kit') {
      await page.getByRole('button', { name: 'Create my Recovery Kit' }).click();
      await settle(page);
    }
    if (name === 'onboarding-profile') {
      await page.getByLabel('Account name').fill('ama');
      await page.waitForTimeout(800);
    }
    await assertNoHorizontalScroll(page);
    await assertAccessibleControls(page);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-${name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('the photo panel crossfades through every image and its controls work', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'panel is desktop-only');
  await page.goto('/sign-in');
  await settle(page);
  const panel = page.getByRole('region', { name: 'Obiba in everyday life' }).last();
  const active = () => panel.locator('button[aria-current="true"]').getAttribute('aria-label');
  expect(await active()).toBe('Show image 1 of 6');
  await page.waitForTimeout(7200);
  expect(await active()).toBe('Show image 2 of 6');
  await panel.getByRole('button', { name: 'Show image 5 of 6' }).click();
  expect(await active()).toBe('Show image 5 of 6');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'test-results/screens/desktop-carousel-slide5.png' });
});

test('reduced motion stops the automatic rotation', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/sign-in');
  await settle(page);
  const panel = page.getByRole('region', { name: 'Obiba in everyday life' }).last();
  await page.waitForTimeout(7200);
  expect(await panel.locator('button[aria-current="true"]').getAttribute('aria-label')).toBe('Show image 1 of 6');
  await ctx.close();
});
