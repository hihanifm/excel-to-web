// @ts-check
/**
 * Captures screenshots for docs/QUICKSTART.md.
 * Run with: npx playwright test e2e/capture-quickstart-screenshots.spec.js
 * App must be running: npm run start (http://localhost:36001)
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '../docs/quickstart');
const SAMPLE_PATH = path.join(__dirname, '../samples/sample.xlsx');
const PROJECT_NAME = 'Quickstart Screenshot Project';

test.describe('Capture quickstart screenshots', () => {
  test('capture all 11 quickstart screenshots', async ({ page }) => {
    test.setTimeout(120000);

    // 01 – Projects list (home)
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'PROJECTS' })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-projects-list.png'), fullPage: true });

    // 02 – Create step 1 (upload / preloaded)
    await page.goto('/create');
    await expect(page.getByRole('heading', { name: /create project/i })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-create-step1.png'), fullPage: true });

    // Fill step 1 and upload
    await page.getByLabel('Project name').fill(PROJECT_NAME);
    await page.locator('summary').filter({ hasText: 'Advanced' }).click();
    await page.getByLabel('Creator name').fill('Screenshot User');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PATH);
    await page.getByRole('button', { name: /^upload$/i }).click();
    await expect(page.getByText(/choose a sheet/i)).toBeVisible({ timeout: 15000 });

    // 03 – Choose sheet
    await page.getByRole('combobox').selectOption({ label: 'Sample' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-choose-sheet.png'), fullPage: true });
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/sheet has.*records/i)).toBeVisible({ timeout: 10000 });

    // 04 – Chunking
    await page.locator('input[id="from-row"]').fill('1');
    await page.locator('input[id="to-row"]').fill('50');
    await page.getByRole('radio', { name: 'Equal' }).check();
    await page.locator('.rechunk-widget-input').first().fill('2');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-chunking.png'), fullPage: true });
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/left panel columns/i)).toBeVisible({ timeout: 10000 });

    // 05 – Target columns
    await page.getByLabel('Conversation', { exact: true }).check();
    await page.getByLabel('Status', { exact: true }).check();
    await page.getByRole('radio', { name: /new column/i }).check();
    await page.getByPlaceholder(/column name/i).fill('target');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-target-columns.png'), fullPage: true });
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/configure the options/i)).toBeVisible({ timeout: 10000 });

    // 06 – Options
    await page.getByRole('textbox').fill('Option1\nOption2\nOption3');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-options.png'), fullPage: true });
    await page.getByRole('button', { name: /finish and open project/i }).click();

    await expect(page).toHaveURL(/\/sessions\/\d+$/, { timeout: 30000 });
    const sessionId = page.url().match(/\/sessions\/(\d+)$/)?.[1];
    expect(sessionId).toBeTruthy();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 07 – Session detail (Stats and Chunks)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-session-detail.png'), fullPage: true });
    await expect(page.getByRole('heading', { name: 'Chunks' })).toBeVisible({ timeout: 10000 });

    // 08 – Chunk Editor (first leaf chunk); claim if unclaimed
    const firstChunkRow = page.getByRole('table').locator('tbody tr').first();
    await firstChunkRow.locator('td').first().click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/chunks/\\d+/edit`));
    const claimButton = page.getByRole('button', { name: /claim chunk/i });
    if (await claimButton.isVisible().catch(() => false)) {
      await page.locator('#claim-name').fill('Screenshot User');
      await claimButton.click();
      await page.waitForLoadState('networkidle');
      await page.locator('button.rechunk-widget-trigger, button:has-text("Split this chunk")').first().waitFor({ state: 'visible', timeout: 30000 });
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-chunk-editor.png'), fullPage: true });

    // 09 – Re-chunk widget open (trigger is a button with class btn-link)
    const splitButton = page.locator('button.rechunk-widget-trigger, button:has-text("Split this chunk")').first();
    await splitButton.click({ timeout: 15000 });
    await page.getByRole('radio', { name: 'Equal' }).check();
    await page.locator('.rechunk-widget-input').first().fill('2');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-rechunk-widget.png'), fullPage: true });
    await page.getByRole('button', { name: 'Split' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // 10 – Chunk Detail (container with sub-chunks)
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/chunks/\\d+$`));
    await expect(page.getByRole('heading', { name: 'Sub-chunks' })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-chunk-detail.png'), fullPage: true });

    // 11 – Session detail with Export button
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /export excel/i })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-export.png'), fullPage: true });
  });
});
