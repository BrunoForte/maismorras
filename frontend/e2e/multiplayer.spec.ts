import { expect, test } from '@playwright/test';

test.describe('multiplayer scene synchronization', () => {
	const ownerState = process.env.E2E_STORAGE_STATE;
	const playerState = process.env.E2E_PLAYER_STORAGE_STATE;
	const sceneUrl = process.env.E2E_SCENE_URL;

	test.skip(
		!ownerState || !playerState || !sceneUrl,
		'Configure E2E_STORAGE_STATE, E2E_PLAYER_STORAGE_STATE and E2E_SCENE_URL first.'
	);

	test('narrator and player can open the same scene', async ({ browser }) => {
		const ownerContext = await browser.newContext({ storageState: ownerState });
		const playerContext = await browser.newContext({ storageState: playerState });
		try {
			const owner = await ownerContext.newPage();
			const player = await playerContext.newPage();
			await Promise.all([owner.goto(sceneUrl!), player.goto(sceneUrl!)]);
			await expect(owner.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
			await expect(player.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
			await expect(owner.getByText(/carregando cena/i)).toHaveCount(0);
			await expect(player.getByText(/carregando cena/i)).toHaveCount(0);
		} finally {
			await Promise.all([ownerContext.close(), playerContext.close()]);
		}
	});
});
