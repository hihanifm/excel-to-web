// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const SAMPLE_PATH = path.join(__dirname, '../samples/sample.xlsx');
const DELAY_AFTER_SESSION_MS = 2000;

test('create session with sample file, then choose chunk and fill 5 records', async ({ page }) => {
  test.setTimeout(90000);

  await page.goto('/create');

  // --- Create session: Name left, new column target, Status prefill, chunk size 50 ---
  await expect(page.getByRole('heading', { name: /create session/i })).toBeVisible();
  await page.locator('input[name="chunkSize"]').fill('50');
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_PATH);
  await page.getByRole('button', { name: /^upload$/i }).click();
  await page.waitForURL(/\/create$/);
  await expect(page.getByText(/choose a sheet/i)).toBeVisible();

  await page.getByRole('combobox').selectOption({ label: 'Sample' });
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText(/left panel columns/i)).toBeVisible();

  await page.getByLabel('Name', { exact: true }).check();
  await page.getByRole('radio', { name: /new column/i }).check();
  await page.getByPlaceholder(/column name/i).fill('target');
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText(/configure the options/i)).toBeVisible();

  await page.locator('select').selectOption({ label: 'Status' });
  await page.getByRole('button', { name: /pre-fill/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /finish and open session/i }).click();

  await expect(page).toHaveURL(/\/sessions\/\d+$/);
  const sessionId = page.url().match(/\/sessions\/(\d+)$/)?.[1];
  expect(sessionId).toBeDefined();

  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chunks' })).toBeVisible();

  // Delay between creating the session and choosing the chunk
  await page.waitForTimeout(DELAY_AFTER_SESSION_MS);

  // --- Choose first chunk, claim, show 5 rows, fill 5 records ---
  const claimLink = page.getByRole('table').getByRole('link', { name: 'Claim' }).first();
  await expect(claimLink).toBeVisible({ timeout: 10000 });
  await claimLink.click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/chunks/0/edit`));

  const form = page.locator('form');
  await form.waitFor({ state: 'visible', timeout: 10000 });
  await form.getByRole('textbox').fill('E2E Tester');
  await form.getByRole('button', { name: 'Claim chunk' }).click();
  await expect(page.getByText(/rows per view/i)).toBeVisible();

  await page.locator('select').selectOption('5');
  await expect(page.getByText(/rows 1–5 of/)).toBeVisible({ timeout: 10000 });

  const rowCards = page.locator('.card').filter({ has: page.locator('ul') });
  await expect(rowCards).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await rowCards.nth(i).getByRole('button').first().click();
  }
});
