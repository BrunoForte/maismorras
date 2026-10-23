import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
	expect,
	test,
	type Browser,
	type Locator,
	type Page,
	type TestInfo
} from '@playwright/test';
import { createLocalAuthenticatedFixture, localStackEnabled } from './local-authenticated.helpers';
import { sanitizeSafeE2EDiagnostic } from '../src/lib/utils/safeE2EDiagnostics';

type PointerObservation = {
	action: string;
	x: number;
	y: number;
	targetX: number;
	targetY: number;
};

type DiagnosticSelector = string | { selector: string; label: string };

const pointerTargets = new WeakMap<Page, PointerObservation>();
const observedPointers = new WeakSet<Page>();
const MENU_OPERATION_TIMEOUT_MS = 5_000;
const DIAGNOSTIC_SNAPSHOT_TIMEOUT_MS = 1_000;
const DIAGNOSTIC_COMPLETION_RESERVE_MS = 2_000;
const testStartedAt = new WeakMap<TestInfo, number>();
const mapToolDiagnosticSelectors: DiagnosticSelector[] = [
	{ label: 'interactive tool group', selector: '.table-tools .tool-group' },
	{ label: 'interactive tool buttons', selector: '.table-tools .tool-group > button' },
	{
		label: 'interactive open/close menu triggers',
		selector: '.table-tools .tool-group button[aria-expanded]'
	},
	{ label: 'open menu panel', selector: '.map-tool-menu' },
	{ label: 'menu controls', selector: '.map-tool-menu button' },
	{ label: 'signal control', selector: '[data-testid="map-signal-button"]' },
	{
		label: 'hidden overlay host anchor (not clickable)',
		selector: '.table-tools-gm'
	},
	'.workspace-tabs button',
	'.token-inspector',
	'.audio-channels'
];

test.describe('local authenticated map and character sheet E2E', () => {
	test.skip(!localStackEnabled, 'Runs only against the isolated local Supabase stack in CI.');
	test.beforeEach(({ page }, testInfo) => {
		testStartedAt.set(testInfo, performance.now());
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

	const menuGroups = [
		['Régua', 'Iniciativa'],
		['Dados', 'Camadas do mapa'],
		['Área persistente', 'Barreiras']
	] as const;
	const menuViewports = [
		{ name: 'desktop', width: 1280, height: 900 },
		{ name: 'mobile', width: 390, height: 844 }
	] as const;
	const referenceMenuStyle = { borderRadius: '10px', padding: '12px', gap: '8.8px' };
	for (const viewport of menuViewports) {
		for (const [groupIndex, names] of menuGroups.entries()) {
			test(`map menus ${viewport.name} group ${groupIndex + 1}: ${names.join(' and ')} preserve styling and bounds`, async ({
				browser
			}, testInfo) => {
				let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
				try {
					fixture = await createLocalAuthenticatedFixture(browser);
					const page = fixture.gm;
					await test.step('prepare selected token and map', () =>
						diagnoseOnFailure(
							testInfo,
							page,
							'prepare selected token and map',
							mapToolDiagnosticSelectors,
							async () => {
								const character = await fixture!.createCharacter(fixture!.playerUserId, {
									name: 'Categorias do inspector E2E'
								});
								const tokenId = await fixture!.createCharacterToken(character.id);
								await openMap(page, fixture!.campaignId, fixture!.sceneId, tokenId);
								await selectTokenAtDefaultPosition(page);
							}
						));
					await test.step(`set ${viewport.name} viewport to ${viewport.width}x${viewport.height}`, () =>
						diagnoseOnFailure(
							testInfo,
							page,
							`map menu viewport ${viewport.width}x${viewport.height}`,
							mapToolDiagnosticSelectors,
							async () => {
								const resized = await completeWithinBudget(
									page.setViewportSize({ width: viewport.width, height: viewport.height }),
									menuWaitBudget(testInfo)
								);
								if (resized === null) throw diagnosticTimeout('Viewport resize timed out.');
							}
						));

					for (const name of names) {
						await test.step(`menu ${name} at ${viewport.width}x${viewport.height}`, async () => {
							let phase = 'locate interactive trigger';
							await diagnoseOnFailure(
								testInfo,
								page,
								`map menu ${name} at ${viewport.width}x${viewport.height}`,
								mapToolDiagnosticSelectors,
								async () => {
									const trigger = page.getByRole('button', { name, exact: true });
									phase = 'click interactive menu trigger to open';
									await trigger.click({ timeout: menuWaitBudget(testInfo) });
									phase = 'assert trigger expanded';
									await expect(trigger).toHaveAttribute('aria-expanded', 'true', {
										timeout: menuWaitBudget(testInfo)
									});
									const menu = page.locator('.map-tool-menu:visible');
									phase = 'assert one visible menu target';
									await expect(menu).toHaveCount(1, { timeout: menuWaitBudget(testInfo) });
									phase = 'measure menu styles and viewport bounds';
									const measurements = await completeWithinBudget(
										menu.evaluate((element) => {
											const style = getComputedStyle(element);
											const rect = element.getBoundingClientRect();
											return {
												borderRadius: style.borderRadius,
												padding: style.padding,
												gap: style.gap,
												x: rect.x,
												y: rect.y,
												right: rect.right,
												bottom: rect.bottom
											};
										}),
										menuWaitBudget(testInfo)
									);
									if (measurements === null) {
										throw diagnosticTimeout('Menu geometry measurement exceeded its safe wait.');
									}
									phase = 'assert visual style matches shared menu style';
									expect(measurements).toMatchObject(referenceMenuStyle);
									phase = 'assert menu remains inside viewport';
									expect(measurements.x).toBeGreaterThanOrEqual(0);
									expect(measurements.y).toBeGreaterThanOrEqual(0);
									expect(measurements.right).toBeLessThanOrEqual(viewport.width);
									expect(measurements.bottom).toBeLessThanOrEqual(viewport.height);
									phase = 'click interactive menu trigger to close';
									await trigger.click({ timeout: menuWaitBudget(testInfo) });
									phase = 'assert trigger collapsed';
									await expect(trigger).toHaveAttribute('aria-expanded', 'false', {
										timeout: menuWaitBudget(testInfo)
									});
								},
								() => phase
							);
						});
					}
				} finally {
					await fixture?.close();
				}
			});
		}
	}

	test('map signal remains available on mobile', async ({ browser }, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const page = fixture.gm;
			await test.step('prepare selected token and mobile map', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'prepare map signal test',
					mapToolDiagnosticSelectors,
					async () => {
						const character = await fixture!.createCharacter(fixture!.playerUserId, {
							name: 'Sinalização de mapa E2E'
						});
						await fixture!.createCharacterToken(character.id);
						await openMap(page, fixture!.campaignId, fixture!.sceneId);
						await selectTokenAtDefaultPosition(page);
						await page.setViewportSize({ width: 390, height: 844 });
					}
				));
			await test.step('toggle signal and clear it on the map', () => {
				let phase = 'locate signal control';
				return diagnoseOnFailure(
					testInfo,
					page,
					'mobile map signal',
					mapToolDiagnosticSelectors,
					async () => {
						const signal = page.getByTestId('map-signal-button');
						phase = 'assert signal starts unpressed';
						await expect(signal).toHaveAttribute('aria-pressed', 'false');
						phase = 'click signal control';
						await signal.click();
						phase = 'assert signal becomes pressed';
						await expect(signal).toHaveAttribute('aria-pressed', 'true');
						phase = 'click map canvas to clear signal';
						await page
							.locator('canvas')
							.first()
							.click({ position: { x: 80, y: 80 } });
						phase = 'assert signal becomes unpressed';
						await expect(signal).toHaveAttribute('aria-pressed', 'false');
					},
					() => phase
				);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('token inspector header stays sticky while its categories scroll', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const page = fixture.gm;
			await test.step('prepare selected token and desktop map', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'prepare inspector sticky-header test',
					['.token-inspector', '.inspector-header', 'details.token-settings > summary'],
					async () => {
						const character = await fixture!.createCharacter(fixture!.playerUserId, {
							name: 'Cabeçalho fixo E2E'
						});
						await fixture!.createCharacterToken(character.id);
						await openMap(page, fixture!.campaignId, fixture!.sceneId);
						await selectTokenAtDefaultPosition(page);
						await page.setViewportSize({ width: 1280, height: 900 });
					}
				));
			await test.step('verify sticky header remains accessible during inspector scroll', () => {
				let phase = 'assert inspector header is sticky';
				return diagnoseOnFailure(
					testInfo,
					page,
					'inspector sticky header',
					['.token-inspector', '.inspector-header', 'details.token-settings > summary'],
					async () => {
						const inspector = page.locator('.token-inspector');
						await expect(inspector.locator('.inspector-header')).toHaveCSS('position', 'sticky');
						phase = 'open token settings category';
						await inspector.locator('details.token-settings > summary').click();
						phase = 'assert inspector content can scroll';
						const scrollable = await inspector.evaluate(
							(node) => node.scrollHeight > node.clientHeight
						);
						expect(scrollable).toBe(true);
						phase = 'scroll inspector content';
						await inspector.evaluate((node) => {
							node.scrollTop = node.scrollHeight;
						});
						phase = 'assert header remains at panel top';
						const headerTop = await inspector
							.locator('.inspector-header')
							.evaluate((node) => node.getBoundingClientRect().top);
						const panelTop = (await inspector.boundingBox())!.y;
						expect(headerTop).toBeLessThanOrEqual(panelTop + 1);
					},
					() => phase
				);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('floating chat collapses physically and restores above the audio footer @routine-gate', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			await test.step('prepare narrator map with a linked player token', async () => {
				await diagnoseOnFailure(
					testInfo,
					fixture!.gm,
					'prepare narrator map and linked token',
					['.workspace-tabs', 'canvas', '.floating-chat', '.actor-drawer', '.audio-channels'],
					async () => {
						const character = await fixture!.createCharacter(fixture!.playerUserId, {
							name: 'Painéis E2E',
							hitPointsCurrent: 14,
							hitPointsMax: 14
						});
						await fixture!.createCharacterToken(character.id);
						await openMap(fixture!.gm, fixture!.campaignId, fixture!.sceneId);
					}
				);
			});
			const page = fixture!.gm;
			const chat = page.locator('.floating-chat');
			await test.step('resize, minimize and restore table chat', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'resize, minimize and restore table chat',
					[
						'.floating-chat',
						'.floating-chat .chat-titlebar',
						'.floating-chat button',
						'.floating-chat .chat-body',
						'.workspace-tabs',
						'.audio-channels'
					],
					async () => {
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
					}
				));
		} finally {
			await fixture?.close();
		}
	});

	test('docked sheet stays above actors and audio footer on desktop and mobile @routine-gate', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			await test.step('prepare narrator map and linked player token', async () => {
				const character = await fixture!.createCharacter(fixture!.playerUserId, {
					name: 'Ficha acoplada E2E',
					hitPointsCurrent: 14,
					hitPointsMax: 14
				});
				await fixture!.createCharacterToken(character.id);
				await openMap(fixture!.gm, fixture!.campaignId, fixture!.sceneId);
			});
			const page = fixture!.gm;
			await selectTokenAtDefaultPosition(page);
			await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
			await page.getByRole('button', { name: 'Fixar ficha' }).click();
			const sheet = page.locator('.sheet-backdrop.docked .sheet');
			const actors = page.locator('.actor-drawer');
			await expect(sheet).toBeVisible();
			await expect(actors).toBeVisible();
			await test.step('verify docked sheet and actors remain accessible above audio footer', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'docked sheet and actor drawer geometry',
					[
						'.sheet-backdrop.docked .sheet',
						'.actor-drawer',
						'.actor-drawer .drawer-toggle',
						'.audio-channels',
						'.workspace-tabs'
					],
					async () => {
						await expect(actors.locator('.drawer-toggle')).toBeVisible();
						await assertPanelsDoNotOverlap(page, sheet, actors);
						await assertAboveAudioFooter(page, sheet);
						await page.setViewportSize({ width: 390, height: 844 });
						await assertPanelsDoNotOverlap(page, sheet, actors);
						await assertAboveAudioFooter(page, sheet);
						await expect(actors.locator('.drawer-toggle')).toBeVisible();
						await page.setViewportSize({ width: 1280, height: 900 });
					}
				));
		} finally {
			await fixture?.close();
		}
	});

	test('chat and linked sheet remain reachable together on desktop', async ({
		browser
	}, testInfo) => {
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
			const sheet = page.locator('.sheet-backdrop.floating .sheet');
			await expect(sheet).toBeVisible();
			await expect(chat).not.toHaveClass(/closed/);
			await expect(actors).toBeVisible();
			await test.step('keep titles, controls, navigation, actors, and footer accessible on desktop', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'desktop chat and sheet reachability',
					[
						'.floating-chat',
						'.floating-chat .chat-titlebar',
						'.sheet-backdrop.floating .sheet',
						'.sheet-backdrop.floating .sheet header',
						'.actor-drawer .drawer-toggle',
						'.audio-channels',
						'.workspace-tabs'
					],
					async () => {
						await assertPanelsDoNotOverlap(page, chat, sheet);
						await assertPanelsDoNotOverlap(page, sheet, actors);
						await assertPanelsDoNotOverlap(page, chat, actors);
						await assertTitleReachable(page, chat, '.chat-titlebar');
						await assertTitleReachable(page, sheet, 'header');
						await assertAboveAudioFooter(page, chat);
						await assertAboveAudioFooter(page, sheet);
						await expect(actors.locator('.drawer-toggle')).toBeVisible();
						await page.getByRole('button', { name: 'Fichas', exact: true }).click();
						await expect(page.locator('.sheet-backdrop.embedded .sheet')).toBeVisible();
						await page.getByRole('button', { name: 'Mesa', exact: true }).click();
						await expect(page.locator('canvas').first()).toBeVisible();
						await expect(sheet).toBeVisible();
					}
				));
		} finally {
			await fixture?.close();
		}
	});

	test('chat and linked sheet remain reachable on a narrow viewport', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const character = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Painéis estreitos E2E',
				hitPointsCurrent: 11,
				hitPointsMax: 11
			});
			await fixture.createCharacterToken(character.id);
			await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			const page = fixture.gm;
			const chat = page.locator('.floating-chat');
			const actors = page.locator('.actor-drawer');
			if (await chat.evaluate((node) => node.classList.contains('closed')))
				await page.getByRole('button', { name: 'Abrir chat' }).click();
			await selectTokenAtDefaultPosition(page);
			await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
			const sheet = page.locator('.sheet-backdrop.floating .sheet');
			await expect(sheet).toBeVisible();
			await expect(chat).not.toHaveClass(/closed/);
			await expect(actors).toBeVisible();
			await page.setViewportSize({ width: 390, height: 844 });
			await test.step('keep controls, navigation, actors, and footer accessible on mobile', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'narrow viewport chat and sheet reachability',
					[
						'.floating-chat',
						'.floating-chat .chat-titlebar',
						'.sheet-backdrop.floating .sheet',
						'.sheet-backdrop.floating .sheet header',
						'.actor-drawer .drawer-toggle',
						'.audio-channels',
						'.workspace-tabs'
					],
					async () => {
						await assertPanelsDoNotOverlap(page, chat, sheet);
						await assertPanelsDoNotOverlap(page, sheet, actors);
						await assertPanelsDoNotOverlap(page, chat, actors);
						await expect(sheet.locator('header h2')).toBeVisible();
						await expect(sheet.getByRole('button', { name: 'Fixar ficha' })).toBeVisible();
						await expect(
							sheet.getByRole('button', { name: 'Destacar ficha em janela auxiliar' })
						).toBeVisible();
						await expect(sheet.locator('.sheet-tabs')).toBeVisible();
						await expect(sheet.getByRole('button', { name: 'Salvar ficha' })).toBeVisible();
						await expect(actors.locator('.drawer-toggle')).toBeVisible();
						await expect(page.locator('.audio-channels')).toBeVisible();
						await assertAboveAudioFooter(page, sheet);
					}
				));
		} finally {
			await fixture?.close();
		}
	});

	test('floating chat and sheet resize and stay above the audio footer', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			await test.step('open both panels on the authenticated GM map', async () => {
				await diagnoseOnFailure(
					testInfo,
					fixture!.gm,
					'prepare map and linked token for panel interaction',
					['.workspace-tabs', 'canvas', '.floating-chat', '.actor-drawer', '.audio-channels'],
					async () => {
						const character = await fixture!.createCharacter(fixture!.playerUserId, {
							name: 'Painéis movíveis E2E'
						});
						await fixture!.createCharacterToken(character.id);
						await openMap(fixture!.gm, fixture!.campaignId, fixture!.sceneId);
					}
				);
			});
			const page = fixture!.gm;
			const chat = page.locator('.floating-chat');
			if (await chat.evaluate((node) => node.classList.contains('closed')))
				await page.getByRole('button', { name: 'Abrir chat' }).click();
			await selectTokenAtDefaultPosition(page);
			await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
			const sheet = page.locator('.sheet-backdrop .sheet');
			await expect(sheet).toBeVisible();
			await test.step('resize and move both panels inside the usable viewport', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'resize and move chat and sheet',
					[
						'.floating-chat',
						'.floating-chat .chat-titlebar',
						'.floating-chat button',
						'.sheet-backdrop',
						'.sheet-backdrop .sheet',
						'.sheet-backdrop .sheet header',
						'.audio-channels'
					],
					async () => {
						await expect(page.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
						await setExpandedSize(chat, 420, 160);
						await setExpandedSize(sheet, 700, 160);
						await dragPanel(page, chat.locator('.panel-grip'), 24, 18);
						await assertAboveAudioFooter(page, chat);
						await assertAboveAudioFooter(page, sheet);
					}
				));
		} finally {
			await fixture?.close();
		}
	});

	test('floating panels raise on keyboard focus and minimize and restore independently', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const character = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Foco dos painéis E2E'
			});
			await fixture.createCharacterToken(character.id);
			await openMap(fixture.gm, fixture.campaignId, fixture.sceneId);
			const page = fixture.gm;
			const chat = page.locator('.floating-chat');
			if (await chat.evaluate((node) => node.classList.contains('closed')))
				await page.getByRole('button', { name: 'Abrir chat' }).click();
			await selectTokenAtDefaultPosition(page);
			await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
			const sheet = page.locator('.sheet-backdrop .sheet');
			await expect(sheet).toBeVisible();
			let phase = 'read initial panel layers';
			await test.step('focus either panel to raise it; minimize and restore each panel', () =>
				diagnoseOnFailure(
					testInfo,
					page,
					'panel focus, raise, minimize and restore',
					[
						'.floating-chat',
						'.floating-chat .chat-titlebar',
						'.sheet-backdrop',
						'.sheet-backdrop .sheet',
						'.sheet-backdrop .sheet header',
						'.workspace-tabs',
						'.audio-channels'
					],
					async () => {
						const sheetBackdrop = page.locator('.sheet-backdrop');
						phase = 'read initial sheet and chat z-index';
						const sheetLayerBefore = Number(
							await sheetBackdrop.evaluate((node) => getComputedStyle(node).zIndex)
						);
						const chatLayerBefore = Number(
							await chat.evaluate((node) => getComputedStyle(node).zIndex)
						);
						phase = 'verify redundant front controls are absent';
						await expect(chat.locator('.front-toggle')).toHaveCount(0, {
							timeout: menuWaitBudget(testInfo)
						});
						await expect(sheet.locator('.front-toggle')).toHaveCount(0, {
							timeout: menuWaitBudget(testInfo)
						});
						phase = 'focus chat titlebar to raise chat';
						await chat.locator('.chat-titlebar').focus({ timeout: menuWaitBudget(testInfo) });
						phase = 'assert chat is now above the sheet';
						const chatLayer = Number(await chat.evaluate((node) => getComputedStyle(node).zIndex));
						expect(chatLayer).toBeGreaterThan(Math.max(sheetLayerBefore, chatLayerBefore));
						phase = 'focus sheet toolbar to raise the sheet';
						await sheet
							.locator('header[role="toolbar"]')
							.focus({ timeout: menuWaitBudget(testInfo) });
						phase = 'assert sheet is now above chat';
						const sheetLayer = Number(
							await sheetBackdrop.evaluate((node) => getComputedStyle(node).zIndex)
						);
						expect(sheetLayer).toBeGreaterThan(chatLayer);
						const chatToggle = chat.getByRole('button', { name: 'Chat da mesa' });
						phase = 'focus chat close control';
						await chatToggle.focus({ timeout: menuWaitBudget(testInfo) });
						phase = 'close chat with its visible control';
						await chatToggle.click({ timeout: menuWaitBudget(testInfo) });
						phase = 'assert chat collapsed';
						await expect(chat).toHaveClass(/closed/, { timeout: menuWaitBudget(testInfo) });
						await expect(chat.locator('.chat-body')).toHaveCount(0, {
							timeout: menuWaitBudget(testInfo)
						});
						const restoreChat = page.getByRole('button', { name: 'Abrir chat' });
						phase = 'focus and restore chat';
						await restoreChat.focus({ timeout: menuWaitBudget(testInfo) });
						await restoreChat.click({ timeout: menuWaitBudget(testInfo) });
						await expect(chat).not.toHaveClass(/closed/, { timeout: menuWaitBudget(testInfo) });
						await expect(chat.locator('.chat-body')).toBeVisible({
							timeout: menuWaitBudget(testInfo)
						});
						phase = 'minimize sheet';
						await sheet
							.getByRole('button', { name: 'Minimizar ficha' })
							.click({ timeout: menuWaitBudget(testInfo) });
						await expect(sheet.locator('.sheet-body')).toHaveCount(0, {
							timeout: menuWaitBudget(testInfo)
						});
						phase = 'restore sheet';
						await page
							.getByRole('button', { name: 'Restaurar ficha' })
							.click({ timeout: menuWaitBudget(testInfo) });
						await expect(sheet.locator('.sheet-body')).toBeVisible({
							timeout: menuWaitBudget(testInfo)
						});
					},
					() => phase
				));
		} finally {
			await fixture?.close();
		}
	});

	test('chat, docked sheet, actors and audio footer fit a narrow viewport @routine-gate', async ({
		browser
	}) => {
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
			await expect(page.locator('.sheet-backdrop.embedded .sheet')).toBeVisible();
			await page.getByRole('button', { name: 'Abrir como painel' }).click();
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
				await expect(page.locator('.sheet-backdrop.embedded .sheet')).toBeVisible();
				await expect(sheet).toBeHidden();
				await page.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(sheet).toBeVisible();
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

	test('player restores chat across map tab switches @routine-gate', async ({ browser }) => {
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
					class: 'Mago',
					spellcastingOverride: true,
					hitPointsCurrent: 12,
					hitPointsMax: 12,
					spells: [
						{
							name: 'Luz da ficha E2E',
							level: 0,
							description: 'Uma luz clara aparece.',
							notes: 'Uma luz clara aparece.'
						},
						{
							name: 'Mísseis da ficha E2E',
							level: 1,
							description: 'Três dardos luminosos atingem os alvos.',
							notes: 'Três dardos luminosos atingem os alvos.',
							diceFormula: '3d4+3'
						}
					],
					spellSlots: [{ level: 1, current: 1, max: 1 }]
				});
				await fixture.createCharacterToken(character.id);
				await Promise.all([
					openMap(fixture.player, fixture.campaignId, fixture.sceneId),
					openMap(fixture.gm, fixture.campaignId, fixture.sceneId)
				]);
				await fixture.player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await fixture.player.getByRole('button', { name: 'Abrir como painel' }).click();
			});
			const player = fixture!.player;
			const sheet = player.locator('.sheet-backdrop.floating .sheet');
			await expect(sheet).toBeVisible();
			await expect(sheet.locator('header h2')).toHaveText('Painel jogador E2E');
			await test.step('cast own cantrip from the character sheet without spending a slot', async () => {
				await sheet.getByRole('button', { name: 'Magias', exact: true }).click();
				const cantrip = sheet.locator('.spell-card').filter({ hasText: 'Luz da ficha E2E' });
				await expect(cantrip.getByRole('button', { name: 'Lançar truque' })).toBeVisible();
				await cantrip.locator('.spell-toggle').click();
				await expect(cantrip.getByRole('button', { name: 'Lançar truque' })).toBeVisible();
				const beforeResponse = await fixture!.playerApi.get(
					`/api/v1/campaigns/${fixture!.campaignId}/character`
				);
				const before = (await beforeResponse.json()) as {
					sheet: { spellSlots: Array<{ level: number; current: number }> };
				};
				await test.step('submit the cantrip from the floating sheet', async () => {
					await cantrip.getByRole('button', { name: 'Lançar truque' }).click();
				});
				await test.step('confirm the spell slot remains unchanged', async () => {
					await expect
						.poll(async () => {
							const response = await fixture!.playerApi.get(
								`/api/v1/campaigns/${fixture!.campaignId}/character`
							);
							const value = (await response.json()) as typeof before;
							return value.sheet.spellSlots.find((slot) => slot.level === 1)?.current;
						})
						.toBe(before.sheet.spellSlots.find((slot) => slot.level === 1)?.current);
				});
				await test.step('verify player-facing presentation and campaign chat', async () => {
					await expect(player.locator('.presentation-text')).toContainText('Luz da ficha E2E');
					await expect(player.locator('.presentation-text')).toContainText(
						'Uma luz clara aparece.'
					);
					await expect(
						fixture!.gm.locator('.floating-chat [data-event-id]').filter({
							hasText: 'Luz da ficha E2E'
						})
					).toBeVisible();
					await player.getByRole('button', { name: 'Fechar imagem para mim' }).click();
					await expect(player.locator('.presentation-backdrop')).toHaveCount(0);
					await player.getByRole('button', { name: 'Mesa', exact: true }).click();
					await expect(player.locator('canvas').first()).toBeVisible();
				});
			});
			await test.step('cast a known leveled spell from the sheet with its selected slot', async () => {
				const spellCard = sheet.locator('.spell-card').filter({ hasText: 'Mísseis da ficha E2E' });
				const castButton = spellCard.getByRole('button', { name: 'Lançar', exact: true });
				await expect(castButton).toBeVisible();
				await expect(castButton).toBeEnabled();
				const slotSelector = spellCard.getByRole('combobox', { name: 'Espaço de magia' });
				await expect(slotSelector).toHaveValue('1');
				const beforeCastResponse = await fixture!.playerApi.get(
					`/api/v1/campaigns/${fixture!.campaignId}/character`
				);
				const beforeCast = (await beforeCastResponse.json()) as {
					sheet: { spellSlots: Array<{ level: number; current: number }> };
				};
				const availableBeforeCast =
					beforeCast.sheet.spellSlots.find((slot) => slot.level === 1)?.current ?? 0;
				expect(availableBeforeCast).toBeGreaterThan(0);
				const castResponsePromise = player.waitForResponse((response) => {
					const url = new URL(response.url());
					return (
						url.pathname === `/api/v1/campaigns/${fixture!.campaignId}/character/cast-spell` &&
						response.request().method() === 'POST'
					);
				});
				await castButton.click();
				const castResponse = await castResponsePromise;
				expect(castResponse.status()).toBe(201);
				const castRequest = castResponse.request().postDataJSON() as {
					spellIndex: number;
					slotLevel: number;
				};
				expect(castRequest).toMatchObject({ spellIndex: 1, slotLevel: 1 });
				const castResult = (await castResponse.json()) as {
					baseLevel: number;
					slotLevel: number;
					sheet: { spellSlots: Array<{ level: number; current: number }> };
				};
				expect(castResult).toMatchObject({ baseLevel: 1, slotLevel: 1 });
				expect(castResult.sheet.spellSlots.find((slot) => slot.level === 1)?.current).toBe(
					availableBeforeCast - 1
				);
				await expect
					.poll(async () => {
						const response = await fixture!.playerApi.get(
							`/api/v1/campaigns/${fixture!.campaignId}/character`
						);
						const result = (await response.json()) as {
							sheet: { spellSlots: Array<{ level: number; current: number }> };
						};
						return result.sheet.spellSlots.find((slot) => slot.level === 1)?.current;
					})
					.toBe(availableBeforeCast - 1);
				await expect(
					fixture!.gm.locator('.floating-chat [data-event-id]').filter({
						hasText: 'Mísseis da ficha E2E'
					})
				).toBeVisible();
				await expect(fixture!.player.locator('.presentation-text')).toContainText(
					'Mísseis da ficha E2E'
				);
				await expect(fixture!.player.locator('.presentation-text')).toContainText(
					'Três dardos luminosos atingem os alvos.'
				);
				await expect(fixture!.gm.locator('.presentation-text')).toContainText(
					'Três dardos luminosos atingem os alvos.'
				);
				const remainingSlots = availableBeforeCast - 1;
				if (remainingSlots > 0) {
					const secondCast = await fixture!.playerApi.post(
						`/api/v1/campaigns/${fixture!.campaignId}/character/cast-spell`,
						{ data: { spellIndex: 1, slotLevel: 1, presentationSceneId: fixture!.sceneId } }
					);
					expect(secondCast.status()).toBe(201);
					const secondResult = (await secondCast.json()) as {
						sheet: { spellSlots: Array<{ level: number; current: number }> };
					};
					expect(secondResult.sheet.spellSlots.find((slot) => slot.level === 1)?.current).toBe(
						remainingSlots - 1
					);
				}
				const beforeRejectedCastEventsResponse = await fixture!.playerApi.get(
					`/api/v1/campaigns/${fixture!.campaignId}/events`
				);
				expect(beforeRejectedCastEventsResponse.status()).toBe(200);
				const beforeRejectedCastEvents = (await beforeRejectedCastEventsResponse.json()) as {
					events: Array<{ id: number }>;
				};
				const beforeRejectedCastPresentationResponse = await fixture!.playerApi.get(
					`/api/v1/scenes/${fixture!.sceneId}/presentation`
				);
				expect(beforeRejectedCastPresentationResponse.status()).toBe(200);
				const beforeRejectedCastPresentation = await beforeRejectedCastPresentationResponse.json();
				const rejectedCast = await fixture!.playerApi.post(
					`/api/v1/campaigns/${fixture!.campaignId}/character/cast-spell`,
					{ data: { spellIndex: 1, slotLevel: 1, presentationSceneId: fixture!.sceneId } }
				);
				expect(rejectedCast.status()).toBe(400);
				const afterRejectedCastEventsResponse = await fixture!.playerApi.get(
					`/api/v1/campaigns/${fixture!.campaignId}/events`
				);
				const afterRejectedCastEvents = (await afterRejectedCastEventsResponse.json()) as {
					events: Array<{ id: number }>;
				};
				expect(afterRejectedCastEvents.events.map((event) => event.id)).toEqual(
					beforeRejectedCastEvents.events.map((event) => event.id)
				);
				const afterRejectedCastPresentationResponse = await fixture!.playerApi.get(
					`/api/v1/scenes/${fixture!.sceneId}/presentation`
				);
				const afterRejectedCastPresentation = await afterRejectedCastPresentationResponse.json();
				expect(afterRejectedCastPresentation).toEqual(beforeRejectedCastPresentation);
				await player.getByRole('button', { name: 'Fechar imagem para mim' }).click();
				await expect(player.locator('.presentation-backdrop')).toHaveCount(0);
			});
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

	for (const viewport of [
		{ name: 'narrow', width: 390, height: 844 },
		{ name: 'desktop', width: 1440, height: 900 }
	] as const) {
		test(`player sheet stays usable after reopen on ${viewport.name} viewport with chat open`, async ({
			browser
		}) => {
			let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
			try {
				fixture = await createLocalAuthenticatedFixture(browser);
				const character = await fixture.createCharacter(fixture.playerUserId, {
					name: `Ficha ${viewport.name} E2E`
				});
				// Headless Chromium exposes WebGL and auto-selects 3D; use 2D here while retaining the visible-overlay assertion.
				await fixture.player.evaluate(() =>
					localStorage.setItem('maismorras:dice-renderer-mode', '2d')
				);
				await fixture.createCharacterToken(character.id);
				const player = fixture.player;
				await player.setViewportSize({ width: viewport.width, height: viewport.height });
				await openMap(player, fixture.campaignId, fixture.sceneId);
				await player.getByLabel('Modo de renderização dos dados').selectOption('2d');
				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await player.getByRole('button', { name: 'Abrir como painel' }).click();
				const sheet = player.locator('.sheet-backdrop.floating .sheet');
				await expect(sheet).toBeVisible();

				const expectUsableGeometry = async () => {
					const box = await sheet.boundingBox();
					expect(box).not.toBeNull();
					expect(box!.width).toBeGreaterThan(300);
					expect(box!.x).toBeGreaterThanOrEqual(0);
					expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
				};
				await expectUsableGeometry();

				await player.getByRole('button', { name: 'Mesa', exact: true }).click();
				await expect(player.locator('canvas').first()).toBeVisible();
				await player.locator('.table-tools button[title="Dados"]').click();
				const rollResponse = player.waitForResponse((response) => {
					const request = response.request();
					return (
						request.url().includes(`/api/v1/campaigns/${fixture!.campaignId}/events`) &&
						request.method() === 'POST' &&
						request.postData()?.includes('"expression":"1d20"') === true
					);
				});
				await player.getByRole('button', { name: 'Rolar 1d20' }).click();
				const roll = (await (await rollResponse).json()) as { id: string | number };
				await expect(
					player.locator(`.dice-overlay article[data-roll-id="${roll.id}"]`)
				).toBeVisible();
				await expectUsableGeometry();

				await player.getByRole('button', { name: 'Minimizar ficha' }).click();
				await expect(sheet).toHaveClass(/minimized/);
				await expect(sheet.locator('.sheet-body')).toHaveCount(0);
				await player.getByRole('button', { name: 'Restaurar ficha' }).click();
				await expect(sheet.locator('.sheet-body')).toBeVisible();
				await expectUsableGeometry();

				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				await player.getByRole('button', { name: 'Abrir como painel' }).click();
				await player.getByRole('button', { name: 'Fechar ficha' }).click();
				await expect(player.locator('.sheet-backdrop.floating .sheet')).toHaveCount(0);
				await player.getByRole('button', { name: 'Abrir como painel' }).click();
				await expect(sheet).toBeVisible();
				await expectUsableGeometry();
			} finally {
				await fixture?.close();
			}
		});
	}

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

	test('standalone sheet enforces ownership and remains isolated @routine-gate', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare independent player and narrator character sheets', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				await fixture.createCharacter(fixture.playerUserId, { name: 'Ficha própria E2E' });
				await fixture.createCharacter(fixture.gmUserId, { name: 'Ficha alheia E2E' });
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

	test('own-token action opens and reuses one authorized auxiliary sheet @routine-gate', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const own = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Ficha popup própria E2E'
			});
			await fixture.createCharacterToken(own.id);
			const f = fixture;
			const popup = await openOwnCharacterPopup(f, own.id);
			await expect(popup.locator('.sheet')).toContainText('Ficha popup própria E2E');
			await expect(
				popup.locator('canvas, .app-header, .floating-chat, .actor-drawer, .audio-channels')
			).toHaveCount(0);
			const pageCount = f.player.context().pages().length;
			await f.player.getByRole('button', { name: 'Destacar ficha', exact: true }).click();
			await expect.poll(() => f.player.context().pages().length).toBe(pageCount);
			await expect(popup.locator('.sheet')).toBeVisible();
			await popup.close();
		} finally {
			await fixture?.close();
		}
	});

	for (const viewport of [
		{ name: 'desktop', width: 1280, height: 900 },
		{ name: 'narrow', width: 390, height: 720 }
	] as const) {
		test(`auxiliary sheet fills its own ${viewport.name} viewport`, async ({
			browser
		}, testInfo) => {
			let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
			try {
				fixture = await createLocalAuthenticatedFixture(browser);
				const own = await fixture.createCharacter(fixture.playerUserId, {
					name: `Ficha popup ${viewport.name} E2E`
				});
				await fixture.createCharacterToken(own.id);
				const popup = await openOwnCharacterPopup(fixture, own.id);
				await test.step(`resize popup to ${viewport.width}x${viewport.height} and verify sheet layout`, async () => {
					await assertPopupUsesItsViewport(popup, testInfo, viewport.width, viewport.height);
				});
				await expect(
					popup.locator('canvas, .app-header, .floating-chat, .actor-drawer, .audio-channels')
				).toHaveCount(0);
				await popup.close();
			} finally {
				await fixture?.close();
			}
		});
	}

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
			await Promise.all([
				f.player.evaluate(() => localStorage.setItem('maismorras:dice-renderer-mode', '2d')),
				f.gm.evaluate(() => localStorage.setItem('maismorras:dice-renderer-mode', '2d'))
			]);
			await Promise.all([
				openMap(f.player, f.campaignId, f.sceneId),
				openMap(f.gm, f.campaignId, f.sceneId)
			]);
			await Promise.all([
				f.player.getByLabel('Modo de renderização dos dados').selectOption('2d'),
				f.gm.getByLabel('Modo de renderização dos dados').selectOption('2d')
			]);
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
				await inspector
					.locator('.summary-section')
					.filter({ hasText: 'Ataques' })
					.locator('summary')
					.click();
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
			await test.step('cast own cantrip to chat and central presentation without consuming a slot', async () => {
				const before = (await (await characterResponse()).json()) as {
					sheet: { spellSlots: Array<{ level: number; current: number }> };
				};
				const slotCount = before.sheet.spellSlots.find((slot) => slot.level === 1)?.current;
				await inspector.locator('.spell-groups').locator('summary').first().click();
				const cantrip = inspector.locator('.spell-groups details').filter({ hasText: 'Truques' });
				await cantrip.locator('summary').click();
				const eventsBeforeResponse = await f.playerApi.get(
					`/api/v1/campaigns/${f.campaignId}/events`
				);
				const eventsBefore = (await eventsBeforeResponse.json()) as { events: unknown[] };
				await test.step('cast and verify the persisted campaign event', async () => {
					await cantrip.getByRole('button', { name: 'Lançar', exact: true }).click();
					await expect
						.poll(async () => {
							const response = await f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/events`);
							return ((await response.json()) as { events: unknown[] }).events.length;
						})
						.toBeGreaterThan(eventsBefore.events.length);
					const castEventsResponse = await f.playerApi.get(
						`/api/v1/campaigns/${f.campaignId}/events`
					);
					const castEvents = (await castEventsResponse.json()) as {
						events: Array<{ type: string; payload: { text?: string; spellCast?: boolean } }>;
					};
					const cantripEvent = castEvents.events.find(
						(event) => event.type === 'chat.message' && event.payload.spellCast
					);
					expect(cantripEvent?.payload.text).toContain('Luz E2E');
					expect(cantripEvent?.payload.text).toContain('nenhum espaço consumido');
				});
				await test.step('verify slot state and presentation for player and narrator', async () => {
					const after = (await (await characterResponse()).json()) as {
						sheet: { spellSlots: Array<{ level: number; current: number }> };
					};
					expect(after.sheet.spellSlots.find((slot) => slot.level === 1)?.current).toBe(slotCount);
					await expect(
						f.gm.locator('.floating-chat [data-event-id]').filter({ hasText: 'Luz E2E' })
					).toBeVisible();
					await expect(f.player.locator('.presentation-text')).toContainText('Luz E2E');
					await expect(f.player.locator('.presentation-text')).toContainText('Uma luz aparece.');
					await expect(f.gm.locator('.presentation-text')).toContainText('Luz E2E');
					await expect(f.gm.locator('.presentation-text')).toContainText('Uma luz aparece.');
					await f.player.getByRole('button', { name: 'Fechar imagem para mim' }).click();
					await expect(f.player.locator('.presentation-backdrop')).toHaveCount(0);
					await inspector.locator('.spell-groups').locator('summary').first().click();
				});
			});
			await test.step('cast owned leveled spell and verify its slot was consumed', async () => {
				const before = (await (await characterResponse()).json()) as {
					sheet: { spellSlots: Array<{ level: number; current: number; max: number }> };
				};
				const currentBefore =
					before.sheet.spellSlots.find((slot) => slot.level === 1)?.current ?? 0;
				expect(currentBefore).toBeGreaterThan(0);
				await inspector.locator('.spell-groups').locator('summary').first().click();
				const firstCircle = inspector
					.locator('.spell-groups details')
					.filter({ hasText: '1º círculo' });
				await firstCircle.locator('summary').click();
				const castButton = firstCircle.getByRole('button', { name: 'Lançar', exact: true });
				await expect(castButton).toBeVisible();
				await expect(castButton).toBeEnabled();
				await castButton.click();
				await expect
					.poll(async () => {
						const value = (await (await characterResponse()).json()) as {
							sheet: { spellSlots: Array<{ level: number; current: number }> };
						};
						return value.sheet.spellSlots.find((slot) => slot.level === 1)?.current;
					})
					.toBe(currentBefore - 1);
			});
			await test.step('display spell as a persisted campaign chat message', async () => {
				await f.player.getByRole('button', { name: 'Fechar imagem para mim' }).click();
				await expect(f.player.locator('.presentation-backdrop')).toHaveCount(0);
				const beforeDisplay = (await (await characterResponse()).json()) as {
					sheet: { spellSlots: Array<{ level: number; current: number }> };
				};
				await inspector.getByRole('button', { name: 'Exibir' }).last().click();
				await expect(
					f.player.locator('.floating-chat article:not(.combat)').filter({
						hasText: /Mísseis E2E/
					})
				).toBeVisible();
				const eventsResponse = await f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/events`);
				expect(eventsResponse.ok()).toBeTruthy();
				const events = (await eventsResponse.json()) as {
					events: Array<{ type: string; payload: { text?: string; spellCast?: boolean } }>;
				};
				expect(
					events.events.some(
						(event) => event.type === 'chat.message' && event.payload.text?.includes('Mísseis E2E')
					)
				).toBeTruthy();
				expect(
					events.events.find(
						(event) => event.type === 'chat.message' && event.payload.text?.includes('Mísseis E2E')
					)?.payload.spellCast
				).toBeUndefined();
				const afterDisplay = (await (await characterResponse()).json()) as typeof beforeDisplay;
				expect(afterDisplay.sheet.spellSlots).toEqual(beforeDisplay.sheet.spellSlots);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('class features and feats publish through the shared chat and scene presentation', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const f = fixture;
			await f.createCharacter(f.playerUserId, {
				name: 'Ficha de destaque E2E',
				class: 'Clérigo',
				level: 2,
				feats: 'Agarrador (Grappler)'
			});
			const foreignCharacter = await f.createCharacter(f.gmUserId, {
				name: 'Ficha alheia E2E',
				class: 'Clérigo',
				level: 2,
				feats: 'Agarrador (Grappler)'
			});
			const receiver = await f.addPlayer();
			await Promise.all([
				openMap(f.player, f.campaignId, f.sceneId),
				openMap(f.gm, f.campaignId, f.sceneId),
				openMap(receiver.page, f.campaignId, f.sceneId)
			]);

			await test.step('player presents a class feature and feat from their own sheet to both peers', async () => {
				const foreignCharacterResponse = await f.playerApi.get(
					`/api/v1/campaigns/${f.campaignId}/characters/${foreignCharacter.id}`
				);
				expect(foreignCharacterResponse.status()).toBe(403);

				await f.player.getByRole('button', { name: 'Fichas', exact: true }).click();
				const sheet = f.player.locator('.sheets-view .sheet');
				await expect(sheet.locator('header h2')).toHaveText('Ficha de destaque E2E');
				const feature = sheet
					.locator('.progression .feature-toggle')
					.filter({ hasText: 'Canalizar Divindade' });
				await expect(feature).toHaveCount(1);
				await feature.click();
				await expect(feature).toHaveAttribute('aria-expanded', 'true');
				const featureDescriptionElement = sheet.locator('.feature-description');
				const featureDescription = (await featureDescriptionElement.count())
					? (await featureDescriptionElement.first().textContent())?.trim() ||
						'Descrição não cadastrada.'
					: 'Descrição não cadastrada.';
				const presentFeature = sheet.getByRole('button', { name: 'Destacar na tela' });
				await expect(presentFeature).toBeVisible();
				await presentFeature.click();
				for (const page of [f.gm, receiver.page]) {
					const message = page
						.locator('.floating-chat [data-event-id]')
						.filter({ hasText: 'Canalizar Divindade' });
					await expect(message).toBeVisible();
					await expect(message).toContainText(featureDescription);
				}

				await sheet.getByRole('button', { name: 'Detalhes', exact: true }).click();
				await sheet.getByRole('button', { name: 'Agarrador (Grappler)', exact: true }).click();
				const featDescription = (
					await sheet.locator('.feat-manager aside p').textContent()
				)?.trim();
				expect(featDescription).toContain('Você recebe os benefícios a seguir.');
				await sheet.getByRole('button', { name: 'Destacar na tela' }).click();
				for (const page of [f.gm, receiver.page]) {
					const message = page
						.locator('.floating-chat [data-event-id]')
						.filter({ hasText: 'Agarrador (Grappler)' });
					await expect(message).toBeVisible();
					await expect(message).toContainText(featDescription!);
				}
			});

			await test.step('narrator selects the player sheet and presents both entries centrally', async () => {
				await f.gm.getByRole('button', { name: 'Fichas', exact: true }).click();
				const sheet = f.gm.locator('.sheets-view .sheet');
				await expect(sheet.locator('header h2')).toHaveText('Ficha de destaque E2E');
				const feature = sheet
					.locator('.progression .feature-toggle')
					.filter({ hasText: 'Canalizar Divindade' });
				await feature.click();
				const featureDescriptionElement = sheet.locator('.feature-description');
				const featureDescription = (await featureDescriptionElement.count())
					? (await featureDescriptionElement.first().textContent())?.trim() ||
						'Descrição não cadastrada.'
					: 'Descrição não cadastrada.';
				await sheet.getByRole('button', { name: 'Destacar na tela' }).click();
				await expect(f.player.locator('.presentation-text')).toContainText('Canalizar Divindade');
				await expect(f.player.locator('.presentation-text')).toContainText(featureDescription);
				await expect(receiver.page.locator('.presentation-text')).toContainText(
					'Canalizar Divindade'
				);
				await expect(
					receiver.page
						.locator('.floating-chat [data-event-id]')
						.filter({ hasText: 'Canalizar Divindade' })
						.last()
				).toBeVisible();

				await sheet.getByRole('button', { name: 'Detalhes', exact: true }).click();
				await sheet.getByRole('button', { name: 'Agarrador (Grappler)', exact: true }).click();
				const featDescription = (
					await sheet.locator('.feat-manager aside p').textContent()
				)?.trim();
				expect(featDescription).toContain('Você recebe os benefícios a seguir.');
				await sheet.getByRole('button', { name: 'Destacar na tela' }).click();
				await expect(f.player.locator('.presentation-text')).toContainText('Agarrador (Grappler)');
				await expect(f.player.locator('.presentation-text')).toContainText(featDescription!);
				await expect(receiver.page.locator('.presentation-text')).toContainText(
					'Agarrador (Grappler)'
				);
				await expect(
					receiver.page
						.locator('.floating-chat [data-event-id]')
						.filter({ hasText: 'Agarrador (Grappler)' })
						.last()
				).toBeVisible();
			});
		} finally {
			await fixture?.close();
		}
	});

	for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
		test(`weapon damage d${sides} saves and reopens for base and alternate attacks`, async ({
			browser
		}) => {
			const state = await openDamageBuilderFixture(browser);
			const {
				fixture,
				weapon,
				baseBuilder,
				profile,
				chooseDie,
				saveAndAssertSuccess,
				readSavedDamage,
				reopenSavedSheet
			} = state;
			try {
				await chooseDie(baseBuilder, sides);
				await expect(weapon.locator('.weapon-combat-summary').first()).toContainText(`1d${sides}`);
				await expect(baseBuilder.getByRole('alert')).toHaveCount(0);
				await saveAndAssertSuccess();
				await expect.poll(async () => (await readSavedDamage()).damage).toBe(`1d${sides}`);
				await reopenSavedSheet();
				await expect(weapon.locator('.weapon-combat-summary').first()).toContainText(`1d${sides}`);

				await profile.getByText('Golpe alternativo', { exact: true }).click();
				const profileBuilder = profile.locator('fieldset.profile-damage-builder');
				await chooseDie(profileBuilder, sides);
				await expect(profile.locator('.profile-damage-summary')).toContainText(`1d${sides}`);
				await expect(profileBuilder.getByRole('alert')).toHaveCount(0);
				await saveAndAssertSuccess();
				await expect
					.poll(async () => (await readSavedDamage()).attackProfiles[0].damage)
					.toBe(`1d${sides}`);
				await reopenSavedSheet();
				await profile.getByText('Golpe alternativo', { exact: true }).click();
				await expect(profile.locator('.profile-damage-summary')).toContainText(`1d${sides}`);
			} finally {
				await fixture.close();
			}
		});
	}

	test('weapon damage builder stays responsive and rolls saved formulas for base and alternate attacks', async ({
		browser
	}) => {
		const state = await openDamageBuilderFixture(browser);
		const {
			fixture,
			page,
			weapon,
			baseBuilder,
			profile,
			chooseDie,
			saveAndAssertSuccess,
			readSavedDamage,
			reopenSavedSheet
		} = state;
		try {
			await baseBuilder.locator('button.secondary-button').click();
			const components = baseBuilder.locator('.damage-component');
			await expect(components).toHaveCount(2);
			await chooseDie(baseBuilder, 100);
			await chooseDie(components.nth(1), 8);
			await expect(weapon.locator('.weapon-combat-summary').first()).toContainText('1d100+1d8');
			const desktopRects = await components.evaluateAll((nodes) =>
				nodes.map((node) => {
					const rect = node.getBoundingClientRect();
					return { x: rect.x, y: rect.y, right: rect.right };
				})
			);
			expect(desktopRects[1].x).toBeGreaterThan(desktopRects[0].x);
			await page.setViewportSize({ width: 390, height: 844 });
			const narrowLayout = await components.evaluateAll((nodes) =>
				nodes.map((node) => {
					const rect = node.getBoundingClientRect();
					return { x: rect.x, y: rect.y, right: rect.right };
				})
			);
			expect(narrowLayout.every((rect) => rect.right <= 390)).toBeTruthy();
			expect(narrowLayout[1].y).toBeGreaterThan(narrowLayout[0].y);
			const baseCount = baseBuilder.locator('input[type="number"]').first();
			await baseCount.fill('0');
			await expect(baseBuilder.getByRole('alert')).toBeVisible();
			await baseCount.fill('1');
			await expect(baseBuilder.getByRole('alert')).toHaveCount(0);
			await saveAndAssertSuccess();
			await expect.poll(async () => (await readSavedDamage()).damage).toBe('1d100+1d8');

			await profile.getByText('Golpe alternativo', { exact: true }).click();
			const profileBuilder = profile.locator('fieldset.profile-damage-builder');
			await chooseDie(profileBuilder, 100);
			await expect(profile.locator('.profile-damage-summary')).toContainText('1d100');
			await saveAndAssertSuccess();
			await expect
				.poll(async () => (await readSavedDamage()).attackProfiles[0].damage)
				.toBe('1d100');
			await reopenSavedSheet();
			await profile.getByText('Golpe alternativo', { exact: true }).click();
			await expect(profile.locator('.profile-damage-summary')).toContainText('1d100');

			const reopenedWeapon = weapon;
			await expect(reopenedWeapon.locator('.weapon-combat-summary').first()).toContainText(
				'1d100+1d8'
			);
			const reopenedProfile = profile;
			await expect(reopenedProfile.locator('.profile-damage-summary')).toContainText('1d100');
			const readRolls = async () => {
				const response = await fixture!.playerApi.get(
					`/api/v1/campaigns/${fixture!.campaignId}/events`
				);
				expect(response.ok()).toBeTruthy();
				return (
					(await response.json()) as {
						events: Array<{ type: string; payload: { expressao?: string } }>;
					}
				).events.filter((event) => event.type === 'dice.roll');
			};
			const initialRollCount = (await readRolls()).length;
			await reopenedWeapon.getByRole('button', { name: 'Dano', exact: true }).first().click();
			await expect.poll(async () => (await readRolls()).length).toBeGreaterThan(initialRollCount);
			let rolls = await readRolls();
			expect(rolls.at(-1)?.payload.expressao).toContain('1d100+1d8');
			const profileRollCount = rolls.length;
			await reopenedProfile.getByRole('button', { name: 'Dano', exact: true }).click();
			await expect.poll(async () => (await readRolls()).length).toBeGreaterThan(profileRollCount);
			rolls = await readRolls();
			expect(rolls.at(-1)?.payload.expressao).toContain('1d100');
		} finally {
			await fixture.close();
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

	test('GM cannot cast through the own-character route for a selected player', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			await test.step('prepare player character with cantrip and slotted spell', async () => {
				await diagnoseOnFailure(
					testInfo,
					fixture!.gm,
					'prepare spellcasting token and campaign maps',
					['.workspace-tabs', 'canvas', '.token-inspector', '.floating-chat', '.presentation-text'],
					async () => {
						const character = await fixture!.createCharacter(fixture!.playerUserId, {
							name: 'Alvo do narrador',
							spellcastingOverride: true,
							spells: [
								{ name: 'Truque alvo E2E', level: 0, notes: 'Efeito de teste.' },
								{
									name: 'Magia alvo E2E',
									level: 1,
									notes: 'Efeito com espaço.',
									diceFormula: '1d6'
								}
							],
							spellSlots: [{ level: 1, current: 1, max: 1 }]
						});
						await fixture!.createCharacterToken(character.id);
						await openMap(fixture!.player, fixture!.campaignId, fixture!.sceneId);
						await openMap(fixture!.gm, fixture!.campaignId, fixture!.sceneId);
					}
				);
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
				await f.gm.waitForLoadState('networkidle');
				await selectTokenAtDefaultPosition(f.gm);
				const inspector = f.gm.locator('.token-inspector');
				await inspector.locator('.spell-groups').locator('summary').first().click();
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
		} finally {
			await fixture?.close();
		}
	});

	test("GM display publishes another player's spell to campaign chat and presentation", async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const f = fixture;
			const character = await f.createCharacter(f.playerUserId, {
				name: 'Alvo do narrador para exibição',
				spellcastingOverride: true,
				spells: [
					{ name: 'Magia alvo E2E', level: 1, notes: 'Efeito com espaço.', diceFormula: '1d6' }
				],
				spellSlots: [{ level: 1, current: 1, max: 1 }]
			});
			await f.createCharacterToken(character.id);
			await Promise.all([
				openMap(f.player, f.campaignId, f.sceneId),
				openMap(f.gm, f.campaignId, f.sceneId)
			]);
			const unauthorizedSpellRequests: string[] = [];
			f.gm.on('request', (request) => {
				if (
					request.method() === 'POST' &&
					request.url().includes(`/api/v1/campaigns/${f.campaignId}/character/cast-spell`)
				)
					unauthorizedSpellRequests.push('POST');
			});
			await test.step('GM displays the selected player spell to chat and presentation', () =>
				diagnoseOnFailure(
					testInfo,
					f.gm,
					'display selected player spell to chat and presentation',
					[
						'.token-inspector',
						'.token-inspector .spell-groups',
						'.token-inspector .spell-groups details',
						'.token-inspector .spell-row',
						'.token-inspector .spell-row button',
						'.floating-chat',
						'.presentation-text'
					],
					async () => {
						await selectTokenAtDefaultPosition(f.gm);
						const inspector = f.gm.locator('.token-inspector');
						const spellCategory = inspector.locator('.spell-groups');
						if (!(await spellCategory.evaluate((node) => (node as HTMLDetailsElement).open)))
							await spellCategory.locator('summary').first().click();
						const spellGroup = inspector
							.locator('.spell-groups details')
							.filter({ hasText: 'Magia alvo E2E' });
						if (!(await spellGroup.evaluate((node) => (node as HTMLDetailsElement).open)))
							await spellGroup.locator('summary').click();
						const spell = spellGroup.locator('.spell-row').filter({ hasText: 'Magia alvo E2E' });
						await spell.getByRole('button', { name: 'Exibir' }).click();
						await expect(
							f.gm.locator('.floating-chat [data-event-id]').filter({ hasText: 'Magia alvo E2E' })
						).toBeVisible();
						await expect(f.player.locator('.presentation-text')).toContainText('Magia alvo E2E');
						await expect(f.player.locator('.presentation-text')).toContainText(
							'Efeito com espaço.'
						);
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
					}
				));
		} finally {
			await fixture?.close();
		}
	});

	test('narrator campaign rule overrides Magic Initiate and grants one persisted free casting', async ({
		browser
	}, testInfo) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const f = fixture;
			const compendiumResponse = await f.gmApi.get(`/api/v1/campaigns/${f.campaignId}/compendium`);
			expect(compendiumResponse.status()).toBe(200);
			const compendium = (await compendiumResponse.json()) as {
				entries: Array<{
					id: string;
					entryType: string;
					name: string;
					summary: string;
					rules: Record<string, unknown>;
					translations: Record<string, string>;
				}>;
			};
			const feat = compendium.entries.find(
				(entry) => entry.entryType === 'feat' && entry.rules.id === 'magic-initiate'
			);
			const spell = compendium.entries.find(
				(entry) => entry.entryType === 'spell' && Number(entry.rules.level) === 1
			);
			expect(feat, 'campaign compendium contains the published Magic Initiate feat').toBeTruthy();
			expect(spell, 'campaign compendium contains a published first-level spell').toBeTruthy();
			const featName = feat!.translations['pt-BR'] || feat!.name;
			const spellName = spell!.translations['pt-BR'] || spell!.name;

			let phase = 'navigate to campaign compendium';
			const browserErrorKinds = new Set<string>();
			let failedScriptRequestCount = 0;
			f.gm.on('pageerror', (error) => browserErrorKinds.add(classifyBrowserError(error.message)));
			f.gm.on('requestfailed', (request) => {
				if (request.resourceType() === 'script') failedScriptRequestCount += 1;
			});
			await test.step('narrator configures a campaign-only Magic Initiate mapping in Compendium', () =>
				diagnoseOnFailure(
					testInfo,
					f.gm,
					'configure campaign feat spell rule',
					[
						'.workspace-tabs',
						'.compendium',
						'.entry-grid',
						'.entry-grid button',
						'.entry-details',
						'.feat-spell-rule',
						'.feat-spell-rule button',
						'.feat-spell-rule select',
						'.feat-spell-rule input',
						'.floating-chat',
						'.audio-channels',
						'.audio-channels select'
					],
					async () => {
						phase = 'open the campaign workspace';
						await f.gm.goto(`/?campaign=${f.campaignId}`, {
							timeout: menuWaitBudget(testInfo)
						});
						phase = 'collapse the campaign chat to uncover the compendium work area';
						const chat = f.gm.locator('.floating-chat');
						if (!(await chat.evaluate((node) => node.classList.contains('closed')))) {
							await chat.locator('.chat-toggle').click({ timeout: menuWaitBudget(testInfo) });
							await expect(chat).toHaveClass(/closed/, {
								timeout: menuWaitBudget(testInfo)
							});
						}
						phase = 'open Compendium tab';
						await f.gm
							.getByRole('button', { name: 'Compêndio', exact: true })
							.click({ timeout: menuWaitBudget(testInfo) });
						phase = 'wait for the lazy Compendium view to become ready';
						try {
							await expect(f.gm.locator('.compendium')).toBeVisible({
								timeout: remainingTestBudget(testInfo)
							});
							expect(browserErrorKinds).not.toContain('pixi-initialization-cleanup-race');
						} catch {
							throw new Error(
								`Compendium readiness failed; browserErrorKinds=${[...browserErrorKinds].join(',') || 'none'}; failedScriptRequests=${failedScriptRequestCount}`
							);
						}
						phase = 'find the Magic Initiate feat';
						const search = f.gm.getByPlaceholder('Buscar por nome…');
						await expect(search).toBeVisible({ timeout: remainingTestBudget(testInfo) });
						await search.fill(featName, { timeout: menuWaitBudget(testInfo) });
						await f.gm
							.locator('.entry-grid button')
							.filter({ hasText: featName })
							.first()
							.click({ timeout: menuWaitBudget(testInfo) });
						phase = 'open structured feat spell configuration';
						await f.gm
							.getByRole('button', { name: 'Configurar magias concedidas' })
							.click({ timeout: menuWaitBudget(testInfo) });
						const rule = f.gm.locator('.feat-spell-rule');
						phase = 'enable explicit campaign override and add a spell';
						await rule
							.getByLabel('Usar esta regra explícita no lugar do mapeamento padrão')
							.check({ timeout: menuWaitBudget(testInfo) });
						await rule
							.getByRole('button', { name: 'Adicionar magia concedida' })
							.click({ timeout: menuWaitBudget(testInfo) });
						phase = 'select spell and configure free-use rules';
						await rule.getByLabel('Magia do compêndio').selectOption(spell!.id, {
							timeout: menuWaitBudget(testInfo)
						});
						await rule.getByLabel('Conjurações gratuitas').fill('1', {
							timeout: menuWaitBudget(testInfo)
						});
						await rule.getByLabel('Recuperar usos em').selectOption('long', {
							timeout: menuWaitBudget(testInfo)
						});
						await rule.getByLabel('INTELLIGENCE').check({
							timeout: menuWaitBudget(testInfo)
						});
						phase = 'save campaign feat spell rule';
						await rule
							.getByRole('button', { name: 'Salvar regra da campanha' })
							.click({ timeout: menuWaitBudget(testInfo) });
						await expect(f.gm.getByText(/Regra de magias do talento salva/)).toBeVisible({
							timeout: menuWaitBudget(testInfo)
						});
						phase = 'close saved campaign spell rule editor';
						await rule.getByRole('button', { name: 'Fechar' }).click({
							timeout: menuWaitBudget(testInfo)
						});
						await expect(rule).toBeHidden({ timeout: menuWaitBudget(testInfo) });
						phase = 'reopen campaign spell rule editor and verify persisted selections';
						await f.gm
							.getByRole('button', { name: 'Configurar magias concedidas' })
							.click({ timeout: menuWaitBudget(testInfo) });
						await expect(rule).toBeVisible({ timeout: menuWaitBudget(testInfo) });
						await expect(
							rule.getByLabel('Usar esta regra explícita no lugar do mapeamento padrão')
						).toBeChecked();
						await expect(rule.getByLabel('Magia do compêndio')).toHaveValue(spell!.id);
						await expect(rule.getByLabel('Conjurações gratuitas')).toHaveValue('1');
						await expect(rule.getByLabel('Recuperar usos em')).toHaveValue('long');
						await expect(rule.getByLabel('Pode usar espaços existentes')).not.toBeChecked();
						await expect(rule.getByLabel('INTELLIGENCE')).toBeChecked();
					},
					() => phase
				));

			const savedCompendiumResponse = await f.gmApi.get(
				`/api/v1/campaigns/${f.campaignId}/compendium`
			);
			const savedCompendium = (await savedCompendiumResponse.json()) as typeof compendium;
			const savedFeat = savedCompendium.entries.find((entry) => entry.id === feat!.id)!;
			const override = (savedFeat.rules.campaignOverrides as Record<string, unknown>)
				.featSpellGrant as {
				enabled: boolean;
				spells: Array<{
					spellEntryId: string;
					freeUses: number;
					recovery: string;
					canUseExistingSlots: boolean;
					abilityOptions: string[];
				}>;
			};
			expect(override).toMatchObject({
				enabled: true,
				spells: [
					{
						spellEntryId: spell!.id,
						freeUses: 1,
						recovery: 'long',
						canUseExistingSlots: false,
						abilityOptions: ['intelligence']
					}
				]
			});

			const character = await f.createCharacter(f.playerUserId, {
				name: 'Iniciado em Magia por campanha E2E',
				class: 'Fighter',
				level: 1,
				feats: featName,
				campaignFeatSpellGrants: [
					{
						featEntryId: feat!.id,
						spellcastingAbilities: { [spell!.id]: 'intelligence' },
						freeCastsRemaining: { [spell!.id]: 99 },
						active: true
					}
				]
			});
			expect(character.sheet.campaignFeatSpellGrants).toMatchObject([
				{
					id: `campaign-feat:${feat!.id}:1`,
					spellcastingAbilities: { [spell!.id]: 'intelligence' },
					freeCastsRemaining: { [spell!.id]: 1 },
					active: true
				}
			]);
			expect(character.sheet.spellSlots).toEqual([]);

			await test.step('player sees the campaign-granted spell despite having no class spellcasting', async () => {
				await f.player.goto(`/sheet?campaign=${f.campaignId}&character=${character.id}`);
				await expect(f.player.locator('.sheet')).toBeVisible({ timeout: 15_000 });
				await f.player.getByRole('button', { name: 'Magias', exact: true }).click();
				const spellCard = f.player.locator('.spell-card').filter({ hasText: spellName });
				await expect(spellCard).toBeVisible({
					timeout: menuWaitBudget(testInfo)
				});
				await spellCard.getByRole('button').first().click();
				await expect(spellCard.locator('.feat-casting-source')).toContainText(featName);
				await expect(spellCard.getByRole('button', { name: 'Lançar grátis (1)' })).toBeVisible();
			});

			await test.step('free cast is authorized by the server, spends exactly one use and adds no slot', async () => {
				const castResponse = f.player.waitForResponse((response) => {
					const url = new URL(response.url());
					return (
						response.request().method() === 'POST' &&
						url.pathname === `/api/v1/campaigns/${f.campaignId}/character/cast-spell`
					);
				});
				await f.player.getByRole('button', { name: 'Lançar grátis (1)' }).click();
				const response = await castResponse;
				expect(response.status()).toBe(201);
				const result = (await response.json()) as {
					sheet: {
						campaignFeatSpellGrants: Array<{ freeCastsRemaining: Record<string, number> }>;
						spellSlots: unknown[];
					};
				};
				expect(result.sheet.campaignFeatSpellGrants[0].freeCastsRemaining[spell!.id]).toBe(0);
				expect(result.sheet.spellSlots).toEqual([]);
				const reloaded = await f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/character`);
				expect(reloaded.status()).toBe(200);
				const saved = (await reloaded.json()) as typeof result;
				expect(saved.sheet.campaignFeatSpellGrants[0].freeCastsRemaining[spell!.id]).toBe(0);
				expect(saved.sheet.spellSlots).toEqual([]);
				const shortRest = await f.playerApi.post(
					`/api/v1/campaigns/${f.campaignId}/character/rest`,
					{ data: { kind: 'short' } }
				);
				expect(shortRest.status()).toBe(200);
				const afterShortRest = (await shortRest.json()) as typeof result;
				expect(afterShortRest.sheet.campaignFeatSpellGrants[0].freeCastsRemaining[spell!.id]).toBe(
					0
				);
				const longRest = await f.playerApi.post(
					`/api/v1/campaigns/${f.campaignId}/character/rest`,
					{ data: { kind: 'long' } }
				);
				expect(longRest.status()).toBe(200);
				const afterLongRest = (await longRest.json()) as typeof result;
				expect(afterLongRest.sheet.campaignFeatSpellGrants[0].freeCastsRemaining[spell!.id]).toBe(
					1
				);
				expect(afterLongRest.sheet.spellSlots).toEqual([]);
			});
		} finally {
			await fixture?.close();
		}
	});

	async function startLinkedSheetScenario(browser: Browser, testInfo: TestInfo) {
		const prepared = await prepareSavedPlayerSheet(browser, testInfo);
		const { player, sheet } = prepared;
		await test.step('open the same owned sheet from the map and focus its existing instance', async () => {
			await sheet.evaluate((node) => (node.dataset.instanceMarker = 'same-sheet-instance'));
			await player.getByRole('button', { name: 'Mesa', exact: true }).click();
			await expect(player.locator('canvas').first()).toBeVisible();
			let phase = 'move panels clear of canvas selection target';
			await diagnoseOnFailure(
				testInfo,
				player,
				'focus linked sheet from map inspector',
				[
					...sheetPanelDiagnosticSelectors,
					'.token-inspector',
					'.token-inspector .open-sheet',
					'.token-inspector .sheet-actions'
				],
				async () => {
					await movePanelAwayFromMapTarget(player, '.sheet-backdrop.floating .sheet', 'header h2');
					await movePanelAwayFromMapTarget(player, '.floating-chat', '.panel-grip');
					phase = 'select token and wait for inspector layout';
					await selectTokenAtDefaultPosition(player, true);
					const inspector = player.locator('.token-inspector');
					await expect(inspector).toBeVisible({ timeout: menuWaitBudget(testInfo) });
					phase = 'verify sheet leaves linked-sheet action accessible';
					const sheetBox = (await sheet.boundingBox())!;
					const inspectorBox = (await inspector.boundingBox())!;
					expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(inspectorBox.x + 2);
					phase = 'click linked-sheet action and focus the existing instance';
					await player
						.getByRole('button', { name: 'Abrir ficha vinculada' })
						.click({ timeout: menuWaitBudget(testInfo) });
					await expect(sheet.locator('header h2')).toHaveText('Ficha persistida E2E');
					await expect(sheet).toHaveAttribute('data-instance-marker', 'same-sheet-instance');
					await expect(player.locator('.sheet-backdrop .sheet')).toHaveCount(1);
				},
				() => phase
			);
			await test.step('map clicks outside the sheet and sheet controls inside it remain usable', async () => {
				const canvas = player.locator('canvas').first();
				await expect(player.locator('.token-inspector')).toBeVisible();
				await canvas.click({ position: { x: 105, y: 105 } });
				await expect(canvas).toBeFocused();
				const skillsTab = sheet.locator('.sheet-tabs').getByRole('button', {
					name: 'Perícias',
					exact: true
				});
				await skillsTab.click();
				await expect(skillsTab).toHaveClass(/active/);
				await expect(sheet.locator('.sheet-body')).toBeVisible();
			});
		});
		return prepared;
	}

	const sheetPanelDiagnosticSelectors = [
		'.sheet-backdrop',
		'.sheet-backdrop .sheet',
		'.sheet-backdrop .sheet header',
		'.sheet-backdrop .sheet button',
		'.sheet-backdrop .sheet-body',
		'.token-inspector',
		'.token-inspector .sheet-actions',
		'.token-inspector .open-sheet',
		'.workspace-tabs',
		'.actor-drawer',
		'.audio-channels'
	];

	test('player edits and reloads D&D money independently from inventory', async ({ browser }) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await test.step('prepare isolated campaign and player character', async () => {
				const createdFixture = await createLocalAuthenticatedFixture(browser);
				fixture = createdFixture;
				await createdFixture.createCharacter(createdFixture.playerUserId, {
					name: 'Dinheiro persistente E2E',
					money: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
					inventory: []
				});
				return createdFixture;
			});
			const character = await fixture.playerApi.get(
				`/api/v1/campaigns/${fixture.campaignId}/character`
			);
			expect(character.status()).toBe(200);
			const savedCharacter = (await character.json()) as { id: string };
			const page = fixture.player;
			await test.step('open the isolated player sheet and its equipment tab', async () => {
				await page.goto(`/sheet?campaign=${fixture!.campaignId}&character=${savedCharacter.id}`);
				await expect(page.locator('.sheet')).toBeVisible();
				await page.getByRole('button', { name: 'Inventário', exact: true }).click();
				await expect(page.locator('.money-panel')).toBeVisible();
			});
			const money = [
				['PC · Cobre', '13'],
				['PP · Prata', '4'],
				['PE · Electro', '2'],
				['PO · Ouro', '51'],
				['PL · Platina', '1']
			] as const;
			await test.step('edit all D&D denominations', async () => {
				for (const [label, value] of money) await page.getByLabel(label).fill(value);
			});
			await test.step('save through the authorized character route and verify the persisted response', async () => {
				const saveResponse = page.waitForResponse((response) => {
					const url = new URL(response.url());
					return (
						response.request().method() === 'PUT' &&
						(url.pathname === `/api/v1/campaigns/${fixture!.campaignId}/character` ||
							url.pathname.startsWith(`/api/v1/campaigns/${fixture!.campaignId}/characters/`))
					);
				});
				await page.getByRole('button', { name: 'Salvar ficha' }).click();
				const response = await saveResponse;
				expect(new URL(response.url()).pathname).toBe(
					`/api/v1/campaigns/${fixture!.campaignId}/characters/${savedCharacter.id}`
				);
				expect(response.status()).toBe(200);
				const saved = (await response.json()) as {
					sheet: {
						money: { cp: number; sp: number; ep: number; gp: number; pp: number };
						inventory: unknown[];
					};
				};
				expect(saved.sheet.money).toEqual({ cp: 13, sp: 4, ep: 2, gp: 51, pp: 1 });
				expect(saved.sheet.inventory).toEqual([]);
			});
			await test.step('reload the isolated sheet and confirm values remain separate from inventory', async () => {
				await page.reload();
				await expect(page.locator('.sheet')).toBeVisible();
				await page.getByRole('button', { name: 'Inventário', exact: true }).click();
				for (const [label, value] of money) await expect(page.getByLabel(label)).toHaveValue(value);
				await expect(page.locator('.money-panel')).toBeVisible();
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player sheet floats by default and moves by its title bar', async ({
		browser
	}, testInfo) => {
		let fixture: LocalAuthenticatedFixture | undefined;
		try {
			const prepared = await prepareSavedPlayerSheet(browser, testInfo);
			fixture = prepared.fixture;
			const { player, sheet } = prepared;
			await test.step('move floating sheet by its title bar', () => {
				let phase = 'assert sheet starts floating';
				return diagnoseOnFailure(
					testInfo,
					player,
					'move floating sheet',
					sheetPanelDiagnosticSelectors,
					async () => {
						await expect(player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
						await expect(sheet.locator('.sheet-mode-status')).toHaveText('Flutuante');
						await assertAboveAudioFooter(player, sheet);
						const before = (await sheet.boundingBox())!;
						const title = (await sheet.locator('header').boundingBox())!;
						const startX = title.x + title.width * 0.45;
						const startY = title.y + title.height / 2;
						markPointerTarget(player, 'move sheet', startX - 45, startY + 32, startX, startY);
						phase = 'drag title bar';
						await player.mouse.move(startX, startY);
						await player.mouse.down();
						await player.mouse.move(startX - 45, startY + 32);
						await player.mouse.up();
						phase = 'assert moved position';
						await expect
							.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().top))
							.toBeGreaterThan(before.y + 15);
						await assertAboveAudioFooter(player, sheet);
					},
					() => phase
				);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player sheet resizes within the viewport', async ({ browser }, testInfo) => {
		let fixture: LocalAuthenticatedFixture | undefined;
		try {
			const prepared = await prepareSavedPlayerSheet(browser, testInfo);
			fixture = prepared.fixture;
			const { player, sheet } = prepared;
			await player.getByRole('button', { name: 'Mesa', exact: true }).click();
			await expect(player.locator('canvas').first()).toBeVisible();
			await test.step('resize floating sheet from its lower corner', () => {
				let phase = 'measure initial sheet bounds';
				return diagnoseOnFailure(
					testInfo,
					player,
					'resize floating sheet',
					sheetPanelDiagnosticSelectors,
					async () => {
						await expect(player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
						await assertAboveAudioFooter(player, sheet);
						const chat = player.locator('.floating-chat');
						if (!(await chat.evaluate((node) => node.classList.contains('closed')))) {
							phase = 'collapse chat to give the sheet independent resize room';
							await chat.getByRole('button', { name: 'Chat da mesa' }).click();
						}
						await expect(chat).toHaveClass(/closed/);
						phase = 'move panel left to create safe resize room';
						await dragPanel(player, sheet.locator('header h2'), -500, 0);
						const before = (await sheet.boundingBox())!;
						const startX = before.x + before.width - 4;
						const startY = before.y + before.height - 4;
						markPointerTarget(player, 'shrink sheet', startX - 64, startY - 48, startX, startY);
						phase = 'drag lower resize corner inward';
						await player.mouse.move(startX, startY);
						await player.mouse.down();
						await player.mouse.move(startX - 64, startY - 48, {
							steps: 4
						});
						await player.mouse.up();
						phase = 'assert the panel shrank';
						await expect
							.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width))
							.toBeLessThan(before.width - 15);
						const shrunk = (await sheet.boundingBox())!;
						phase = 'expand sheet back toward its prior size';
						markPointerTarget(
							player,
							'expand sheet',
							before.x + before.width - 4,
							before.y + before.height - 4,
							shrunk.x + shrunk.width - 4,
							shrunk.y + shrunk.height - 4
						);
						await player.mouse.move(shrunk.x + shrunk.width - 4, shrunk.y + shrunk.height - 4);
						await player.mouse.down();
						await player.mouse.move(before.x + before.width - 4, before.y + before.height - 4, {
							steps: 4
						});
						await player.mouse.up();
						phase = 'assert resize can expand without exceeding the viewport';
						await expect
							.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width))
							.toBeGreaterThan(shrunk.width + 15);
						await assertAboveAudioFooter(player, sheet);
					},
					() => phase
				);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player linked sheet survives map navigation and focuses one instance @routine-gate', async ({
		browser
	}, testInfo) => {
		let fixture: LocalAuthenticatedFixture | undefined;
		try {
			const prepared = await startLinkedSheetScenario(browser, testInfo);
			fixture = prepared.fixture;
			const { player, sheet } = prepared;
			await test.step('navigate between map and library while the same sheet stays open', () => {
				let phase = 'open library tab';
				return diagnoseOnFailure(
					testInfo,
					player,
					'sheet persists across workspace navigation',
					sheetPanelDiagnosticSelectors,
					async () => {
						await player.getByRole('button', { name: 'Mídias', exact: true }).click();
						await expect(player.locator('.library-view')).toBeVisible();
						phase = 'assert sheet remains during library tab';
						await expect(sheet).toBeVisible();
						await expect(player.locator('.sheet-backdrop .sheet')).toHaveCount(1);
						phase = 'return to map';
						await player.getByRole('button', { name: 'Mesa', exact: true }).click();
						await expect(player.locator('canvas').first()).toBeVisible();
						phase = 'assert sheet and identity persist';
						await expect(sheet).toBeVisible();
						await expect(sheet.locator('header h2')).toHaveText('Ficha persistida E2E');
						await expect(sheet).toHaveAttribute('data-instance-marker', 'same-sheet-instance');
						await expect(player.locator('.sheet-backdrop .sheet')).toHaveCount(1);
						await assertAboveAudioFooter(player, sheet);
					},
					() => phase
				);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player sheet can dock, float again and close explicitly', async ({ browser }, testInfo) => {
		let fixture: LocalAuthenticatedFixture | undefined;
		try {
			const prepared = await prepareSavedPlayerSheet(browser, testInfo);
			fixture = prepared.fixture;
			const { player, sheet } = prepared;
			await test.step('dock and restore floating mode', () => {
				let phase = 'dock sheet';
				return diagnoseOnFailure(
					testInfo,
					player,
					'dock and restore linked sheet',
					sheetPanelDiagnosticSelectors,
					async () => {
						await expect(player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
						await sheet.getByRole('button', { name: 'Fixar ficha' }).click();
						const dockedSheet = player.locator('.sheet-backdrop.docked .sheet');
						await expect(dockedSheet).toBeVisible();
						await expect(dockedSheet.locator('.sheet-mode-status')).toHaveText('Acoplada');
						await assertAboveAudioFooter(player, dockedSheet);
						phase = 'restore floating mode';
						await dockedSheet.getByRole('button', { name: 'Flutuar ficha' }).click();
						await expect(player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
						phase = 'close sheet explicitly';
						await sheet.getByRole('button', { name: 'Fechar ficha' }).click();
						await expect(player.locator('.sheet-backdrop.floating .sheet')).toHaveCount(0);
						await expect(player.locator('.sheet-backdrop.embedded .sheet')).toBeVisible();
					},
					() => phase
				);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('player opens an isolated authorized auxiliary sheet window @routine-gate', async ({
		browser
	}, testInfo) => {
		let fixture: LocalAuthenticatedFixture | undefined;
		let standalone: Page | undefined;
		try {
			const prepared = await prepareSavedPlayerSheet(browser, testInfo);
			fixture = prepared.fixture;
			const { player, sheet } = prepared;
			await test.step('open and verify isolated auxiliary popup', () => {
				let phase = 'open popup from the user gesture';
				return diagnoseOnFailure(
					testInfo,
					player,
					'auxiliary sheet popup',
					sheetPanelDiagnosticSelectors,
					async () => {
						const [popup] = await Promise.all([
							player.waitForEvent('popup'),
							sheet.getByRole('button', { name: 'Destacar ficha em janela auxiliar' }).click()
						]);
						standalone = popup;
						phase = 'assert isolated route and authorization-safe URL';
						await expect(popup).toHaveURL(/\/sheet\?campaign=[^&]+&character=[^&]+/);
						expect(popup.url()).toContain('auxiliary=1');
						expect(popup.url()).not.toMatch(/access_token|token|jwt/i);
						expect(await popup.evaluate(() => window.opener === null)).toBe(true);
						expect(await popup.evaluate(() => window.name)).toContain('maismorras-sheet-');
						await expect(popup.locator('.sheet-backdrop.standalone .sheet header h2')).toHaveText(
							'Ficha persistida E2E'
						);
						await expect(
							popup.locator('canvas, .app-header, .floating-chat, .actor-drawer')
						).toHaveCount(0);
						await popup.close();
						standalone = undefined;
					},
					() => phase
				);
			});
		} finally {
			await standalone?.close();
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
		const routineTag = role === 'player' && quantity === 1 ? ' @routine-gate' : '';
		test(`${role} quick roll ${quantity}d${sides} matches authoritative chat and visual result${routineTag}`, async ({
			browser
		}) => {
			let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
			try {
				await test.step('prepare the authenticated local table', async () => {
					fixture = await createLocalAuthenticatedFixture(browser);
				});
				const page = role === 'gm' ? fixture!.gm : fixture!.player;
				const receivingParticipant = role === 'player' && quantity === 1 ? fixture!.gm : null;
				// Keep the visual result assertion deterministic under headless Chromium's automatic WebGL detection.
				await page.evaluate(() => localStorage.setItem('maismorras:dice-renderer-mode', '2d'));
				if (receivingParticipant) {
					await receivingParticipant.evaluate(() =>
						localStorage.setItem('maismorras:dice-renderer-mode', '2d')
					);
				}
				const formula = `${quantity}d${sides}`;
				let authoritativeResult: { expressao: string; dados: number[]; total: number } | null =
					null;
				let authoritativeEventId = '';
				await test.step('submit the quick roll and verify the authoritative server result', async () => {
					if (receivingParticipant) {
						await openMap(receivingParticipant, fixture!.campaignId, fixture!.sceneId);
						await receivingParticipant
							.getByLabel('Modo de renderização dos dados')
							.selectOption('2d');
						const receiverChat = receivingParticipant.locator('.floating-chat');
						if (await receiverChat.evaluate((node) => node.classList.contains('closed'))) {
							await receiverChat.locator('.chat-toggle').click();
						}
						await expect(receiverChat.locator('.chat-body')).toBeVisible();
					}
					await openMap(page, fixture!.campaignId, fixture!.sceneId);
					await page.getByLabel('Modo de renderização dos dados').selectOption('2d');
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
					if (receivingParticipant) {
						const receiverRoll = receivingParticipant.locator(
							`.floating-chat [data-event-id="${authoritativeEventId}"]`
						);
						await expect(receiverRoll).toBeVisible();
						await expect(receiverRoll.locator('.roll small')).toContainText(formula);
						await expect(receiverRoll.locator('.roll b')).toHaveText(
							String(authoritativeResult!.total)
						);
						await expect(receiverRoll.locator('.roll em')).toContainText(
							authoritativeResult!.dados.join(', ')
						);
					}
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

	test('GM selects a player sheet in the tab and can still create a GM sheet', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare and show a player sheet directly in the tab', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
				await fixture.createCharacter(fixture.playerUserId, { name: 'Ficha alvo jogador E2E' });
				await fixture.gm.goto(`/?campaign=${fixture.campaignId}&scene=${fixture.sceneId}`);
				await fixture.gm.getByRole('button', { name: 'Fichas', exact: true }).click();
				await expect(fixture.gm.getByLabel('Personagem da campanha')).toBeVisible();
				await expect(fixture.gm.locator('.sheet-backdrop.embedded .sheet header h2')).toHaveText(
					'Ficha alvo jogador E2E'
				);
			});
			const gm = fixture!.gm;
			const sheet = gm.locator('.sheet-backdrop.embedded .sheet');
			await test.step('keep the existing create flow for a participant without a sheet', async () => {
				await gm.getByRole('button', { name: 'Mesa', exact: true }).click();
				await gm.getByRole('button', { name: 'Fichas', exact: true }).click();
				await gm.getByRole('button', { name: 'Voltar ao elenco' }).click();
				await gm.getByRole('button', { name: 'Criar ficha' }).click();
				await expect(sheet.locator('header h2')).toHaveText('Novo personagem');
				await expect(gm.locator('.sheet-backdrop.embedded .sheet')).toHaveCount(1);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('short rest forwards zero and multiple Hit Dice and synchronizes sheet and token HP', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			fixture = await createLocalAuthenticatedFixture(browser);
			const character = await fixture.createCharacter(fixture.playerUserId, {
				name: 'Descanso curto E2E',
				class: 'fighter',
				level: 3,
				hitDice: '1d8',
				hitDiceSpent: 0,
				hitPointsCurrent: 5,
				hitPointsMax: 20
			});
			const tokenId = await fixture.createCharacterToken(character.id);
			const page = fixture.player;
			await page.goto(`/sheet?campaign=${fixture.campaignId}&character=${character.id}`);
			const sheet = page.locator('.sheet');
			await expect(sheet).toBeVisible({ timeout: 20_000 });
			await sheet.getByRole('button', { name: 'Combate', exact: true }).click();
			const countSelector = sheet.getByTestId('short-rest-hit-dice-count');
			const currentHP = sheet
				.locator('.combat label')
				.filter({ hasText: 'PV atuais' })
				.locator('input');

			await test.step('selecting zero sends an explicit zero and spends or rolls no Hit Dice', async () => {
				await countSelector.selectOption('0');
				const responsePromise = page.waitForResponse((response) => {
					const url = new URL(response.url());
					return (
						response.request().method() === 'POST' &&
						url.pathname ===
							`/api/v1/campaigns/${fixture!.campaignId}/characters/${character.id}/rest`
					);
				});
				await sheet.getByRole('button', { name: 'Descanso curto', exact: true }).click();
				const response = await responsePromise;
				expect(response.status()).toBe(200);
				expect(response.request().postDataJSON()).toEqual({ kind: 'short', hitDiceCount: 0 });
				const result = (await response.json()) as {
					dados?: number[];
					sheet: { hitPointsCurrent: number; hitDiceSpent: number };
				};
				expect(result.dados ?? []).toEqual([]);
				expect(result.sheet.hitDiceSpent).toBe(0);
				expect(result.sheet.hitPointsCurrent).toBe(5);
				await expect(currentHP).toHaveValue('5');
				await expect(sheet.locator('.short-rest-hit-dice small')).toContainText(
					'3 disponíveis de 3'
				);
			});

			let healedHP = 0;
			await test.step('selecting two sends two and visibly updates sheet and token HP', async () => {
				await countSelector.selectOption('2');
				const responsePromise = page.waitForResponse((response) => {
					const url = new URL(response.url());
					return (
						response.request().method() === 'POST' &&
						url.pathname ===
							`/api/v1/campaigns/${fixture!.campaignId}/characters/${character.id}/rest`
					);
				});
				await sheet.getByRole('button', { name: 'Descanso curto', exact: true }).click();
				const response = await responsePromise;
				expect(response.status()).toBe(200);
				expect(response.request().postDataJSON()).toEqual({ kind: 'short', hitDiceCount: 2 });
				const result = (await response.json()) as {
					dados?: number[];
					sheet: { hitPointsCurrent: number; hitDiceSpent: number };
				};
				expect(result.dados).toHaveLength(2);
				expect(result.sheet.hitDiceSpent).toBe(2);
				healedHP = result.sheet.hitPointsCurrent;
				expect(healedHP).toBeGreaterThan(5);
				await expect(currentHP).toHaveValue(String(healedHP));
				await expect(sheet.locator('.short-rest-hit-dice small')).toContainText(
					'1 disponíveis de 3'
				);

				const tokenResponse = await fixture!.playerApi.get(
					`/api/v1/scenes/${fixture!.sceneId}/tokens/${tokenId}`
				);
				expect(tokenResponse.status()).toBe(200);
				expect(((await tokenResponse.json()) as { hpCurrent: number }).hpCurrent).toBe(healedHP);

				await openMap(page, fixture!.campaignId, fixture!.sceneId, tokenId);
				await selectTokenAtDefaultPosition(page);
				const summary = page.getByRole('region', { name: /Ficha resumida do personagem/i });
				await expect(summary.getByLabel(/PV atuais/)).toHaveValue(String(healedHP));
			});
		} finally {
			await fixture?.close();
		}
	});
});

test('bounded diagnostic failure creates a sanitized artifact attachment', async ({
	browser
}, testInfo) => {
	const page = await browser.newPage();
	try {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('about:blank');
		let operationFailed = false;
		try {
			await diagnoseOnFailure(
				testInfo,
				page,
				'controlled diagnostic failure at 390x844',
				[
					'body',
					{ selector: '.table-tools .tool-group', label: 'interactive tool group' },
					{
						selector: '.table-tools-gm',
						label: 'hidden overlay host anchor (not clickable)'
					}
				],
				async () => {
					try {
						await page
							.getByRole('button', { name: 'absent diagnostic target' })
							.click({ timeout: 100 });
					} catch {
						const timeout = new Error('Bearer DIAGNOSTIC_SECRET_CANARY');
						timeout.name = 'TimeoutError';
						throw timeout;
					}
				},
				() => 'controlled bounded click timeout'
			);
		} catch {
			operationFailed = true;
		}

		expect(operationFailed).toBe(true);
		const attachment = testInfo.attachments.find(
			(item) => item.name === 'sanitized-ui-failure-diagnostics.json'
		);
		expect(attachment?.path).toBeTruthy();
		const attachmentPath = resolve(attachment!.path!);
		const outputRelative = relative(resolve(testInfo.outputDir), attachmentPath);
		expect(outputRelative).not.toMatch(/^\.\.(?:[\\/]|$)/);
		const diagnostic = readFileSync(attachmentPath, 'utf8');
		expect(diagnostic).toContain('controlled bounded click timeout');
		expect(diagnostic).toContain('"failureType":"TimeoutError"');
		expect(diagnostic).toContain('interactive tool group: .table-tools .tool-group');
		expect(diagnostic).toContain('hidden overlay host anchor (not clickable): .table-tools-gm');
		expect(diagnostic).not.toContain('DIAGNOSTIC_SECRET_CANARY');
	} finally {
		await page.close();
	}
});

async function openMap(page: Page, campaignId: string, sceneId: string, expectedTokenId?: string) {
	const sceneResponse = expectedTokenId
		? page.waitForResponse(
				(response) =>
					new URL(response.url()).pathname === `/api/v1/scenes/${sceneId}` &&
					response.request().method() === 'GET'
			)
		: null;
	await page.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
	await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('.floating-chat')).toBeVisible();
	if (sceneResponse) {
		const response = await sceneResponse;
		expect(response.ok()).toBeTruthy();
		const scene = (await response.json()) as { tokens: Array<{ id: string }> };
		expect(scene.tokens.some((token) => token.id === expectedTokenId)).toBe(true);
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				})
		);
	}
}

type LocalAuthenticatedFixture = Awaited<ReturnType<typeof createLocalAuthenticatedFixture>>;

async function openDamageBuilderFixture(browser: Browser) {
	const fixture = await createLocalAuthenticatedFixture(browser);
	try {
		const character = await fixture.createCharacter(fixture.playerUserId, {
			name: 'Construtor de dano E2E',
			inventory: [
				{
					entryId: 'damage-builder-e2e',
					name: 'Machado de teste',
					quantity: 1,
					equipped: true,
					rules: {
						category: 'weapon',
						damage: '1d4',
						attackAbility: 'strength',
						attackType: 'melee',
						proficient: true,
						attackProfiles: [
							{
								id: 'alternate-damage-e2e',
								name: 'Golpe alternativo',
								description: '',
								attackAbility: 'strength',
								damage: '1d6',
								attackBonus: 0,
								damageBonus: 0,
								greatWeaponFighting: false
							}
						]
					}
				}
			]
		});
		const tokenId = await fixture.createCharacterToken(character.id);
		await fixture.player.evaluate(() =>
			localStorage.setItem('maismorras:dice-renderer-mode', '2d')
		);
		const page = fixture.player;
		await openMap(page, fixture.campaignId, fixture.sceneId, tokenId);
		await page.getByLabel('Modo de renderização dos dados').selectOption('2d');
		await selectTokenAtDefaultPosition(page);
		await page.getByRole('button', { name: 'Abrir ficha vinculada' }).click();
		const sheet = page.locator('.sheet-backdrop.floating .sheet');
		await expect(sheet).toBeVisible();
		await sheet.getByRole('button', { name: 'Combate', exact: true }).click();
		const weapon = sheet.locator('.weapon-combat-card').filter({ hasText: 'Machado de teste' });
		await weapon.getByRole('button', { name: 'Machado de teste' }).click();
		const baseBuilder = weapon.locator('fieldset.damage-builder').first();
		const profile = weapon.locator('.weapon-profile');
		const chooseDie = async (builder: Locator, sides: number) => {
			const picker = builder.locator('.die-type-picker').first();
			const summary = picker.locator('summary');
			await summary.click();
			const option = picker.locator('.die-type-options button').filter({
				hasText: new RegExp(`^d${sides}$`)
			});
			await option.click();
		};
		const saveAndAssertSuccess = async () => {
			await sheet.getByRole('button', { name: 'Salvar ficha' }).click();
			await expect(sheet.locator('footer')).toContainText('Ficha salva.');
		};
		const readSavedDamage = async () => {
			const response = await fixture.playerApi.get(
				`/api/v1/campaigns/${fixture.campaignId}/character`
			);
			expect(response.ok()).toBeTruthy();
			const result = (await response.json()) as {
				sheet: {
					inventory: Array<{
						entryId: string;
						rules: { damage: string; attackProfiles: Array<{ id: string; damage: string }> };
					}>;
				};
			};
			return result.sheet.inventory.find((item) => item.entryId === 'damage-builder-e2e')!.rules;
		};
		const reopenSavedSheet = async () => {
			await sheet.getByRole('button', { name: 'Fechar ficha' }).click();
			await expect(sheet).toHaveCount(0);
			await page.getByRole('button', { name: 'Fichas', exact: true }).click();
			const embeddedSheet = page.locator('.sheet-backdrop.embedded .sheet');
			await expect(embeddedSheet).toBeVisible();
			await embeddedSheet.getByRole('button', { name: 'Abrir como painel' }).click();
			await expect(sheet).toBeVisible();
			await sheet.getByRole('button', { name: 'Combate', exact: true }).click();
			await weapon.getByRole('button', { name: 'Machado de teste' }).click();
		};
		return {
			fixture,
			page,
			sheet,
			weapon,
			baseBuilder,
			profile,
			chooseDie,
			saveAndAssertSuccess,
			readSavedDamage,
			reopenSavedSheet
		};
	} catch (error) {
		await fixture.close();
		throw error;
	}
}

async function prepareSavedPlayerSheet(browser: Browser, testInfo: TestInfo) {
	const fixture = await createLocalAuthenticatedFixture(browser);
	try {
		await test.step('prepare and open a saved player sheet', () => {
			let phase = 'create player character and token';
			return diagnoseOnFailure(
				testInfo,
				fixture.player,
				'prepare and open saved player sheet',
				[
					'.workspace-tabs',
					'.sheets-view',
					'.sheet-backdrop',
					'.sheet-backdrop .sheet',
					'.sheet-backdrop .sheet header',
					'.audio-channels'
				],
				async () => {
					const character = await fixture.createCharacter(fixture.playerUserId, {
						name: 'Ficha persistida E2E',
						hitPointsCurrent: 10,
						hitPointsMax: 10
					});
					await fixture.createCharacterToken(character.id);
					phase = 'open sheet list';
					await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
					await fixture.player.getByRole('button', { name: 'Fichas', exact: true }).click();
					await expect(fixture.player.locator('.sheets-view')).toBeVisible();
					phase = 'open linked sheet';
					const sheet = fixture.player.locator('.sheet-backdrop.embedded .sheet');
					await expect(sheet).toBeVisible({ timeout: 20_000 });
					phase = 'save player sheet';
					await fixture.player.getByPlaceholder('Nome do personagem').fill('Ficha persistida E2E');
					await sheet.getByRole('button', { name: 'Salvar ficha' }).click();
					await expect
						.poll(async () => {
							const response = await fixture.playerApi.get(
								`/api/v1/campaigns/${fixture.campaignId}/character`
							);
							return ((await response.json()) as { sheet: { name: string } }).sheet.name;
						})
						.toBe('Ficha persistida E2E');
					phase = 'open the floating panel as an alternate sheet view';
					await sheet.getByRole('button', { name: 'Abrir como painel' }).click();
					await expect(fixture.player.locator('.sheet-backdrop.floating .sheet')).toBeVisible();
				},
				() => phase
			);
		});
		return {
			fixture,
			player: fixture.player,
			sheet: fixture.player.locator('.sheet-backdrop.floating .sheet')
		};
	} catch (error) {
		await fixture.close();
		throw error;
	}
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

function classifyBrowserError(message: string): string {
	if (/ResizeObserver loop/i.test(message)) return 'resize-observer-loop';
	if (/_cancelResize is not a function/i.test(message)) return 'pixi-initialization-cleanup-race';
	if (/failed to fetch dynamically imported module/i.test(message)) return 'dynamic-import-failure';
	if (/loading chunk|chunkloaderror/i.test(message)) return 'chunk-load-failure';
	return 'unclassified-browser-error';
}

async function selectTokenAtDefaultPosition(page: Page, requireUncoveredTarget = false) {
	const canvas = page.locator('canvas').first();
	await expect(canvas).toBeVisible();
	if (requireUncoveredTarget) {
		const targetIsCanvas = await page.evaluate(() => {
			const canvasNode = document.querySelector('canvas');
			if (!canvasNode) return false;
			const rect = canvasNode.getBoundingClientRect();
			const target = document.elementFromPoint(rect.left + 105, rect.top + 105);
			return target === canvasNode || Boolean(target && canvasNode.contains(target));
		});
		expect(targetIsCanvas, 'map test click must land on an uncovered canvas location').toBe(true);
	}
	const chatCoversTarget = await page.evaluate(() => {
		const canvasNode = document.querySelector('canvas');
		if (!canvasNode) return false;
		const rect = canvasNode.getBoundingClientRect();
		return Boolean(
			document.elementFromPoint(rect.left + 105, rect.top + 105)?.closest('.floating-chat')
		);
	});
	const chat = page.locator('.floating-chat');
	const restoreChat =
		chatCoversTarget && !(await chat.evaluate((node) => node.classList.contains('closed')));
	if (restoreChat) await chat.locator('.chat-toggle').click();
	if (requireUncoveredTarget) {
		const box = (await canvas.boundingBox())!;
		await page.mouse.click(box.x + 105, box.y + 105);
	} else {
		await canvas.click({ position: { x: 105, y: 105 } });
	}
	if (restoreChat) {
		await expect(page.locator('.token-inspector')).toBeVisible({ timeout: 10_000 });
		await chat.locator('.chat-toggle').click();
	}
	await expect(page.locator('.token-inspector')).toBeVisible({ timeout: 10_000 });
}

async function openOwnCharacterPopup(
	fixture: LocalAuthenticatedFixture,
	characterId: string
): Promise<Page> {
	await test.step('select own token on an uncovered map point', async () => {
		await openMap(fixture.player, fixture.campaignId, fixture.sceneId);
		await movePanelAwayFromMapTarget(fixture.player, '.floating-chat', '.panel-grip');
		await selectTokenAtDefaultPosition(fixture.player, true);
	});
	const auxiliaryButton = fixture.player.getByRole('button', {
		name: 'Destacar ficha',
		exact: true
	});
	const popup =
		await test.step('trigger and observe the auxiliary popup from the own-token action', async () => {
			await expect(auxiliaryButton).toBeVisible();
			const popupEvent = fixture.player.waitForEvent('popup', { timeout: 5_000 }).catch(() => null);
			await auxiliaryButton.click({ timeout: 5_000 });
			const openedPopup = await popupEvent;
			if (!openedPopup) {
				const fallbackVisible = (await fixture.player.getByRole('alert').count()) > 0;
				throw new Error(
					`Auxiliary popup was not observed; browser-block feedback visible=${fallbackVisible}.`
				);
			}
			return openedPopup;
		});
	await test.step('load authorized isolated sheet in popup', async () => {
		await expect(popup.locator('.sheet')).toBeVisible({ timeout: 20_000 });
	});
	await test.step('verify popup route, authorization identity, and secret-free URL', async () => {
		expect(new URL(popup.url()).pathname).toBe('/sheet');
		expect(popup.url()).toContain(`campaign=${fixture.campaignId}`);
		expect(popup.url()).toContain(`character=${characterId}`);
		expect(popup.url()).toContain('auxiliary=1');
		expect(popup.url()).not.toMatch(/access_token|refresh_token|authorization|jwt/i);
	});
	const popupState = await test.step('check safe popup window features', () =>
		popup.evaluate(() => ({
			name: window.name,
			openerIsNull: window.opener === null,
			width: window.outerWidth,
			height: window.outerHeight
		})));
	expect(popupState.name).toContain(`maismorras-sheet-${fixture.campaignId}-${characterId}`);
	expect(popupState.openerIsNull).toBe(true);
	expect(popupState.width).toBeGreaterThan(600);
	expect(popupState.height).toBeGreaterThan(500);
	return popup;
}

async function assertPopupUsesItsViewport(
	popup: Page,
	testInfo: TestInfo,
	width: number,
	height: number
) {
	await diagnoseOnFailure(
		testInfo,
		popup,
		`standalone sheet viewport ${width}x${height}`,
		[
			{ label: 'sheet backdrop', selector: '.sheet-backdrop' },
			{ label: 'standalone sheet panel', selector: '.sheet' },
			{ label: 'sheet header', selector: '.sheet > header' },
			{ label: 'sheet tabs', selector: '.sheet-tabs' },
			{ label: 'sheet body', selector: '.sheet-body' },
			{ label: 'sheet footer', selector: '.sheet > footer' }
		],
		async () => {
			await popup.setViewportSize({ width, height });
			await expect(popup.locator('.sheet-tabs')).toBeVisible();
			await expect(popup.locator('.sheet-body')).toBeVisible();
			await expect
				.poll(
					() =>
						popup.locator('.sheet').evaluate((node) => {
							const rect = node.getBoundingClientRect();
							return { width: Math.round(rect.width), height: Math.round(rect.height) };
						}),
					{ timeout: remainingTestBudget(testInfo) }
				)
				.toEqual({ width, height });
		},
		() => `resize to ${width}x${height} and await exact panel bounds`
	);
	const layout = await popup.locator('.sheet').evaluate((node) => {
		const body = node.querySelector<HTMLElement>('.sheet-body')!;
		const header = node.querySelector<HTMLElement>('header')!;
		const tabs = node.querySelector<HTMLElement>('.sheet-tabs')!;
		const footer = node.querySelector<HTMLElement>('footer')!;
		const sheetStyle = getComputedStyle(node);
		const bodyStyle = getComputedStyle(body);
		const verticalScrollers = [node, ...node.querySelectorAll<HTMLElement>('*')]
			.filter((element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return (
					rect.width > 0 &&
					rect.height > 0 &&
					['auto', 'scroll'].includes(style.overflowY) &&
					element.scrollHeight > element.clientHeight + 1
				);
			})
			.map((element) => (element === body ? '.sheet-body' : element.tagName.toLowerCase()));
		return {
			viewport: { width: window.innerWidth, height: window.innerHeight },
			sheet: { width: node.clientWidth, height: node.clientHeight },
			sheetOverflowY: sheetStyle.overflowY,
			bodyOverflowY: bodyStyle.overflowY,
			verticalScrollers,
			fixedRegionsVisible: [header, tabs, footer].every((element) => {
				const rect = element.getBoundingClientRect();
				return rect.top >= 0 && rect.bottom <= window.innerHeight;
			})
		};
	});
	expect(layout.viewport).toEqual({ width, height });
	expect(layout.sheet).toEqual({ width, height });
	expect(layout.sheetOverflowY).toBe('hidden');
	expect(layout.bodyOverflowY).toBe('auto');
	expect(layout.verticalScrollers).toEqual(['.sheet-body']);
	expect(layout.fixedRegionsVisible).toBe(true);
	await expect(popup.locator('.sheet-tabs')).toBeVisible();
	await expect(
		popup.getByRole('button', { name: /Salvar ficha|Save character sheet/ })
	).toBeVisible();
}

async function movePanelAwayFromMapTarget(
	page: Page,
	panelSelector: string,
	handleSelector: string
) {
	const canvas = page.locator('canvas').first();
	const canvasBox = (await canvas.boundingBox())!;
	const targetX = canvasBox.x + 105;
	const targetY = canvasBox.y + 105;
	const panel = page.locator(panelSelector).first();
	const box = await panel.boundingBox();
	if (
		!box ||
		targetX < box.x ||
		targetX > box.x + box.width ||
		targetY < box.y ||
		targetY > box.y + box.height
	)
		return;
	const viewportWidth = page.viewportSize()!.width;
	const rightCandidate = Math.min(targetX + 24, viewportWidth - box.width - 16);
	const destinationLeft =
		rightCandidate > targetX ? rightCandidate : Math.max(8, targetX - box.width - 24);
	if (targetX >= destinationLeft && targetX <= destinationLeft + box.width) {
		throw new Error(
			'The panel cannot be moved away from the map test target within this viewport.'
		);
	}
	await dragPanel(page, panel.locator(handleSelector).first(), destinationLeft - box.x, 0);
	await expect
		.poll(async () => {
			const next = await panel.boundingBox();
			return (
				!next ||
				targetX < next.x ||
				targetX > next.x + next.width ||
				targetY < next.y ||
				targetY > next.y + next.height
			);
		})
		.toBe(true);
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
	markPointerTarget(page, 'drag panel', startX + deltaX, startY + deltaY, startX, startY);
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
	await page.mouse.up();
}

async function diagnoseOnFailure<T>(
	testInfo: TestInfo,
	page: Page,
	step: string,
	selectors: DiagnosticSelector[],
	operation: () => Promise<T>,
	currentPhase: () => string = () => 'operation'
): Promise<T> {
	const startedAt = new Date().toISOString();
	const started = performance.now();
	await completeWithinBudget(observePointer(page), 250);
	try {
		return await operation();
	} catch (error) {
		try {
			const browser = await completeWithinBudget(
				page.evaluate(
					(targets) => {
						const readRect = (element: Element) => {
							const rect = element.getBoundingClientRect();
							return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
						};
						const elements = targets.map(({ selector, label }) => {
							const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 4);
							const metrics = nodes.map((node) => {
								const style = getComputedStyle(node);
								const rect = node.getBoundingClientRect();
								return {
									visible:
										style.display !== 'none' &&
										style.visibility !== 'hidden' &&
										rect.width > 0 &&
										rect.height > 0,
									box: readRect(node),
									style: {
										display: style.display,
										visibility: style.visibility,
										opacity: style.opacity,
										position: style.position,
										zIndex: style.zIndex,
										width: style.width,
										minWidth: style.minWidth,
										maxWidth: style.maxWidth,
										resize: style.resize,
										safeMaxWidth: (node as HTMLElement).style.getPropertyValue(
											'--mm-panel-safe-max-width'
										)
									},
									state: {
										expanded: node.getAttribute('aria-expanded'),
										pressed: node.getAttribute('aria-pressed'),
										disabled: node instanceof HTMLButtonElement ? node.disabled : false,
										ariaDisabled: node.getAttribute('aria-disabled')
									}
								};
							});
							return {
								selector: `${label}: ${selector}`,
								count: document.querySelectorAll(selector).length,
								visibleCount: metrics.filter((metric) => metric.visible).length,
								boxes: metrics.map((metric) => metric.box),
								styles: metrics.map((metric) => metric.style),
								states: metrics.map((metric) => metric.state)
							};
						});
						const tabs = Array.from(
							document.querySelectorAll('.workspace-tabs button, [role="tab"]')
						);
						const activeTabIndex = tabs.findIndex(
							(tab) =>
								tab.matches(
									'[aria-current="page"], [aria-selected="true"], [aria-pressed="true"]'
								) ||
								tab.classList.contains('active') ||
								tab.classList.contains('selected')
						);
						const pointer = (
							window as Window & {
								__safeE2ePointer?: { x: number; y: number };
							}
						).__safeE2ePointer;
						return {
							activeTabIndex: activeTabIndex < 0 ? null : activeTabIndex,
							scroll: {
								x: window.scrollX,
								y: window.scrollY,
								viewportWidth: window.innerWidth,
								viewportHeight: window.innerHeight,
								documentWidth: document.documentElement.scrollWidth,
								documentHeight: document.documentElement.scrollHeight
							},
							pointer: pointer ?? null,
							elements
						};
					},
					selectors.map((target) =>
						typeof target === 'string' ? { selector: target, label: target } : target
					)
				),
				DIAGNOSTIC_SNAPSHOT_TIMEOUT_MS
			);
			const target = pointerTargets.get(page);
			const record = sanitizeSafeE2EDiagnostic({
				test: testInfo.title,
				step: `${step}: ${currentPhase()}`,
				attempt: testInfo.retry + 1,
				startedAt,
				failedAt: new Date().toISOString(),
				durationMs: performance.now() - started,
				failureType:
					error instanceof Error && error.name === 'TimeoutError' ? 'TimeoutError' : 'Error',
				httpStatus: null,
				url: page.url(),
				viewport: page.viewportSize(),
				activeTabIndex: browser?.activeTabIndex ?? null,
				scroll: browser?.scroll ?? {
					x: 0,
					y: 0,
					viewportWidth: page.viewportSize()?.width ?? 0,
					viewportHeight: page.viewportSize()?.height ?? 0,
					documentWidth: page.viewportSize()?.width ?? 0,
					documentHeight: page.viewportSize()?.height ?? 0
				},
				pointer: {
					x: browser?.pointer?.x ?? null,
					y: browser?.pointer?.y ?? null,
					action: target?.action ?? null,
					startX: target?.x ?? null,
					startY: target?.y ?? null,
					targetX: target?.targetX ?? null,
					targetY: target?.targetY ?? null
				},
				elements: browser?.elements ?? []
			});
			const body = JSON.stringify(record);
			const diagnosticPath = testInfo.outputPath('sanitized-ui-failure-diagnostics.json');
			mkdirSync(dirname(diagnosticPath), { recursive: true });
			writeFileSync(diagnosticPath, body, 'utf8');
			await completeWithinBudget(
				testInfo.attach('sanitized-ui-failure-diagnostics.json', {
					path: diagnosticPath,
					contentType: 'application/json'
				}),
				DIAGNOSTIC_SNAPSHOT_TIMEOUT_MS
			);
		} catch {
			// Diagnostic collection must never replace the original test failure.
		}
		throw error;
	}
}

async function completeWithinBudget<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), timeoutMs);
			})
		]);
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function menuWaitBudget(testInfo: TestInfo): number {
	const elapsed = performance.now() - (testStartedAt.get(testInfo) ?? performance.now());
	const remaining = testInfo.timeout - elapsed - DIAGNOSTIC_COMPLETION_RESERVE_MS;
	if (remaining <= 0) throw diagnosticTimeout('Reserved time for safe diagnostics reached.');
	return Math.max(100, Math.min(MENU_OPERATION_TIMEOUT_MS, remaining));
}

function remainingTestBudget(testInfo: TestInfo): number {
	const elapsed = performance.now() - (testStartedAt.get(testInfo) ?? performance.now());
	const remaining = testInfo.timeout - elapsed - DIAGNOSTIC_COMPLETION_RESERVE_MS;
	if (remaining <= 0) throw diagnosticTimeout('Reserved time for safe diagnostics reached.');
	return Math.max(100, remaining);
}

function diagnosticTimeout(message: string): Error {
	const timeout = new Error(message);
	timeout.name = 'TimeoutError';
	return timeout;
}

async function observePointer(page: Page) {
	if (observedPointers.has(page)) return;
	observedPointers.add(page);
	await page.evaluate(() => {
		const target = window as Window & {
			__safeE2ePointer?: { x: number; y: number };
			__safeE2ePointerListener?: boolean;
		};
		if (target.__safeE2ePointerListener) return;
		target.__safeE2ePointerListener = true;
		window.addEventListener('pointermove', (event) => {
			target.__safeE2ePointer = { x: event.clientX, y: event.clientY };
		});
	});
}

function markPointerTarget(
	page: Page,
	action: string,
	targetX: number,
	targetY: number,
	x = targetX,
	y = targetY
) {
	pointerTargets.set(page, { action, x, y, targetX, targetY });
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
	const labels = await Promise.all(
		[first, second].map((panel) =>
			panel.evaluate((node) => node.getAttribute('aria-label') || node.className.toString())
		)
	);
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
		.toEqual(
			{ overlaps: false, belowNavigation: true },
			`Panels must remain accessible without overlap: ${labels.join(' / ')}`
		);
}
