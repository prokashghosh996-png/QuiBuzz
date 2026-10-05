import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

test('a lost scoring response survives refresh and retries without double-awarding', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/demo', { data: {} });
  const quiz = await response.json();
  try {
    await page.goto(`/quiz/${quiz.id}`);
    await expect(page.locator('.team-card')).toHaveCount(6);
    await page.getByLabel('Current direct team').selectOption(quiz.teams[0].id);
    await expect(page.locator('.team-card').nth(0)).toHaveClass(/is-direct/);
    await page.route(
      `**/api/quizzes/${quiz.id}/commands`,
      async (route) => {
        await route.fetch(); // Database commits, but the browser never gets the response.
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page
      .locator('.team-card')
      .nth(0)
      .getByRole('button', { name: 'Direct +10', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Retry last action' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Retry last action' })).toBeVisible();
    await expect(
      page.locator('.team-card').nth(0).getByRole('button', { name: 'Direct +10', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Retry last action' }).click();
    await expect(page.getByRole('button', { name: 'Retry last action' })).toHaveCount(0);
    await expect(page.locator('.team-card').nth(0).locator('.score-value')).toHaveText('30');
    const saved = await (await request.get(`/api/quizzes/${quiz.id}`)).json();
    expect(
      saved.events.filter(
        (e: { teamId: string; question: number }) =>
          e.teamId === quiz.teams[0].id && e.question === 4,
      ),
    ).toHaveLength(1);
  } finally {
    await cleanup(request, quiz.id);
  }
});
const waitSaved = async (page: Page) => {
  await expect(page.getByText('Connected & saved')).toBeVisible();
};
async function cleanup(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/quizzes/${id}`);
  if (response.ok()) {
    const q = await response.json();
    await request.delete(`/api/quizzes/${id}`, { data: { confirmed: true, version: q.version } });
  }
}
test('full setup, live scoring, projector sync, history and results', async ({
  page,
  context,
  request,
}) => {
  await page.addInitScript(() => {
    const target = window as typeof window & { timerTones: number };
    target.timerTones = 0;
    const original = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when = 0) {
      target.timerTones++;
      original.call(this, when);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a quiz' }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  const id = page.url().split('/').at(-1)!;
  try {
    await page.getByLabel('Quiz name', { exact: true }).fill('Browser workflow quiz');
    await page.getByLabel('Number of teams').fill('2');
    await page.getByLabel('Number of rounds').fill('1');
    await expect(page.getByText('Setup saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Team A member count').fill('1');
    await page.getByLabel('Team B member count').fill('3');
    const teams = page.locator('.setup-team');
    await teams.nth(0).getByLabel('Member 1', { exact: true }).fill('Alice');
    await teams.nth(1).getByLabel('Member 1', { exact: true }).fill('Bob');
    await teams.nth(1).getByLabel('Member 2', { exact: true }).fill('Charlie');
    await teams.nth(1).getByLabel('Member 3', { exact: true }).fill('Dee');
    await expect(page.getByText('Setup saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('input[value="Alice"]')).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Quiz master name').fill('Test Master');
    await expect(page.getByText('Setup saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Questions', { exact: true }).fill('2');
    await page.getByLabel('Round 1 quiz master', { exact: true }).fill('Setup round host');
    await expect(page.getByText('Setup saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Pounce time · seconds').fill('1');
    await expect(page.getByText('Setup saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ready for the spotlight?' })).toBeVisible();
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.locator('.team-card')).toHaveCount(2);
    const cards = page.locator('.team-card');
    await expect(page.getByLabel('Quiz master for this round')).toHaveCount(0);
    await page.getByRole('button', { name: 'Quiz settings', exact: true }).click();
    await expect(page.getByLabel('Round 1 quiz master', { exact: false })).toHaveValue(
      'Setup round host',
    );
    await page.getByLabel('Round 1 quiz master', { exact: false }).fill('New round host');
    await page.getByRole('button', { name: 'Save QM', exact: true }).click();
    await expect(page.locator('.quiz-meta')).toContainText('New round host');
    await page.getByRole('button', { name: 'Live scoring', exact: true }).click();
    await expect(
      cards.nth(1).getByRole('button', { name: 'Direct +10', exact: true }),
    ).toBeDisabled();

    await cards.nth(0).getByRole('button', { name: 'Direct +10', exact: true }).dblclick();
    await expect(cards.nth(0).locator('.score-value')).toHaveText('10');
      await expect(cards.nth(0).locator('.score-actions button:disabled')).toHaveCount(4);
    await expect(
      cards.nth(0).getByRole('button', { name: 'Bonus +10', exact: true }),
    ).toBeDisabled();
    await expect(
      cards.nth(1).getByRole('button', { name: 'Bonus +10', exact: true }),
    ).toBeDisabled();
    await cards.nth(1).getByRole('button', { name: 'Pounce −5', exact: true }).click();
    await expect(cards.nth(1).locator('.score-value')).toHaveText('-5');
      await expect(cards.nth(1).locator('.score-actions button:disabled')).toHaveCount(4);
    await expect(page.locator('.question-counter strong')).toContainText('01');
    const projector = await context.newPage();
    await projector.goto(`/projector/${id}`);
    await expect(projector.getByText('Hosted by New round host')).toBeVisible();
    await expect(projector.getByRole('button', { name: /Direct|Pounce|Edit|Delete/ })).toHaveCount(
      0,
    );
    await expect(projector.locator('.leader-score')).toHaveText(['10', '-5']);
    await page.getByRole('button', { name: 'Undo last score', exact: true }).click();
    await expect(cards.nth(1).locator('.score-value')).toHaveText('0');
      await expect(cards.nth(1).locator('.score-actions button:enabled')).toHaveCount(2);
    await expect(projector.locator('.leader-score')).toHaveText(['10', '0']);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByText('TIME UP', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (window as typeof window & { timerTones: number }).timerTones),
      )
      .toBe(2);
    await page.getByRole('button', { name: 'Next question', exact: true }).click();
    await waitSaved(page);
    await page.reload();
    await expect(page.locator('.question-counter strong')).toContainText('02');
    await expect(page.getByLabel('Quiz master for this round')).toHaveCount(0);
    await expect(page.locator('.quiz-meta')).toContainText('New round host');
    await expect(
      page.locator('.team-card').nth(0).getByRole('button', { name: 'Direct +10', exact: true }),
    ).toBeDisabled();
    await expect(
      page.locator('.team-card').nth(1).getByRole('button', { name: 'Direct +10', exact: true }),
    ).toBeEnabled();
    await expect(page.locator('.team-card').nth(0).locator('.score-value')).toHaveText('10');
    await page.getByRole('button', { name: 'Complete round', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Complete round', exact: true })
      .click();
    await expect(page.getByText('ROUND 1 COMPLETE', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show final results' }).click();
    await expect(page.getByText('THAT’S A WRAP')).toBeVisible();
    await page.getByRole('button', { name: 'Add tie-break question' }).click();
    await page.getByLabel('Quiz master for the upcoming round').fill('Tie-break host');
    await page.getByRole('button', { name: 'Start round', exact: true }).click();
    await expect(page.locator('.quiz-meta')).toContainText('Tie-break host');
    await expect(page.getByRole('heading', { name: 'Tie-break 1', exact: true })).toBeVisible();
    await projector.close();
  } finally {
    await cleanup(request, id);
  }
});
test('demo layout has no page overflow at mobile, tablet and desktop sizes', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/demo', { data: {} });
  expect(response.ok()).toBeTruthy();
  const quiz = await response.json();
  try {
    await page.goto(`/quiz/${quiz.id}`);
    await expect(page.locator('.team-card')).toHaveCount(6);
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `overflow at ${width}px`,
      ).toBeTruthy();
      if (width === 390 || width === 1440)
        await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Bounce question', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Bounce to', exact: true })
      .selectOption(quiz.teams[4].id);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Bounce question', exact: true })
      .click();
    await page
      .locator('.team-card')
      .nth(4)
      .getByRole('button', { name: 'Bonus +10', exact: true })
      .click();
    await expect(page.locator('.team-card .score-btn.bonus:enabled')).toHaveCount(0);
    await expect(page.getByLabel('Next direct team · override anytime')).toHaveValue(
      quiz.teams[5].id,
    );
    await page.getByRole('button', { name: 'Score history', exact: true }).click();
    await page
      .getByRole('button', { name: 'Edit Logic Legends score', exact: true })
      .first()
      .click();
    await page.getByLabel('Corrected points (signed)').fill('15');
    await page.getByLabel('Reason', { exact: true }).fill('Accepted partial bonus');
    await page.getByRole('button', { name: 'Save correction' }).click();
    await expect(page.getByText('Accepted partial bonus', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Quiz settings', exact: true }).click();
    await page.getByLabel('Negative penalty', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('button', { name: 'Change rules', exact: true }).click();
    await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  } finally {
    await cleanup(request, quiz.id);
  }
});
