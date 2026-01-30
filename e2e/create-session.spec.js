// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const SAMPLE_PATH = path.join(__dirname, '../samples/sample.xlsx');
const DELAY_AFTER_SESSION_MS = 2000;

/** Shared session ID from first test for second test (serial run). */
let sessionId;

test.describe.serial('Session and chunk e2e', () => {
  test('create session with sample file', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/create');

    await expect(page.getByRole('heading', { name: /create session/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /choose from preloaded/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PATH);
    await page.getByRole('button', { name: /^upload$/i }).click();
    await page.waitForURL(/\/create$/);
    await expect(page.getByText(/choose a sheet/i)).toBeVisible();

    await page.getByRole('combobox').selectOption({ label: 'Sample' });
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/sheet has.*rows/i)).toBeVisible();
    // Chunking: range 1–50, equal size 25 → 2 chunks (1–25, 26–50)
    const chunkingForm = page.locator('form');
    await chunkingForm.locator('input[type="number"]').nth(0).fill('1');
    await chunkingForm.locator('input[type="number"]').nth(1).fill('50');
    await chunkingForm.locator('input[type="number"]').nth(2).fill('25');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/left panel columns/i)).toBeVisible();

    await page.getByLabel('Name', { exact: true }).check();
    await page.getByLabel('Status', { exact: true }).check();
    await page.getByRole('radio', { name: /new column/i }).check();
    await page.getByPlaceholder(/column name/i).fill('target');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/configure the options/i)).toBeVisible();

    await page.locator('select').selectOption({ label: 'Status' });
    await page.getByRole('button', { name: /pre-fill/i }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /finish and open session/i }).click();

    await expect(page).toHaveURL(/\/sessions\/\d+$/);
    const match = page.url().match(/\/sessions\/(\d+)$/);
    expect(match).toBeTruthy();
    sessionId = match[1];

    await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chunks' })).toBeVisible();
    // Chunking was configured as range 1–50, equal size 25 → exactly 2 chunks
    const chunksTable = page.getByRole('table');
    await expect(chunksTable).toBeVisible();
    await expect(chunksTable).toContainText('1–25');
    await expect(chunksTable).toContainText('26–50');
    const chunkRows = page.getByRole('table').locator('tbody tr');
    await expect(chunkRows).toHaveCount(2);

    await page.waitForTimeout(DELAY_AFTER_SESSION_MS);
  });

  test('update a few chunks', async ({ page }) => {
    test.setTimeout(60000);
    if (!sessionId) {
      test.skip(true, 'Session was not created in previous test');
      return;
    }

    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByRole('heading', { name: 'Chunks' })).toBeVisible();
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
    await expect(page.getByText(/rows 1[-–]5 of/i)).toBeVisible({ timeout: 10000 });

    const rowCards = page.locator('.card[style*="100%"]');
    await expect(rowCards).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await rowCards.nth(i).getByRole('button').first().click();
    }

    // Resume flow: go back to session and click Resume on the same chunk; should land in editor without claim form
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByRole('heading', { name: 'Chunks' })).toBeVisible();
    const resumeLink = page.getByRole('table').getByRole('link', { name: 'Resume' }).first();
    await expect(resumeLink).toBeVisible({ timeout: 5000 });
    await resumeLink.click();
    await page.waitForURL(new RegExp(`/sessions/${sessionId}/chunks/0/edit`));
    // Should see editor and NOT the claim form
    await expect(page.getByText(/rows per view/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Claim chunk' })).not.toBeVisible();
    await expect(page.getByLabel(/your name/i)).not.toBeVisible();
  });
});
