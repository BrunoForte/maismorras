import { expect, test } from '@playwright/test';

test('workspace header wires navigation, scene, language and account callbacks', async ({
	page
}) => {
	test.skip(
		!!process.env.E2E_BASE_URL,
		'The local component harness is not part of the deployed app.'
	);
	await page.goto('/');
	await page.evaluate(async () => {
		const harness = await import('/src/lib/testing/campaignWorkspaceHeaderHarness.ts');
		harness.mountCampaignWorkspaceHeader('gm');
	});

	await expect(page.getByRole('button', { name: 'Ir para suas mesas' })).toContainText(
		'Mesa de teste'
	);
	await page.getByLabel('Selecionar cena').selectOption('scene-2');
	await page.getByRole('button', { name: 'Configurar cena' }).click();
	await page.getByRole('button', { name: 'Publicar cena na overlay' }).click();
	await page.getByRole('button', { name: 'Bestiário' }).click();
	await page.getByLabel('Idioma').selectOption('en');
	await page.getByRole('button', { name: 'Ir para suas mesas' }).click();
	await page.getByRole('button', { name: 'Sair' }).click();
	await page.getByRole('button', { name: 'Criar cena' }).click();
	const sceneName = page.getByLabel('Nome da nova cena');
	await sceneName.fill('Nova cena');
	await sceneName.press('Enter');

	const events = await page.evaluate(() => window.campaignWorkspaceHeaderEvents);
	expect(events).toEqual([
		'scene:scene-2',
		'scene-settings',
		'publish-overlay',
		'tab:bestiary',
		'locale:en',
		'return',
		'logout',
		'toggle-scene-creator',
		'draft:Nova cena',
		'create-scene'
	]);
});

test('workspace header hides GM actions from players in the browser', async ({ page }) => {
	test.skip(
		!!process.env.E2E_BASE_URL,
		'The local component harness is not part of the deployed app.'
	);
	await page.goto('/');
	await page.evaluate(async () => {
		const harness = await import('/src/lib/testing/campaignWorkspaceHeaderHarness.ts');
		harness.mountCampaignWorkspaceHeader('player');
	});
	await expect(page.getByText('Narrador', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Jogador', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Criar cena' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Configurar cena' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Bestiário' })).toHaveCount(0);
});
