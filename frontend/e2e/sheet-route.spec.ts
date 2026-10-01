import { expect, test } from '@playwright/test';

test('the standalone sheet route stays isolated and denies unauthenticated access safely', async ({
	page
}) => {
	test.skip(!!process.env.E2E_STORAGE_STATE, 'Este cenário valida o estado sem sessão.');

	await page.goto('/sheet?campaign=campaign-not-authorized&character=character-not-authorized');
	await expect(page.locator('.sheet-status')).toBeVisible();
	await expect(page.locator('.sheet-status')).toContainText(
		/Entre no MaisMorras|Sign in to MaisMorras|autenticação não está configurada|Sua sessão terminou|Your session ended/i,
		{ timeout: 15_000 }
	);
	await expect(
		page.locator('canvas, .campaign-workspace, .floating-chat, .ambient-audio-player')
	).toHaveCount(0);
	await expect(page).not.toHaveURL(/access_token|refresh_token|jwt/i);
});
