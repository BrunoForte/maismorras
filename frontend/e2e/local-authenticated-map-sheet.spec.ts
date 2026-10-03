import { expect, test, type Locator, type Page } from '@playwright/test';
import { createLocalAuthenticatedFixture, localStackEnabled } from './local-authenticated.helpers';

test.describe('local authenticated map and character sheet E2E', () => {
	test.skip(!localStackEnabled, 'Runs only against the isolated local Supabase stack in CI.');
	test.beforeEach(({ page }, testInfo) => {
		page.setDefaultTimeout(30_000);
		test.skip(testInfo.project.name !== 'chromium', 'Runs once on desktop.');
	});

	test('map survives repeated tab changes and keeps token selection and chat usable', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		const renderErrors: string[] = [];
		try {
			await test.step('prepare authenticated campaign, owned character and token', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Mapa E2E',
					hitPointsCurrent: 16,
					hitPointsMax: 16
				});
				await fixture.createCharacterToken(character.id);
			});
			const f = fixture!;
			f.player.on('pageerror', (error) =>
				renderErrors.push(sanitizeBrowserDiagnostic(error.message))
			);
			f.player.on('console', (message) => {
				if (message.type() === 'error')
					renderErrors.push(sanitizeBrowserDiagnostic(message.text()));
			});
			await test.step('alternate between map, sheets and library without reloading', async () => {
				await openMap(f.player, f.campaignId, f.sceneId);
				for (let cycle = 0; cycle < 3; cycle += 1) {
					await f.player.getByRole('button', { name: 'Fichas', exact: true }).click();
					await expect(f.player.locator('canvas')).toHaveCount(0);
					await f.player.getByRole('button', { name: 'Mídias', exact: true }).click();
					await expect(f.player.locator('.library-view')).toBeVisible();
					await f.player.getByRole('button', { name: 'Mesa', exact: true }).click();
					await expect(f.player.locator('canvas').first()).toBeVisible();
				}
			});
			await test.step('select the player token and send a campaign chat message', async () => {
				await selectTokenAtDefaultPosition(f.player);
				await expect(
					f.player.getByRole('region', { name: /Ficha resumida do personagem/i })
				).toContainText('Mapa E2E');
				const message = `chat-mapa-${Date.now()}`;
				await f.player.getByPlaceholder(/Mensagem ou \/r/i).fill(message);
				await f.player.getByRole('button', { name: 'Enviar mensagem' }).click();
				await expect(
					f.player.locator('.floating-chat [data-event-id]').filter({ hasText: message })
				).toBeVisible();
			});
			await test.step('reject duplicate keyed each blocks and all uncaught/render errors', async () => {
				expect(
					renderErrors.filter((entry) => /each_key_duplicate|uncaught|render/i.test(entry))
				).toEqual([]);
				expect(renderErrors, renderErrors.join('\n')).toEqual([]);
				expect(f.player.url()).toContain(`/`);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('resizable floating panels collapse physically and restore above the audio footer', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare narrator map with a linked player token', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Painéis E2E',
					hitPointsCurrent: 14,
					hitPointsMax: 14
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			});
			const page = fixture!.gm;
			const chat = page.locator('.floating-chat');
			await test.step('resize, minimize and restore table chat', async () => {
				await setExpandedSize(chat, 480, 390);
				const beforeMove = (await chat.boundingBox())!;
				await dragPanel(page, chat.locator('.panel-grip'), 42, 28);
				await expect
					.poll(() => chat.evaluate((node) => node.getBoundingClientRect().left))
					.toBeGreaterThan(beforeMove.x + 25);
				await assertAboveAudioFooter(page, chat);
				await collapseAndRestore(
					chat,
					page,
					'Chat da mesa',
					'Abrir chat',
					'.chat-body',
					'.chat-titlebar'
				);
				await expect(chat).toHaveCSS('resize', 'both');
			});
			await test.step('dock the sheet without covering the actor drawer or audio footer', async () => {
				await selectTokenAtDefaultPosition(page);
				await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				const sheet = page.locator('.sheet-backdrop.docked .sheet');
				const actors = page.locator('.actor-drawer');
				await expect(sheet).toBeVisible();
				await expect(actors).toBeVisible();
				await expect(actors.locator('.drawer-toggle')).toBeVisible();
				await assertPanelsDoNotOverlap(page, sheet, actors);
				await assertAboveAudioFooter(page, sheet);
				await page.setViewportSize({ width: 390, height: 844 });
				await assertPanelsDoNotOverlap(page, sheet, actors);
				await assertAboveAudioFooter(page, sheet);
				await expect(actors.locator('.drawer-toggle')).toBeVisible();
				await page.setViewportSize({ width: 1280, height: 900 });
			});
		} finally {
			await fixture?.close();
		}
	});

	test('chat and sheet remain reachable together on desktop and narrow viewports', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('open the player sheet with chat and actors visible on the GM map', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Painéis simultâneos E2E',
					hitPointsCurrent: 11,
					hitPointsMax: 11
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			});
			const page = fixture!.gm;
			const chat = page.locator('.floating-chat');
			const actors = page.locator('.actor-drawer');
			if (await chat.evaluate((node) => node.classList.contains('closed')))
				await page.getByRole('button', { name: 'Abrir chat' }).click();
			await selectTokenAtDefaultPosition(page);
			await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
			await page.getByRole('button', { name: 'Fixar ficha' }).click();
			const sheet = page.locator('.sheet-backdrop.floating .sheet');
			await expect(sheet).toBeVisible();
			await expect(chat).not.toHaveClass(/closed/);
			await expect(actors).toBeVisible();
			await test.step('keep titles, controls, navigation, actors, and footer accessible on desktop', async () => {
				await assertPanelsDoNotOverlap(page, chat, sheet);
				await assertPanelsDoNotOverlap(page, sheet, actors);
				await assertPanelsDoNotOverlap(page, chat, actors);
				await assertTitleReachable(page, chat, '.chat-titlebar');
				await assertTitleReachable(page, sheet, 'header');
				await assertAboveAudioFooter(page, chat);
				await assertAboveAudioFooter(page, sheet);
				await expect(actors.locator('.drawer-toggle')).toBeVisible();
				await page.getByRole('button', { name: 'Fichas', exact: true }).click();
				await expect(sheet).toBeVisible();
				await page.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(page.locator('canvas').first()).toBeVisible();
				await expect(sheet).toBeVisible();
			});
		} finally {
			await fixture?.close();
		}
	});

	test('floating chat and sheet resize, move, minimize, restore and raise independently', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('open both panels on the authenticated GM map', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Painéis movíveis E2E'
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			});
			const page = fixture!.gm;
			const chat = page.locator('.floating-chat');
			if (await chat.evaluate((node) => node.classList.contains('closed')))
				await page.getByRole('button', { name: 'Abrir chat' }).click();
			await selectTokenAtDefaultPosition(page);
			await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
			const sheet = page.locator('.sheet-backdrop .sheet');
			await expect(sheet).toBeVisible();
			await test.step('resize and move both panels inside the usable viewport', async () => {
				await expect(page.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
				await setExpandedSize(chat, 420, 160);
				await setExpandedSize(sheet, 700, 160);
				await dragPanel(page, chat.locator('.panel-grip'), 24, 18);
				await assertAboveAudioFooter(page, chat);
				await assertAboveAudioFooter(page, sheet);
			});
			await test.step('bring each panel forward and collapse/restore without losing its contents', async () => {
				const sheetFront = sheet.getByRole('button', { name: 'Trazer ficha à frente' });
				const chatFront = chat.getByRole('button', { name: 'Trazer chat à frente' });
				await expect(sheetFront).toBeVisible();
				await expect(chatFront).toBeVisible();
				await chatFront.click();
				const chatLayer = Number(await chat.evaluate((node) => getComputedStyle(node).zIndex));
				await sheetFront.click();
				const sheetLayer = Number(
					await page.locator('.sheet-backdrop').evaluate((node) => getComputedStyle(node).zIndex)
				);
				expect(sheetLayer).toBeGreaterThan(chatLayer);
				await collapseAndRestore(
					chat,
					page,
					'Chat da mesa',
					'Abrir chat',
					'.chat-body',
					'.chat-titlebar'
				);
				await sheet.getByRole('button', { name: 'Minimizar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toHaveCount(0);
				await page.getByRole('button', { name: 'Restaurar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toBeVisible();
			});
		} finally {
			await fixture?.close();
		}
	});

	test('chat, docked sheet, actors and audio footer fit a narrow viewport', async ({ browser }) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare a compact authenticated map with all three panels', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Painéis mobile E2E'
				});
				await fixture.createCharacterToken(character.id);
				await fixture.gm.setViewportSize({ width: 390, height: 844 });
				await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			});
			const page = fixture!.gm;
			const chat = page.locator('.floating-chat');
			const actors = page.locator('.actor-drawer');
			if (await chat.evaluate((node) => node.classList.contains('closed')))
				await page.getByRole('button', { name: 'Abrir chat' }).click();
			await page.getByRole('button', { name: 'Fichas', exact: true }).click();
			await page.getByLabel('Participante / personagem').selectOption(fixture!.playerUserId);
			await page.getByRole('button', { name: 'Exibir ficha selecionada' }).click();
			const sheet = page.locator('.sheet-backdrop.floating .sheet');
			await expect(sheet).toBeVisible();
			await page.getByRole('button', { name: 'Mesa', exact: true }).click();
			await expect(page.locator('canvas').first()).toBeVisible();
			await test.step('keep all titles, navigation, actors and audio footer reachable without overlap', async () => {
				await assertPanelsDoNotOverlap(page, chat, sheet);
				await assertPanelsDoNotOverlap(page, sheet, actors);
				await assertPanelsDoNotOverlap(page, chat, actors);
				await assertTitleReachable(page, chat, '.chat-titlebar');
				await assertTitleReachable(page, sheet, 'header');
				await assertAboveAudioFooter(page, chat);
				await assertAboveAudioFooter(page, sheet);
				const actorBox = (await actors.boundingBox())!;
				const footerBox = (await page.locator('.audio-channels').boundingBox())!;
				expect(actorBox.y + actorBox.height).toBeLessThanOrEqual(footerBox.y + 2);
				await page.getByRole('button', { name: 'Fichas', exact: true }).click();
				await expect(sheet).toBeVisible();
				await page.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(page.locator('canvas').first()).toBeVisible();
				await expect(sheet).toBeVisible();
			});
			await test.step('minimize and restore both panels while the mobile map remains usable', async () => {
				const chatToggle = chat.getByRole('button', { name: 'Chat da mesa' });
				await assertControlReachable(page, chatToggle);
				await chatToggle.click();
				await expect(chat).toHaveClass(/closed/);
				await expect(chat.locator('.chat-body')).toHaveCount(0);
				await page.getByRole('button', { name: 'Abrir chat' }).click();
				await expect(chat.locator('.chat-body')).toBeVisible();
				await page.getByRole('button', { name: 'Minimizar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toHaveCount(0);
				await page.getByRole('button', { name: 'Restaurar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toBeVisible();
				await assertAboveAudioFooter(page, sheet);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player restores chat across map tab switches', async ({ browser }) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare the authenticated player map', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
			});
			const player = fixture!.player;
			const chat = player.locator('.floating-chat');
			await test.step('minimize chat, swap tabs, and restore its saved size', async () => {
				await setExpandedSize(chat, 440, 340);
				const expandedWidth = (await chat.boundingBox())!.width;
				await player.getByRole('button', { name: 'Chat da mesa' }).click();
				await expect(chat).toHaveClass(/closed/);
				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await player.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(chat).toHaveClass(/closed/);
				await expect(chat.locator('.chat-body')).toHaveCount(0);
				await player.getByRole('button', { name: 'Abrir chat' }).click();
				await expect(chat.locator('.chat-body')).toBeVisible();
				await expect
					.poll(() => chat.evaluate((node) => node.getBoundingClientRect().width))
					.toBeGreaterThan(expandedWidth - 10);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('chat preferences stay isolated by campaign and survive remount and reload', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		let secondCampaignId: string | undefined;
		let campaignAPosition = 0;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const secondCampaignResponse = await fixture.gmApi.post('/api/v1/campaigns', {
				data: { name: 'Campanha B de preferências E2E', systemId: 'dnd2024' }
			});
			expect(secondCampaignResponse.status()).toBe(201);
			const secondCampaign = (await secondCampaignResponse.json()) as { id: string };
			secondCampaignId = secondCampaign.id;
			const secondScenesResponse = await fixture.gmApi.get(
				`/api/v1/campaigns/${secondCampaign.id}/scenes`
			);
			expect(secondScenesResponse.status()).toBe(200);
			const secondScenes = (await secondScenesResponse.json()) as {
				scenes: Array<{ id: string }>;
			};
			expect(secondScenes.scenes).toHaveLength(1);

			const page = fixture.gm;
			await openMap(page, fixture.campaignId, fixture.sceneId);
			const chat = page.locator('.floating-chat');
			await test.step('save campaign A size, moved position, collapsed state and dock mode', async () => {
				await setExpandedSize(chat, 510, 360);
				await dragPanel(page, chat.locator('.panel-grip'), 56, 44);
				campaignAPosition = (await chat.boundingBox())!.x;
				await chat.getByRole('button', { name: 'Acoplar' }).click();
				await page.getByRole('button', { name: 'Chat da mesa' }).click();
				await expect(chat).toHaveClass(/closed/);
			});

			await test.step('campaign B starts with its own defaults instead of inheriting campaign A', async () => {
				await openMap(page, secondCampaign.id, secondScenes.scenes[0].id);
				const campaignBChat = page.locator('.floating-chat');
				await expect(campaignBChat).not.toHaveClass(/closed/);
				await expect(campaignBChat).not.toHaveClass(/docked/);
				const size = await campaignBChat.boundingBox();
				expect(size).toBeTruthy();
				expect(Math.abs(size!.width - 510)).toBeGreaterThan(30);
				await expect
					.poll(() => campaignBChat.evaluate((node) => node.getBoundingClientRect().left))
					.toBeLessThan(campaignAPosition - 20);
			});

			await test.step('return to campaign A and restore its own state after reload', async () => {
				await openMap(page, fixture!.campaignId, fixture!.sceneId);
				const campaignAChat = page.locator('.floating-chat');
				await expect(campaignAChat).toHaveClass(/closed/);
				await expect(campaignAChat).toHaveClass(/docked/);
				await page.getByRole('button', { name: 'Abrir chat' }).click();
				await expect(campaignAChat).not.toHaveClass(/closed/);
				await expect
					.poll(() => campaignAChat.evaluate((node) => node.getBoundingClientRect().width))
					.toBeGreaterThan(500);
				const movedLeft = (await campaignAChat.boundingBox())!.x;
				await page.reload();
				await expect(page.locator('canvas').first()).toBeVisible();
				const restoredChat = page.locator('.floating-chat');
				await expect(restoredChat).not.toHaveClass(/closed/);
				await expect(restoredChat).toHaveClass(/docked/);
				await expect
					.poll(() => restoredChat.evaluate((node) => node.getBoundingClientRect().width))
					.toBeGreaterThan(500);
				await expect
					.poll(() => restoredChat.evaluate((node) => node.getBoundingClientRect().left))
					.toBeGreaterThan(movedLeft - 10);
			});
		} finally {
			if (fixture && secondCampaignId)
				await fixture.gmApi.delete(`/api/v1/campaigns/${secondCampaignId}`).catch(() => undefined);
			await fixture?.close();
		}
	});

	test('player sheet stays accessible and restores its size across map tabs', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare the authenticated player sheet and map', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Painel jogador E2E',
					hitPointsCurrent: 12,
					hitPointsMax: 12
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
				await fixture.player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await fixture.player.getByRole('button', { name: 'Abrir minha ficha' }).first().click();
			});
			const player = fixture!.player;
			const sheet = player.locator('.sheet-backdrop.floating .sheet');
			await expect(sheet).toBeVisible();
			await expect(sheet.locator('header h2')).toHaveText('Painel jogador E2E');
			const expandedHeight = (await sheet.boundingBox())!.height;
			await test.step('minimize the sheet and preserve state while swapping tabs', async () => {
				await player.getByRole('button', { name: 'Minimizar ficha' }).click();
				const headerHeight = await sheet
					.locator('header')
					.evaluate((node) => node.getBoundingClientRect().height);
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().height))
					.toBeLessThanOrEqual(headerHeight + 4);
				await expect(sheet).toHaveCSS('resize', 'none');
				await expect(sheet.locator('.sheet-body')).toHaveCount(0);
				await player.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(player.locator('canvas').first()).toBeVisible();
				await expect(sheet).toBeVisible();
				await expect(sheet).toHaveClass(/minimized/);
				await player.getByRole('button', { name: 'Restaurar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toBeVisible();
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().height))
					.toBeGreaterThan(expandedHeight - 10);
				await assertAboveAudioFooter(player, sheet);
			});
			await test.step('confirm the player never receives the GM actors panel', async () => {
				await expect(player.locator('.actor-drawer')).toHaveCount(0);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('GM actor panel retains minimized state and restores after map remount', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare GM map with an actor', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				await fixture.createCharacter(fixture.playerUserId, { name: 'Ator em remount E2E' });
				await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			});
			const gm = fixture!.gm;
			const actors = gm.locator('.actor-drawer');
			await setExpandedSize(actors, 410, 330);
			await gm.locator('.actor-drawer .drawer-toggle').click();
			await expect(actors).toHaveClass(/closed/);
			await gm.getByRole('button', { name: 'Compêndio', exact: true }).click();
			await gm.getByRole('button', { name: 'Mesa', exact: true }).click();
			await expect(actors).toHaveClass(/closed/);
			await expect(actors.locator('.drawer-body')).toHaveCount(0);
			await gm.getByRole('button', { name: 'Abrir atores' }).click();
			await expect(actors.locator('.drawer-body')).toBeVisible();
			await expect
				.poll(() => actors.evaluate((node) => node.getBoundingClientRect().height))
				.toBeGreaterThan(300);
		} finally {
			await fixture?.close();
		}
	});

	test('standalone sheet uses authenticated session, enforces ownership and stays isolated', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare independent player and narrator character sheets', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const own = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Ficha própria E2E'
				});
				await fixture.createCharacter(fixture.gmUserId, { name: 'Ficha alheia E2E' });
				await fixture.createCharacterToken(own.id);
			});
			const f = fixture!;
			const roster = await f.gmApi.get(`/api/v1/campaigns/${f.campaignId}/participants`);
			const participants = (await roster.json()) as {
				participants: Array<{ userId: string; character: { id: string } | null }>;
			};
			const playerCharacter = participants.participants.find(
				(item) => item.userId === f.playerUserId
			)?.character;
			const gmCharacter = participants.participants.find(
				(item) => item.userId === f.gmUserId
			)?.character;
			expect(playerCharacter).toBeTruthy();
			expect(gmCharacter).toBeTruthy();
			await test.step('popup opens the isolated own sheet without auth credentials in its URL', async () => {
				await openMap(f.player, f.campaignId, f.sceneId);
				await selectTokenAtDefaultPosition(f.player);
				const popupPromise = f.player.waitForEvent('popup');
				await f.player.getByRole('button', { name: 'Abrir ficha em janela auxiliar' }).click();
				const popup = await popupPromise;
				await expect(popup.locator('.sheet')).toBeVisible({ timeout: 20_000 });
				expect(new URL(popup.url()).pathname).toBe('/sheet');
				expect(popup.url()).toContain(`campaign=${f.campaignId}`);
				expect(popup.url()).toContain(`character=${playerCharacter!.id}`);
				expect(popup.url()).toContain('auxiliary=1');
				expect(popup.url()).not.toMatch(/access_token|refresh_token|authorization|jwt/i);
				const popupState = await popup.evaluate(() => ({
					name: window.name,
					openerIsNull: window.opener === null,
					width: window.outerWidth,
					height: window.outerHeight
				}));
				expect(popupState.name).toContain(
					`maismorras-sheet-${f.campaignId}-${playerCharacter!.id}`
				);
				expect(popupState.openerIsNull).toBe(true);
				expect(popupState.width).toBeGreaterThan(600);
				expect(popupState.height).toBeGreaterThan(500);
				await expect(
					popup.locator('canvas, .app-header, .floating-chat, .actor-drawer, .audio-channels')
				).toHaveCount(0);
				const pageCount = f.player.context().pages().length;
				await f.player.getByRole('button', { name: 'Abrir ficha em janela auxiliar' }).click();
				await expect.poll(() => f.player.context().pages().length).toBe(pageCount);
				await expect(popup.locator('.sheet')).toBeVisible();
				await popup.close();
			});
			await test.step('player opens only their isolated sheet and cannot substitute another character', async () => {
				await f.player.goto(`/sheet?campaign=${f.campaignId}&character=${playerCharacter!.id}`);
				await expect(f.player.locator('.sheet')).toBeVisible({ timeout: 20_000 });
				await expect(f.player.locator('.sheet')).toContainText('Ficha própria E2E');
				await expect(
					f.player.locator('canvas, .app-header, .floating-chat, .actor-drawer, .audio-channels')
				).toHaveCount(0);
				expect(f.player.url()).not.toMatch(/access_token|refresh_token|authorization|jwt/i);
				await f.player.goto(`/sheet?campaign=${f.campaignId}&character=${gmCharacter!.id}`);
				await expect(f.player.getByRole('alert')).toContainText(
					/não está disponível|permission to open/i,
					{ timeout: 15_000 }
				);
			});
			await test.step('GM can open the player sheet and a non-popup close returns safely', async () => {
				await f.gm.goto(`/sheet?campaign=${f.campaignId}&character=${playerCharacter!.id}`);
				await expect(f.gm.locator('.sheet')).toBeVisible({ timeout: 20_000 });
				await expect(f.gm.locator('.sheet')).toContainText('Ficha própria E2E');
				await f.gm.getByRole('button', { name: 'Fechar' }).click();
				await expect(f.gm).toHaveURL(/\/$/);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player summary updates HP, rolls weapon actions, casts own spell and publishes it to campaign chat', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare owned token with a weapon and a slotted spell', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Ações E2E',
					class: 'Mago',
					spellcastingOverride: true,
					hitPointsCurrent: 18,
					hitPointsMax: 18,
					inventory: [
						{
							entryId: 'e2e-dagger',
							name: 'Adaga E2E',
							quantity: 1,
							equipped: true,
							rules: {
								category: 'weapon',
								damage: '1d4',
								attackAbility: 'dexterity',
								attackType: 'melee',
								proficient: true
							}
						}
					],
					attacks: [],
					spells: [
						{
							name: 'Luz E2E',
							level: 0,
							notes: 'Uma luz aparece.',
							description: 'Uma luz aparece.'
						},
						{
							name: 'Mísseis E2E',
							level: 1,
							notes: 'Três dardos causam 3d4+3 de dano.',
							description: 'Três dardos causam 3d4+3 de dano.',
							diceFormula: '3d4+3'
						}
					],
					spellSlots: [{ level: 1, current: 1, max: 1 }]
				});
				await fixture.createCharacterToken(character.id);
			});
			const f = fixture!;
			await openMap(f.player, f.campaignId, f.sceneId);
			await selectTokenAtDefaultPosition(f.player);
			const inspector = f.player.locator('.token-inspector');
			const characterResponse = () =>
				f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/character`);
			await test.step('apply signed relative HP adjustment', async () => {
				await f.player.getByLabel(/PV atuais/).fill('-10');
				await f.player.getByLabel(/PV atuais/).press('Enter');
				await expect
					.poll(async () =>
						(await characterResponse())
							.json()
							.then(
								(value) => (value as { sheet: { hitPointsCurrent: number } }).sheet.hitPointsCurrent
							)
					)
					.toBe(8);
			});
			await test.step('roll attack and damage for the weapon', async () => {
				const readRolls = async () => {
					const response = await f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/events`);
					expect(response.ok()).toBeTruthy();
					const result = (await response.json()) as {
						events: Array<{ type: string; payload: { expressao?: string } }>;
					};
					return result.events.filter((event) => event.type === 'dice.roll');
				};
				const beforeAttack = (await readRolls()).length;
				await inspector.getByRole('button', { name: 'Ataque', exact: true }).first().click();
				await expect.poll(async () => (await readRolls()).length).toBeGreaterThan(beforeAttack);
				const afterAttack = await readRolls();
				expect(afterAttack.at(-1)?.payload.expressao).toMatch(/^1d20/);
				const beforeDamage = afterAttack.length;
				await inspector.getByRole('button', { name: 'Dano', exact: true }).first().click();
				await expect.poll(async () => (await readRolls()).length).toBeGreaterThan(beforeDamage);
				expect((await readRolls()).at(-1)?.payload.expressao).toMatch(/\d+d4/);
			});
			await test.step('cast owned leveled spell and verify its slot was consumed', async () => {
				await inspector
					.locator('.spell-groups details')
					.filter({ hasText: '1º círculo' })
					.locator('summary')
					.click();
				await inspector.getByRole('button', { name: 'Lançar' }).click();
				await expect
					.poll(async () => {
						const value = (await (await characterResponse()).json()) as {
							sheet: { spellSlots: Array<{ level: number; current: number }> };
						};
						return value.sheet.spellSlots.find((slot) => slot.level === 1)?.current;
					})
					.toBe(0);
			});
			await test.step('display spell as a persisted campaign chat message', async () => {
				await inspector.getByRole('button', { name: 'Exibir' }).last().click();
				await expect(
					f.player.locator('.floating-chat article:not(.combat)').filter({
						hasText: /Mísseis E2E/
					})
				).toBeVisible();
				const eventsResponse = await f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/events`);
				expect(eventsResponse.ok()).toBeTruthy();
				const events = (await eventsResponse.json()) as {
					events: Array<{ type: string; payload: { text?: string } }>;
				};
				expect(
					events.events.some(
						(event) => event.type === 'chat.message' && event.payload.text?.includes('Mísseis E2E')
					)
				).toBeTruthy();
			});
		} finally {
			await fixture?.close();
		}
	});

	test('armor descriptions span the combat panel and sheet actions share a responsive style', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare a player token with equipped armor description', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Armadura layout E2E',
					inventory: [
						{
							entryId: 'e2e-half-plate',
							name: 'Meia armadura',
							quantity: 1,
							equipped: true,
							rules: {
								category: 'armor',
								ac: '15 + Dex (máx. 2)',
								description: 'Placas articuladas protegem o torso e os braços.'
							}
						}
					]
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
			});
			const page = fixture!.player;
			await selectTokenAtDefaultPosition(page);
			const actions = page.locator('.token-inspector .sheet-actions');
			await test.step('linked-sheet controls share dimensions, typography, focus surface, and side-by-side desktop layout', async () => {
				const styles = await actions.locator('button').evaluateAll((nodes) =>
					nodes.map((node) => {
						const style = getComputedStyle(node);
						const bounds = node.getBoundingClientRect();
						return {
							width: bounds.width,
							height: bounds.height,
							border: style.border,
							font: style.font,
							padding: style.padding,
							background: style.backgroundColor
						};
					})
				);
				expect(styles).toHaveLength(2);
				const [first, second] = styles;
				expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
				expect({ ...first, width: 0 }).toEqual({ ...second, width: 0 });
				const desktopColumns = await actions.evaluate(
					(node) => getComputedStyle(node).gridTemplateColumns
				);
				expect(desktopColumns.trim().split(/\s+/)).toHaveLength(2);
			});
			await test.step('equipped armor description occupies the full row in the combat tab', async () => {
				await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				const sheet = page.locator('.sheet-backdrop.floating .sheet');
				await expect(sheet).toBeVisible();
				await sheet.getByRole('button', { name: 'Combate', exact: true }).click();
				const description = sheet.locator('.combat-armor-list .armor-description');
				await expect(description).toContainText('Placas articuladas protegem');
				const width = await description.evaluate((node) => node.getBoundingClientRect().width);
				const rowWidth = await description.evaluate(
					(node) => node.parentElement!.getBoundingClientRect().width
				);
				expect(width).toBeGreaterThanOrEqual(rowWidth * 0.95);
			});
			await test.step('narrow layout stacks both sheet actions without changing their style', async () => {
				await page.setViewportSize({ width: 520, height: 850 });
				await expect
					.poll(() =>
						actions.evaluate((node) =>
							getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/)
						)
					)
					.toHaveLength(1);
				const styles = await actions
					.locator('button')
					.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).border));
				expect(styles[0]).toBe(styles[1]);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('GM cannot cast through the own-character route for a selected player; display reaches chat and presentation', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare player character with cantrip and slotted spell', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Alvo do narrador',
					spellcastingOverride: true,
					spells: [
						{ name: 'Truque alvo E2E', level: 0, notes: 'Efeito de teste.' },
						{ name: 'Magia alvo E2E', level: 1, notes: 'Efeito com espaço.', diceFormula: '1d6' }
					],
					spellSlots: [{ level: 1, current: 1, max: 1 }]
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
				await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			});
			const f = fixture!;
			const unauthorizedSpellRequests: string[] = [];
			f.gm.on('request', (request) => {
				if (
					request.method() === 'POST' &&
					request.url().includes(`/api/v1/campaigns/${f.campaignId}/character/cast-spell`)
				)
					unauthorizedSpellRequests.push('POST');
			});
			await test.step('select player token and confirm both cantrip and leveled casting are disabled', async () => {
				await selectTokenAtDefaultPosition(f.gm);
				const inspector = f.gm.locator('.token-inspector');
				const cantrip = inspector
					.locator('.spell-groups details')
					.filter({ hasText: 'Truque alvo E2E' });
				await cantrip.locator('summary').click();
				const spell = inspector
					.locator('.spell-groups details')
					.filter({ hasText: 'Magia alvo E2E' });
				await spell.locator('summary').click();
				await expect(
					cantrip
						.locator('.spell-row')
						.filter({ hasText: 'Truque alvo E2E' })
						.getByRole('button', { name: 'Lançar' })
				).toBeDisabled();
				await expect(
					spell
						.locator('.spell-row')
						.filter({ hasText: 'Magia alvo E2E' })
						.getByRole('button', { name: 'Lançar' })
				).toBeDisabled();
				expect(unauthorizedSpellRequests).toEqual([]);
			});
			await test.step('GM display publishes chat and updates the scene presentation', async () => {
				const inspector = f.gm.locator('.token-inspector');
				const spellGroup = inspector
					.locator('.spell-groups details')
					.filter({ hasText: 'Magia alvo E2E' });
				if (!(await spellGroup.evaluate((node) => (node as HTMLDetailsElement).open))) {
					await spellGroup.locator('summary').click();
				}
				const spell = spellGroup.locator('.spell-row').filter({ hasText: 'Magia alvo E2E' });
				const displayAction = spell.getByRole('button', { name: 'Exibir' });
				await displayAction.scrollIntoViewIfNeeded();
				await displayAction.click();
				await expect(
					f.gm.locator('.floating-chat [data-event-id]').filter({ hasText: 'Magia alvo E2E' })
				).toBeVisible();
				await expect(f.player.locator('.presentation-text')).toContainText('Magia alvo E2E');
				await expect(f.player.locator('.presentation-text')).toContainText('Efeito com espaço.');
				await expect
					.poll(async () => {
						const response = await f.gmApi.get(`/api/v1/scenes/${f.sceneId}/presentation`);
						if (!response.ok()) return '';
						return ((await response.json()) as { title?: string }).title ?? '';
					})
					.toContain('Magia alvo E2E');
				expect(unauthorizedSpellRequests).toEqual([]);
				await f.gm.getByRole('button', { name: 'Mídias', exact: true }).click();
				await expect(f.gm.getByTestId('presentation-status')).toContainText('Magia alvo E2E');
				await expect(f.gm.getByTestId('presentation-status')).toContainText('oculta');
				await f.gm.getByRole('button', { name: 'Ocultar mídia' }).click();
				await expect(f.gm.getByTestId('presentation-status')).toContainText(
					'Nenhuma mídia em exibição'
				);
				await expect(f.player.locator('.presentation-text')).toHaveCount(0);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player sheet floats by default, can dock, opens an auxiliary window, and survives map navigation', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare a saved player sheet and open it from the Sheets tab', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Ficha flutuante E2E',
					hitPointsCurrent: 10,
					hitPointsMax: 10
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
				await fixture.player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await expect(fixture.player.locator('.sheets-view')).toBeVisible();
				await fixture.player.getByRole('button', { name: 'Abrir minha ficha' }).first().click();
				const sheet = fixture.player.locator('.sheet-backdrop.floating .sheet');
				await expect(sheet).toBeVisible({ timeout: 20_000 });
				await fixture.player.getByPlaceholder('Nome do personagem').fill('Ficha persistida E2E');
				await sheet.getByRole('button', { name: 'Salvar ficha' }).click();
				await expect
					.poll(async () => {
						const response = await fixture!.playerApi.get(
							`/api/v1/campaigns/${fixture!.campaignId}/character`
						);
						return ((await response.json()) as { sheet: { name: string } }).sheet.name;
					})
					.toBe('Ficha persistida E2E');
			});
			const player = fixture!.player;
			const sheet = player.locator('.sheet-backdrop .sheet');
			await test.step('opening the same owned sheet from the map focuses its existing instance', async () => {
				await sheet.evaluate((node) => (node.dataset.instanceMarker = 'same-sheet-instance'));
				await player.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(player.locator('canvas').first()).toBeVisible();
				await selectTokenAtDefaultPosition(player);
				await player.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				await expect(sheet.locator('header h2')).toHaveText('Ficha persistida E2E');
				await expect(sheet).toHaveAttribute('data-instance-marker', 'same-sheet-instance');
				await expect(player.locator('.sheet-backdrop .sheet')).toHaveCount(1);
			});
			await test.step('confirm floating default, move, resize, and navigate', async () => {
				await expect(player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
				await expect(sheet.locator('.sheet-mode-status')).toHaveText('Flutuante');
				await assertAboveAudioFooter(player, sheet);
				const before = (await sheet.boundingBox())!;
				const title = (await sheet.locator('header').boundingBox())!;
				await player.mouse.move(title.x + title.width * 0.45, title.y + title.height / 2);
				await player.mouse.down();
				await player.mouse.move(title.x + title.width * 0.45 - 45, title.y + title.height / 2 + 32);
				await player.mouse.up();
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().top))
					.toBeGreaterThan(before.y + 15);
				const beforeResize = (await sheet.boundingBox())!;
				await player.mouse.move(
					beforeResize.x + beforeResize.width - 4,
					beforeResize.y + beforeResize.height - 4
				);
				await player.mouse.down();
				await player.mouse.move(
					beforeResize.x + beforeResize.width + 32,
					beforeResize.y + beforeResize.height + 24,
					{ steps: 4 }
				);
				await player.mouse.up();
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width))
					.toBeGreaterThan(beforeResize.width + 15);
				await player.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(player.locator('canvas').first()).toBeVisible();
				await expect(sheet).toBeVisible();
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width))
					.toBeGreaterThan(beforeResize.width + 15);
				await assertAboveAudioFooter(player, sheet);
				await sheet.getByRole('button', { name: 'Fixar ficha' }).click();
				await expect(player.locator('.sheet-backdrop.docked .sheet')).toBeVisible();
				await expect(sheet.locator('.sheet-mode-status')).toHaveText('Acoplada');
				await assertAboveAudioFooter(player, sheet);
				await sheet.getByRole('button', { name: 'Destacar ficha' }).click();
				await expect(player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
				const [standalone] = await Promise.all([
					player.waitForEvent('popup'),
					sheet.getByRole('button', { name: 'Abrir ficha em janela auxiliar' }).click()
				]);
				await expect(standalone).toHaveURL(/\/sheet\?campaign=[^&]+&character=[^&]+/);
				expect(standalone.url()).toContain('auxiliary=1');
				expect(standalone.url()).not.toMatch(/access_token|token|jwt/i);
				expect(await standalone.evaluate(() => window.opener === null)).toBe(true);
				expect(await standalone.evaluate(() => window.name)).toContain('maismorras-sheet-');
				await expect(standalone.locator('.sheet-backdrop.standalone .sheet header h2')).toHaveText(
					'Ficha persistida E2E'
				);
				await expect(
					standalone.locator('canvas, .app-header, .floating-chat, .actor-drawer')
				).toHaveCount(0);
				await standalone.close();
			});
			await sheet.getByRole('button', { name: 'Fechar ficha' }).click();
			await expect(player.locator('.sheet-backdrop .sheet')).toHaveCount(0);
		} finally {
			await fixture?.close();
		}
	});

	for (const [role, quantity, sides] of [
		['player', 1, 4],
		['player', 3, 6],
		['player', 100, 4],
		['gm', 1, 20],
		['gm', 3, 6],
		['gm', 100, 6]
	] as const) {
		test(`${role} quick roll ${quantity}d${sides} matches authoritative chat and visual result`, async ({
			browser
		}) => {
			let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
			try {
				await test.step('prepare the authenticated local table', async () => {
					fixture = await createLocalAuthenticatedFixture(browser);
				});
				const page = role === 'gm' ? fixture!.gm : fixture!.player;
				const formula = `${quantity}d${sides}`;
				let authoritativeResult: { expressao: string; dados: number[]; total: number } | null =
					null;
				let authoritativeEventId = '';
				await test.step('submit the quick roll and verify the authoritative server result', async () => {
					await openMap(page, fixture!.campaignId, fixture!.sceneId);
					await page.locator('.table-tools button[title="Dados"]').click();
					await page.getByLabel('Quantidade de dados').fill(String(quantity));
					const responsePromise = page.waitForResponse((response) => {
						const request = response.request();
						return (
							request.url().includes(`/api/v1/campaigns/${fixture!.campaignId}/events`) &&
							request.method() === 'POST' &&
							request.postData()?.includes(`"expression":"${formula}"`) === true
						);
					});
					await page.getByRole('button', { name: `Rolar ${formula}` }).click();
					const response = await responsePromise;
					expect(response.ok()).toBeTruthy();
					const event = (await response.json()) as {
						id: string | number;
						payload: { expressao: string; dados: number[]; total: number };
					};
					expect(event.payload.expressao).toBe(formula);
					expect(event.payload.dados).toHaveLength(quantity);
					expect(event.payload.total).toBeGreaterThanOrEqual(quantity);
					expect(event.payload.total).toBeLessThanOrEqual(quantity * sides);
					for (const face of event.payload.dados) expect(face).toBeGreaterThanOrEqual(1);
					for (const face of event.payload.dados) expect(face).toBeLessThanOrEqual(sides);
					authoritativeResult = event.payload;
					authoritativeEventId = String(event.id);
				});
				await test.step('wait for the real visual completion signal and match it to the server payload', async () => {
					const visualCard = page.locator(
						`.dice-overlay article[data-roll-id="${authoritativeEventId}"]`
					);
					await expect(visualCard).toBeVisible();
					expect(authoritativeResult).not.toBeNull();
					await expect(visualCard.locator('.result span')).toContainText(formula);
					await expect(visualCard.locator('.result strong')).toHaveText(
						String(authoritativeResult!.total)
					);
					await expect(visualCard.locator('.result small').last()).toHaveText(
						`[${authoritativeResult!.dados.join(', ')}]`
					);
					if (quantity > 10) await expect(visualCard.locator('.die')).toHaveCount(1);
					const chatRoll = page.locator(`.floating-chat [data-event-id="${authoritativeEventId}"]`);
					await expect(chatRoll).toBeVisible();
					await expect(chatRoll.locator('.roll small')).toContainText(formula);
					await expect(chatRoll.locator('.roll b')).toHaveText(String(authoritativeResult!.total));
					await expect(chatRoll.locator('.roll em')).toContainText(
						authoritativeResult!.dados.join(', ')
					);
				});
			} finally {
				await fixture?.close();
			}
		});
	}

	test('quick dice quantity reports invalid values and keeps valid boundaries', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
			await fixture.player.locator('.table-tools button[title="Dados"]').click();
			const quantity = fixture.player.getByLabel('Quantidade de dados');
			for (const invalid of ['0', '1.5', '101']) {
				await quantity.fill(invalid);
				await expect(fixture.player.getByRole('alert')).toContainText('número inteiro de 1 a 100');
				await expect(
					fixture.player.getByRole('button', { name: `Rolar ${invalid}d6` })
				).toBeDisabled();
			}
			await quantity.fill('1');
			await expect(fixture.player.getByRole('button', { name: 'Rolar 1d6' })).toBeEnabled();
			await quantity.fill('100');
			await expect(fixture.player.getByRole('button', { name: 'Rolar 100d6' })).toBeEnabled();
		} finally {
			await fixture?.close();
		}
	});

	test('GM selects different participants and the panel shows the requested character', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare a player sheet and choose it from the explicit participant selector', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				await fixture.createCharacter(fixture.playerUserId, { name: 'Ficha alvo jogador E2E' });
				await fixture.gm.goto(`/?campaign=${fixture.campaignId}&scene=${fixture.sceneId}`);
				await fixture.gm.getByRole('button', { name: 'Fichas', exact: true }).click();
				await expect(fixture.gm.getByLabel('Participante / personagem')).toBeVisible();
				await fixture.gm.getByLabel('Participante / personagem').selectOption(fixture.playerUserId);
				await fixture.gm.getByRole('button', { name: 'Exibir ficha selecionada' }).click();
				await expect(fixture.gm.locator('.sheet-backdrop.floating .sheet header h2')).toHaveText(
					'Ficha alvo jogador E2E'
				);
			});
			const gm = fixture!.gm;
			const sheet = gm.locator('.sheet-backdrop .sheet');
			await test.step('select a participant without a sheet and create it through the existing flow', async () => {
				await expect(gm.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
				await gm.getByLabel('Participante / personagem').selectOption(fixture!.gmUserId);
				await gm.getByRole('button', { name: 'Criar e exibir ficha' }).click();
				await expect(sheet.locator('header h2')).toHaveText('Novo personagem');
				await expect(gm.locator('.sheet-backdrop .sheet')).toHaveCount(1);
				await expect(sheet.locator('.sheet-mode-status')).toHaveText('Flutuante');
			});
		} finally {
			await fixture?.close();
		}
	});
});

async function openMap(page: Page, campaignId: string, sceneId: string) {
	await page.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
	await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('.floating-chat')).toBeVisible();
}

function sanitizeBrowserDiagnostic(value: string): string {
	return value
		.replace(/https?:\/\/\S+/gi, '[url]')
		.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]')
		.replace(
			/((?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password))\s*[:=]\s*\S+/gi,
			'$1=[redacted]'
		);
}

async function selectTokenAtDefaultPosition(page: Page) {
	const canvas = page.locator('canvas').first();
	await expect(canvas).toBeVisible();
	await canvas.click({ position: { x: 105, y: 105 } });
	await expect(page.locator('.token-inspector')).toBeVisible({ timeout: 10_000 });
}

async function setExpandedSize(panel: Locator, width: number, height: number) {
	await panel.evaluate(
		(node, size) => {
			const element = node as HTMLElement;
			element.style.width = `${size.width}px`;
			element.style.height = `${size.height}px`;
		},
		{ width, height }
	);
	await expect
		.poll(() => panel.evaluate((node) => node.getBoundingClientRect().height))
		.toBeGreaterThan(height - 10);
}

async function dragPanel(page: Page, handle: Locator, deltaX: number, deltaY: number) {
	const handleBox = (await handle.boundingBox())!;
	const startX = handleBox.x + handleBox.width / 2;
	const startY = handleBox.y + handleBox.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
	await page.mouse.up();
}

async function collapseAndRestore(
	panel: Locator,
	page: Page,
	openControl: string | Locator,
	collapsedControl: string | Locator,
	bodySelector: string,
	headerSelector: string
) {
	const before = await panel.boundingBox();
	expect(before).toBeTruthy();
	const headerHeight = await panel
		.locator(headerSelector)
		.evaluate((node) => node.getBoundingClientRect().height);
	const openLocator =
		typeof openControl === 'string' ? page.getByRole('button', { name: openControl }) : openControl;
	const collapsedLocator =
		typeof collapsedControl === 'string'
			? page.getByRole('button', { name: collapsedControl })
			: collapsedControl;
	await openLocator.click();
	await expect(panel).toHaveClass(/closed/);
	await expect
		.poll(() => panel.evaluate((node) => node.getBoundingClientRect().height))
		.toBeLessThanOrEqual(headerHeight + 4);
	await expect(panel).toHaveCSS('resize', 'none');
	await expect(panel.locator(bodySelector)).toHaveCount(0);
	await collapsedLocator.click();
	await expect(panel).not.toHaveClass(/closed/);
	await expect
		.poll(() => panel.evaluate((node) => node.getBoundingClientRect().height))
		.toBeGreaterThan((before?.height ?? 0) - 10);
	await expect
		.poll(() => panel.evaluate((node) => node.getBoundingClientRect().width))
		.toBeGreaterThan((before?.width ?? 0) - 10);
}

async function assertAboveAudioFooter(page: Page, panel: Locator) {
	const footer = page.locator('.audio-channels');
	await expect(footer).toBeVisible();
	const panelBox = await panel.boundingBox();
	const footerBox = await footer.boundingBox();
	expect(panelBox).toBeTruthy();
	expect(footerBox).toBeTruthy();
	expect(panelBox!.y).toBeGreaterThanOrEqual(0);
	expect(panelBox!.x).toBeGreaterThanOrEqual(0);
	expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
	expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(footerBox!.y + 2);
}

async function assertTitleReachable(page: Page, panel: Locator, titleSelector: string) {
	const title = panel.locator(titleSelector);
	const titleBox = await title.boundingBox();
	expect(titleBox).toBeTruthy();
	const panelSelector = await panel.evaluate((node, selectorName) => {
		const element = node as HTMLElement;
		if (!element.id) element.id = `e2e-panel-${selectorName.replace(/\W/g, '-')}`;
		return `#${CSS.escape(element.id)}`;
	}, titleSelector);
	const hitTest = await page.evaluate(
		({ x, y, selector }) => {
			const panelElement = document.querySelector(selector);
			const topElement = document.elementFromPoint(x, y);
			return {
				receivesPointer: Boolean(panelElement && topElement && panelElement.contains(topElement)),
				point: { x, y },
				blocker: topElement
					? `${topElement.tagName}.${String(topElement.className)}:${topElement.getAttribute('title') ?? topElement.textContent?.trim().slice(0, 50) ?? ''}`
					: 'none',
				blockerRect: topElement
					? (() => {
							const rect = topElement.getBoundingClientRect();
							return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
						})()
					: null
			};
		},
		{
			x: titleBox!.x + Math.min(titleBox!.width - 2, 20),
			y: titleBox!.y + titleBox!.height / 2,
			selector: panelSelector
		}
	);
	expect(hitTest.receivesPointer, JSON.stringify(hitTest)).toBe(true);
}

async function assertControlReachable(page: Page, control: Locator) {
	const box = await control.boundingBox();
	expect(box).toBeTruthy();
	const receivesPointer = await page.evaluate(
		({ x, y, selector }) => {
			const element = document.querySelector(selector);
			const top = document.elementFromPoint(x, y);
			return Boolean(element && top && (element === top || element.contains(top)));
		},
		{
			x: box!.x + box!.width / 2,
			y: box!.y + box!.height / 2,
			selector: await control.evaluate((node) => {
				const element = node as HTMLElement;
				if (!element.id)
					element.id = `e2e-control-${element.getAttribute('aria-label')?.replace(/\W/g, '-') ?? 'panel'}`;
				return `#${CSS.escape(element.id)}`;
			})
		}
	);
	expect(receivesPointer).toBe(true);
}

async function assertPanelsDoNotOverlap(page: Page, first: Locator, second: Locator) {
	await expect
		.poll(async () => {
			const firstBox = await first.boundingBox();
			const secondBox = await second.boundingBox();
			if (!firstBox || !secondBox) return true;
			const overlaps =
				firstBox.x < secondBox.x + secondBox.width &&
				firstBox.x + firstBox.width > secondBox.x &&
				firstBox.y < secondBox.y + secondBox.height &&
				firstBox.y + firstBox.height > secondBox.y;
			const navBoxes = await page
				.locator('.app-header, .game-header, .workspace-tabs')
				.evaluateAll((elements) =>
					elements.map((element) => (element as HTMLElement).getBoundingClientRect())
				);
			const navBottom = Math.max(
				0,
				...navBoxes.filter((box) => box.width && box.height).map((box) => box.bottom)
			);
			return { overlaps, belowNavigation: firstBox.y >= navBottom - 1 };
		})
		.toEqual({ overlaps: false, belowNavigation: true });
}
