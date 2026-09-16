import { expect, test } from '@playwright/test';

test.describe('overlay configuration', () => {
	test.skip(
		!process.env.E2E_STORAGE_STATE,
		'Configure E2E_STORAGE_STATE with a dedicated test account first.'
	);

	test('opens the overlay tab for a campaign owner', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText(/Central de campanhas|Campaign hub/i)).toBeVisible();
		const overlayTab = page.getByRole('button', { name: /^Overlay$/i });
		if (await overlayTab.count()) {
			await overlayTab.click();
			await expect(page.getByText(/Overlay da live|Live overlay/i)).toBeVisible();
		}
	});
});
