import { expect, test } from '@playwright/test';
import { createLocalAuthenticatedFixture, localStackEnabled } from './local-authenticated.helpers';

test.describe('authenticated Sheets tab', () => {
	test.skip(!localStackEnabled, 'Requires the isolated local Supabase stack and local API.');
	test.beforeEach(({ page }, testInfo) => {
		page.setDefaultTimeout(30_000);
		test.skip(
			testInfo.project.name !== 'chromium',
			'Runs once with controlled desktop and narrow viewports.'
		);
	});

	test('player edits the embedded sheet, keeps it across tabs, and opens the same sheet in both optional modes', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const character = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Ficha incorporada E2E'
			});
			const page = fixture.player;
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.evaluate((campaignId) => {
				localStorage.setItem(
					`maismorras:moved-panel:character-sheet:${campaignId}:mine`,
					JSON.stringify({ left: 8000, top: 6000 })
				);
				localStorage.setItem(
					`maismorras:resizable-panel:character-sheet:${campaignId}:mine`,
					JSON.stringify({ collapsed: true, size: { width: 24, height: 24 } })
				);
			}, fixture.campaignId);
			await page.goto(`/?campaign=${fixture.campaignId}&scene=${fixture.sceneId}`);
			await page.getByRole('button', { name: 'Fichas', exact: true }).click();
			const sheet = page.locator('.sheet-backdrop.embedded .sheet');
			await expect(sheet).toBeVisible();
			await expect(sheet.locator('header h2')).toHaveText('Ficha incorporada E2E');
			await expect(page.locator('.sheet-backdrop.floating')).toHaveCount(0);
			await expect(page.locator('.floating-chat')).toHaveCSS('visibility', 'hidden');
			await expect(page.locator('.audio-channels')).toBeVisible();
			await expect(sheet.getByRole('button', { name: 'Salvar ficha' })).toBeVisible();
			await expect(page.getByLabel('Personagem da campanha')).toHaveCount(0);

			const checkEmbeddedGeometry = async (width: number) => {
				const geometry = await sheet.evaluate((node) => {
					const bounds = node.getBoundingClientRect();
					const parent = node.parentElement!.getBoundingClientRect();
					return {
						left: bounds.left,
						right: bounds.right,
						width: bounds.width,
						parentWidth: parent.width,
						scrollWidth: document.documentElement.scrollWidth
					};
				});
				expect(geometry.left).toBeGreaterThanOrEqual(0);
				expect(geometry.right).toBeLessThanOrEqual(width + 1);
				expect(geometry.width).toBeGreaterThan(width * 0.8);
				expect(geometry.width).toBeCloseTo(geometry.parentWidth, 0);
				expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
			};
			await checkEmbeddedGeometry(1440);
			await page.setViewportSize({ width: 390, height: 844 });
			await checkEmbeddedGeometry(390);

			await page.getByPlaceholder('Nome do personagem').fill('Ficha editada na aba');
			await sheet.getByRole('button', { name: 'Salvar ficha' }).click();
			await expect(sheet.locator('footer')).toContainText('Ficha salva.');
			await page.getByRole('button', { name: 'Mesa', exact: true }).click();
			await expect(page.locator('canvas').first()).toBeVisible();
			await expect(page.locator('.floating-chat')).toHaveCSS('visibility', 'visible');
			await page.getByRole('button', { name: 'Fichas', exact: true }).click();
			await expect(page.locator('.sheet-backdrop.embedded .sheet header h2')).toHaveText(
				'Ficha editada na aba'
			);
			await expect(page.locator('.sheet-backdrop.floating')).toHaveCount(0);
			await checkEmbeddedGeometry(390);

			await page.getByRole('button', { name: 'Abrir como painel' }).click();
			const panelSheet = page.locator('.sheet-backdrop.floating .sheet');
			await expect(panelSheet.locator('header h2')).toHaveText('Ficha editada na aba');
			await expect(page.locator('.sheet-backdrop.embedded .sheet')).toBeVisible();

			const popupPromise = page.waitForEvent('popup');
			await page.getByRole('button', { name: 'Abrir em janela auxiliar' }).click();
			const popup = await popupPromise;
			await expect(popup).toHaveURL(
				new RegExp(`/sheet\\?campaign=${fixture.campaignId}.*character=${character.id}`)
			);
			await expect(popup.locator('.sheet-backdrop.standalone .sheet header h2')).toHaveText(
				'Ficha editada na aba'
			);
			await page.getByRole('button', { name: 'Abrir em janela auxiliar' }).click();
			await expect.poll(() => page.context().pages().length).toBe(2);
		} finally {
			await fixture?.close();
		}
	});

	test('GM switches between player sheets and actions use the selected character and campaign', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const secondPlayer = await fixture.addPlayer();
			const first = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Personagem Aurora'
			});
			const second = await fixture.createCharacter(secondPlayer.userId, {
				name: 'Personagem Boreal'
			});
			const gm = fixture.gm;
			await gm.goto(`/?campaign=${fixture.campaignId}&scene=${fixture.sceneId}`);
			await gm.getByRole('button', { name: 'Fichas', exact: true }).click();
			await expect(gm.locator('.floating-chat')).toHaveCSS('visibility', 'hidden');
			const picker = gm.getByLabel('Personagem da campanha');
			await expect(picker).toBeVisible();
			await expect(picker.locator('option')).toHaveCount(2);
			await picker.selectOption(first.id);
			const embedded = gm.locator('.sheet-backdrop.embedded .sheet');
			await expect(embedded.locator('header h2')).toHaveText('Personagem Aurora');
			await expect(embedded.locator('.sheet-owner')).toContainText(fixture.playerDisplayName);
			await picker.selectOption(second.id);
			await expect(embedded.locator('header h2')).toHaveText('Personagem Boreal');
			await expect(embedded.locator('.sheet-owner')).toContainText(secondPlayer.displayName);
			await expect(gm.locator('.sheet-backdrop.embedded .sheet')).toHaveCount(1);

			await embedded.getByRole('button', { name: 'Abrir como painel' }).click();
			const panelSheet = gm.locator('.sheet-backdrop.floating .sheet');
			await expect(panelSheet.locator('header h2')).toHaveText('Personagem Boreal');
			await expect(panelSheet.locator('.sheet-owner')).toContainText(secondPlayer.displayName);

			const popupPromise = gm.waitForEvent('popup');
			await embedded.getByRole('button', { name: 'Abrir em janela auxiliar' }).click();
			const popup = await popupPromise;
			await expect(popup).toHaveURL(
				new RegExp(`/sheet\\?campaign=${fixture.campaignId}.*character=${second.id}`)
			);
			await expect(popup.locator('.sheet-backdrop.standalone .sheet header h2')).toHaveText(
				'Personagem Boreal'
			);
		} finally {
			await fixture?.close();
		}
	});
});
