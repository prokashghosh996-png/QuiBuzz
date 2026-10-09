import { test, expect } from '@playwright/test';
import { db } from '../server/db.js';

test('register, sign out and sign in through the account screen', async ({
  page,
  browser,
  request,
}) => {
  const email = `screen-${crypto.randomUUID()}@example.com`;
  const password = 'Screen workflow passphrase 2026';
  let id: string | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'New to QuiBuzz? Create an account' }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Screen Host');
    await page.getByLabel(/^Email or phone number/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Screen Host', { exact: true })).toBeVisible();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    id = user.id;
    await page.getByRole('button', { name: 'Try a demo', exact: true }).click();
    await expect(page.locator('.team-card')).toHaveCount(6);
    const quizId = new URL(page.url()).pathname.split('/').pop();
    const guest = await browser.newContext();
    try {
      const audience = await guest.newPage();
      await audience.goto(`/projector/${quizId}`);
      await expect(audience.locator('.projector')).toBeVisible();
      await expect(audience.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
      expect((await request.get(`/api/quizzes/${quizId}`)).status()).toBe(401);
    } finally {
      await guest.close();
    }
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.getByLabel(/^Email or phone number/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Screen Host', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/account-login.png', fullPage: true });
  } finally {
    if (!id) id = (await db.user.findUnique({ where: { email } }))?.id;
    if (id) {
      await db.quiz.deleteMany({ where: { ownerId: id } });
      await db.user.delete({ where: { id } });
    }
  }
});

