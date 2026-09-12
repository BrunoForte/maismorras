import { expect, test } from '@playwright/test';

test('shows the MaisMorras entry screen', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/MaisMorras/i);
	await expect(page.getByText(/Entre na aventura|Enter the adventure/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /Google|Continuar com Google/i })).toBeVisible();
});
