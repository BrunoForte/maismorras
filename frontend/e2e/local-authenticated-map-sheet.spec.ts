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
					await expect(
						f.player.getByRole('region', { name: /Mídias da campanha|Campaign media/i })
					).toBeVisible();
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
			const actors = page.locator('.actor-drawer');
			await test.step('resize, minimize and restore scene actors', async () => {
				await setExpandedSize(actors, 430, 360);
				await assertAboveAudioFooter(page, actors);
				await collapseAndRestore(
					actors,
					page,
					'Atores da cena',
					'Abrir atores',
					'.drawer-body',
					'.drawer-toggle'
				);
				await expect(actors).toHaveCSS('resize', 'both');
			});
			await test.step('open, resize, minimize and restore the map sheet', async () => {
				await selectTokenAtDefaultPosition(page);
				await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				const sheet = page.locator('.sheet-backdrop.docked .sheet');
				await expect(sheet).toBeVisible();
				await setExpandedSize(sheet, 850, 520);
				await assertAboveAudioFooter(page, sheet);
				await page.getByRole('button', { name: 'Minimizar ficha' }).click();
				const minimizedHeaderHeight = await sheet
					.locator('header')
					.evaluate((node) => node.getBoundingClientRect().height);
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().height))
					.toBeLessThanOrEqual(minimizedHeaderHeight + 4);
				await expect(sheet).toHaveClass(/minimized/);
				await expect(sheet).toHaveCSS('resize', 'none');
				await expect(sheet.locator('.sheet-body')).toHaveCount(0);
				await page.getByRole('button', { name: 'Minimizar ficha' }).click();
				await expect
					.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().height))
					.toBeGreaterThan(500);
				await assertAboveAudioFooter(page, sheet);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player restores chat and owned map sheet after tab switches; GM actors restore after remount', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare the player sheet and map', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: 'Painel jogador E2E',
					hitPointsCurrent: 12,
					hitPointsMax: 12
				});
				await fixture.createCharacterToken(character.id);
				await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
			});
			const player = fixture!.player;
			const chat = player.locator('.floating-chat');
			await test.step('minimize chat, swap tabs, and restore its saved size as a real player', async () => {
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
			await test.step('minimize the owned sheet, switch tabs, reopen and restore after remount', async () => {
				await selectTokenAtDefaultPosition(player);
				await player.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				const sheet = player.locator('.sheet-backdrop.docked .sheet');
				await expect(sheet).toBeVisible();
				await setExpandedSize(sheet, 780, 500);
				await player.getByRole('button', { name: 'Minimizar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toHaveCount(0);
				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await player.getByRole('button', { name: 'Mesa', exact: true }).click();
				await selectTokenAtDefaultPosition(player);
				await player.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				const remountedSheet = player.locator('.sheet-backdrop.docked .sheet');
				await expect(remountedSheet).toHaveClass(/minimized/);
				await expect(remountedSheet.locator('.sheet-body')).toHaveCount(0);
				await player.getByRole('button', { name: 'Minimizar ficha' }).click();
				await expect(remountedSheet.locator('.sheet-body')).toBeVisible();
				await expect
					.poll(() => remountedSheet.evaluate((node) => node.getBoundingClientRect().height))
					.toBeGreaterThan(400);
			});
			await test.step('GM-only actors drawer remains unavailable to a player', async () => {
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
			await gm.getByRole('button', { name: 'Atores da cena' }).click();
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
				await f.player.getByRole('button', { name: 'Abrir ficha em nova janela' }).click();
				const popup = await popupPromise;
				await expect(popup.locator('.sheet')).toBeVisible({ timeout: 20_000 });
				expect(new URL(popup.url()).pathname).toBe('/sheet');
				expect(popup.url()).toContain(`campaign=${f.campaignId}`);
				expect(popup.url()).toContain(`character=${playerCharacter!.id}`);
				expect(popup.url()).not.toMatch(/access_token|refresh_token|authorization|jwt/i);
				await expect(
					popup.locator('canvas, .app-header, .floating-chat, .actor-drawer, .audio-channels')
				).toHaveCount(0);
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
				expect(styles[0]).toEqual(styles[1]);
				const desktopColumns = await actions.evaluate(
					(node) => getComputedStyle(node).gridTemplateColumns
				);
				expect(desktopColumns.trim().split(/\s+/)).toHaveLength(2);
			});
			await test.step('equipped armor description occupies the full row in the combat tab', async () => {
				await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
				const sheet = page.locator('.sheet-backdrop.docked .sheet');
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
				await expect(cantrip.getByRole('button', { name: 'Lançar' })).toBeDisabled();
				const spell = inspector
					.locator('.spell-groups details')
					.filter({ hasText: 'Magia alvo E2E' });
				await spell.locator('summary').click();
				await expect(spell.getByRole('button', { name: 'Lançar' })).toBeDisabled();
				expect(unauthorizedSpellRequests).toEqual([]);
			});
			await test.step('GM display publishes chat and updates the scene presentation', async () => {
				const inspector = f.gm.locator('.token-inspector');
				const spell = inspector
					.locator('.spell-groups details')
					.filter({ hasText: 'Magia alvo E2E' });
				await spell.getByRole('button', { name: 'Exibir' }).click();
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

async function collapseAndRestore(
	panel: Locator,
	page: Page,
	openLabel: string,
	collapsedLabel: string,
	bodySelector: string,
	headerSelector: string
) {
	const before = await panel.boundingBox();
	expect(before).toBeTruthy();
	const headerHeight = await panel
		.locator(headerSelector)
		.evaluate((node) => node.getBoundingClientRect().height);
	await page.getByRole('button', { name: openLabel }).click();
	await expect(panel).toHaveClass(/closed/);
	await expect
		.poll(() => panel.evaluate((node) => node.getBoundingClientRect().height))
		.toBeLessThanOrEqual(headerHeight + 4);
	await expect(panel).toHaveCSS('resize', 'none');
	await expect(panel.locator(bodySelector)).toHaveCount(0);
	await page.getByRole('button', { name: collapsedLabel }).click();
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
