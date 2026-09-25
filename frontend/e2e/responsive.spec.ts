import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [320, 360, 390, 430]) {
	test(`login page fits a ${width}px mobile viewport`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Entre na aventura' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Continuar com Google/i })).toBeVisible();

		const dimensions = await page.evaluate(() => ({
			viewport: document.documentElement.clientWidth,
			page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
		}));
		expect(dimensions.page, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
			dimensions.viewport + 1
		);
	});
}
