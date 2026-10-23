import { expect, test } from '@playwright/test';
import { createLocalAuthenticatedFixture, localStackEnabled } from './local-authenticated.helpers';

test.describe('authenticated release gap coverage', () => {
	test.skip(!localStackEnabled, 'Requires the isolated local Supabase stack and local API.');
	test.beforeEach(({ browserName }) => {
		test.skip(browserName !== 'chromium', 'Runs once with controlled desktop viewport.');
	});

	test('narrator rolls a skill from the selected player sheet and both participants receive it', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const character = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Ficha de perícia selecionada E2E',
				class: 'Mago',
				level: 3,
				skillProficiencies: ['Atletismo']
			});
			const { gm, player, campaignId, sceneId } = fixture;
			await gm.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
			await expect(gm.locator('canvas').first()).toBeVisible();
			await gm.getByLabel('Modo de renderização dos dados').selectOption('2d');
			await gm.getByRole('button', { name: 'Fichas', exact: true }).click();
			const picker = gm.getByLabel('Personagem da campanha');
			await expect(picker).toBeVisible();
			await picker.selectOption(character.id);
			await expect(picker).toHaveValue(character.id);
			const sheet = gm.locator('.sheet-backdrop.embedded .sheet');
			await expect(sheet.locator('header h2')).toHaveText('Ficha de perícia selecionada E2E');
			const skillsTab = sheet.locator('.sheet-tabs').getByRole('button', {
				name: 'Perícias',
				exact: true
			});
			await skillsTab.click();

			await player.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
			await expect(player.locator('canvas').first()).toBeVisible();
			await player.getByLabel('Modo de renderização dos dados').selectOption('2d');
			const playerChat = player.locator('.floating-chat');
			if (await playerChat.evaluate((node) => node.classList.contains('closed')))
				await playerChat.locator('.chat-toggle').click();
			await expect(playerChat.locator('.chat-body')).toBeVisible();

			const rollResponse = gm.waitForResponse((response) => {
				const request = response.request();
				return (
					request.method() === 'POST' &&
					new URL(request.url()).pathname ===
						`/api/v1/campaigns/${campaignId}/characters/${character.id}/roll`
				);
			});
			await sheet.getByRole('button', { name: 'Rolar Atletismo' }).click();
			const response = await rollResponse;
			expect(response.status()).toBe(201);
			const result = (await response.json()) as {
				eventId: number;
				dados: number[];
				dadoEscolhido: number;
				modo: string;
				modificador: number;
				total: number;
				label: string;
			};
			expect(result.eventId).toBeGreaterThan(0);
			expect(result.dados).toHaveLength(1);
			expect(result.dadoEscolhido).toBe(result.dados[0]);
			expect(result.modo).toBe('normal');
			expect(result.label).toBe('Teste de Atletismo');
			expect(result.total).toBe(result.dadoEscolhido + result.modificador);

			await gm.getByRole('button', { name: 'Mesa', exact: true }).click();
			const eventId = String(result.eventId);
			for (const participant of [gm, player]) {
				const roll = participant.locator(`.floating-chat [data-event-id="${eventId}"]`);
				await expect(roll).toBeVisible();
				await expect(roll).toContainText('Teste de Atletismo');
				await expect(roll).toContainText(String(result.total));
			}
		} finally {
			await fixture?.close();
		}
	});

	test('narrator changes selected character spell slots one at a time and player writes are denied', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const character = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Ficha de espaços E2E',
				class: 'Mago',
				level: 3
			});
			const { gm, campaignId, sceneId, gmApi, playerApi } = fixture;
			await gm.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
			await expect(gm.locator('canvas').first()).toBeVisible();
			await gm.getByRole('button', { name: 'Fichas', exact: true }).click();
			const picker = gm.getByLabel('Personagem da campanha');
			await expect(picker).toBeVisible();
			await picker.selectOption(character.id);
			const sheet = gm.locator('.sheet-backdrop.embedded .sheet');
			await expect(sheet.locator('header h2')).toHaveText('Ficha de espaços E2E');
			await sheet.getByRole('button', { name: 'Magias', exact: true }).click();
			const group = sheet.getByRole('group', { name: 'Ajustar espaços disponíveis do círculo 1' });
			await expect(group).toBeVisible();
			const decrease = group.getByRole('button', {
				name: 'Diminuir espaços disponíveis do círculo 1'
			});
			const increase = group.getByRole('button', {
				name: 'Aumentar espaços disponíveis do círculo 1'
			});
			await expect(sheet.locator('.spell-circle').filter({ hasText: 'Círculo 1' })).toContainText(
				'4 / 4 disponíveis / máximo'
			);

			await decrease.click();
			await expect(sheet.locator('.spell-circle').filter({ hasText: 'Círculo 1' })).toContainText(
				'3 / 4 disponíveis / máximo'
			);
			const afterDecrease = await gmApi.get(
				`/api/v1/campaigns/${campaignId}/characters/${character.id}`
			);
			expect(afterDecrease.status()).toBe(200);
			const decreasedSheet = (await afterDecrease.json()) as {
				sheet: { spellSlots: Array<{ level: number; current: number; max: number }> };
			};
			expect(decreasedSheet.sheet.spellSlots).toContainEqual({ level: 1, current: 3, max: 4 });

			await increase.click();
			await expect(sheet.locator('.spell-circle').filter({ hasText: 'Círculo 1' })).toContainText(
				'4 / 4 disponíveis / máximo'
			);
			const afterIncrease = await gmApi.get(
				`/api/v1/campaigns/${campaignId}/characters/${character.id}`
			);
			expect(afterIncrease.status()).toBe(200);
			const increasedSheet = (await afterIncrease.json()) as {
				sheet: { spellSlots: Array<{ level: number; current: number; max: number }> };
			};
			expect(increasedSheet.sheet.spellSlots).toContainEqual({ level: 1, current: 4, max: 4 });

			await gm.reload();
			await gm.getByRole('button', { name: 'Fichas', exact: true }).click();
			await gm.getByLabel('Personagem da campanha').selectOption(character.id);
			const reloadedSheet = gm.locator('.sheet-backdrop.embedded .sheet');
			await expect(reloadedSheet.locator('header h2')).toHaveText('Ficha de espaços E2E');
			await reloadedSheet.getByRole('button', { name: 'Magias', exact: true }).click();
			await expect(
				reloadedSheet.locator('.spell-circle').filter({ hasText: 'Círculo 1' })
			).toContainText('4 / 4 disponíveis / máximo');

			const denied = await playerApi.patch(
				`/api/v1/campaigns/${campaignId}/characters/${character.id}/spell-slots`,
				{ data: { level: 1, current: 3 } }
			);
			expect(denied.status()).toBe(403);
			const afterDeniedWrite = await gmApi.get(
				`/api/v1/campaigns/${campaignId}/characters/${character.id}`
			);
			expect(afterDeniedWrite.status()).toBe(200);
			const unchangedSheet = (await afterDeniedWrite.json()) as {
				sheet: { spellSlots: Array<{ level: number; current: number; max: number }> };
			};
			expect(unchangedSheet.sheet.spellSlots).toContainEqual({ level: 1, current: 4, max: 4 });
		} finally {
			await fixture?.close();
		}
	});
});
