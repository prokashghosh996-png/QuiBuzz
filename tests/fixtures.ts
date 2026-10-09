import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { db } from '../server/db.js';
type Account = {
  id: string;
  csrfToken: string;
  storageState: Awaited<ReturnType<APIRequestContext['storageState']>>;
};
export const test = base.extend<{ account: Account; signedIn: void }>({
  account: async ({ playwright, baseURL }, use) => {
    const client = await playwright.request.newContext({ baseURL });
    const response = await client.post('/api/auth/register', {
      data: {
        name: 'Workflow host',
        identifier: `workflow-${crypto.randomUUID()}@example.com`,
        password: 'Workflow test passphrase 2026',
      },
    });
    expect(response.status()).toBe(201);
    const result = await response.json();
    try {
      await use({
        id: result.user.id,
        csrfToken: result.csrfToken,
        storageState: await client.storageState(),
      });
    } finally {
      await db.quiz.deleteMany({ where: { ownerId: result.user.id } });
      await db.user.delete({ where: { id: result.user.id } });
      await client.dispose();
    }
  },
  request: async ({ playwright, baseURL, account }, use) => {
    const client = await playwright.request.newContext({
      baseURL,
      storageState: account.storageState,
      extraHTTPHeaders: { 'x-csrf-token': account.csrfToken },
    });
    await use(client);
    await client.dispose();
  },
  signedIn: [
    async ({ context, account }, use) => {
      await context.addCookies(account.storageState.cookies);
      await use();
    },
    { auto: true },
  ],
});
export { expect, type APIRequestContext, type Page };
