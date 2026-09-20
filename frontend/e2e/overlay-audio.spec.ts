import { expect, test } from '@playwright/test';

test.describe('overlay and audio smoke', () => {
	test.skip(
		!process.env.E2E_STORAGE_STATE || !process.env.E2E_SCENE_URL,
		'Configure authenticated scene E2E variables.'
	);
	test('scene loads without a permanent loading state', async ({ page }) => {
		await page.goto(process.env.E2E_SCENE_URL!);
		await expect(page.getByText(/carregando cena/i)).toHaveCount(0, { timeout: 20_000 });
		await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
	});
	test('overlay remains usable on a mobile viewport', async ({ page }) => {
		await page.goto(process.env.E2E_SCENE_URL!);
		await expect(page.locator('body')).toBeVisible();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
			.toBe(true);
	});
});
