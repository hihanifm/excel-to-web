// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const SAMPLE_PATH = path.join(__dirname, '../samples/sample.xlsx');

test.describe('Compare e2e', () => {
  test('compare two columns with sample file', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/compare');

    await expect(page.getByRole('heading', { name: /^compare$/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PATH);
    await page.getByRole('button', { name: /^upload$/i }).click();
    await page.waitForURL(/\/compare$/);
    await expect(page.getByText(/choose a sheet/i)).toBeVisible();

    await page.getByRole('combobox').selectOption({ label: 'Sample' });
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/choose two columns/i)).toBeVisible();

    await page.getByRole('combobox').first().selectOption({ label: 'Name' });
    await page.getByRole('combobox').nth(1).selectOption({ label: 'Status' });
    await page.getByRole('button', { name: /^compare$/i }).click();

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/total rows:/i)).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    const bodyRows = page.locator('table tbody tr');
    await expect(bodyRows.first()).toBeVisible({ timeout: 5000 });
  });
});
