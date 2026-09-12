import { expect, test } from '@playwright/test';

test.describe('authenticated campaign flows', () => {
	test.skip(!process.env.E2E_STORAGE_STATE, 'Configure E2E_STORAGE_STATE with a dedicated test account first.');

	test('opens the campaign workspace', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText(/Central de campanhas|Campaign hub/i)).toBeVisible();
		await expect(page.getByText(/Mesas|Tables/i)).toBeVisible();
	});
});
