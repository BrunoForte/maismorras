import {
	devices,
	expect,
	test,
	type Locator,
	type Request as PlaywrightRequest
} from '@playwright/test';
import {
	createLocalAuthenticatedFixture,
	localStackEnabled,
	apiBase
} from './local-authenticated.helpers';

type GrantRecord = {
	id: string;
	spellEntryId?: string;
	firstLevelSpellEntryId?: string;
	freeCastsRemaining: number;
	freeCastsMax?: number;
	freeCastsMaxOverride?: number;
	freeCastsRecovery?: string;
};

type GrantSheet = {
	speciesSpellGrants: GrantRecord[];
	featSpellGrants: GrantRecord[];
	spellSlots: Array<{ level: number; current: number }>;
};

type SpellCastHttpDiagnostic = {
	method: string;
	route: string;
	bodyKeys: string[];
	spellIndex: number | null;
	slotLevel: number | null;
	freeCast: boolean | null;
	grantIdMatchesExpected: boolean;
	entryIdMatchesExpected: boolean;
	presentationSceneIdPresent: boolean;
	status?: number;
	errorCode?: string;
	requestFailure?: string;
	expectedGrantRemaining?: number;
};

type SafeNetworkDiagnostic = {
	method: string;
	route: string;
	status?: number;
	errorCode?: string;
	requestFailure?: string;
};

function sanitizedRoute(pathname: string) {
	return pathname
		.replace(/\/api\/v1\/campaigns\/[^/]+/g, '/api/v1/campaigns/[campaign]')
		.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/[id]');
}

function sanitizedConsoleMessage(message: string) {
	return message
		.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
		.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(/\beyJ[a-zA-Z0-9._-]+\b/g, '[token]')
		.replace(/(access_token|refresh_token|password|authorization)=?[^&\s]+/gi, '$1=[redacted]')
		.slice(0, 180);
}

function grantRemaining(sheet: GrantSheet, grantId: string) {
	return [...sheet.speciesSpellGrants, ...sheet.featSpellGrants].find(
		(grant) => grant.id === grantId
	)?.freeCastsRemaining;
}

test.describe('authenticated limited spell grants', () => {
	test.skip(!localStackEnabled, 'Requires the isolated local Supabase stack and local API.');

	test('narrator configures duplicate sources; player chooses, spends, rests, and reloads', async ({
		browser
	}) => {
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		const castDiagnostics: SpellCastHttpDiagnostic[] = [];
		const safeNetworkDiagnostics: SafeNetworkDiagnostic[] = [];
		const safeConsoleDiagnostics: string[] = [];
		const pendingErrorCodeReads: Promise<void>[] = [];
		const diagnosticForRequest = new WeakMap<PlaywrightRequest, SpellCastHttpDiagnostic>();
		const safeDiagnosticForRequest = new WeakMap<PlaywrightRequest, SafeNetworkDiagnostic>();
		let capturePlayerPosts = false;
		let expectedGrantId = '';
		let expectedEntryId = '';
		let campaignId = '';
		const apiOrigin = new URL(apiBase).origin;
		const supabaseOrigin = process.env.LOCAL_SUPABASE_URL
			? new URL(process.env.LOCAL_SUPABASE_URL).origin
			: '';
		let gmSheet: Locator | undefined;
		let gmSpellCard: Locator | undefined;
		let speciesConfig: Locator | undefined;
		let featConfig: Locator | undefined;
		let playerSheet: Locator | undefined;
		let playerSpellCard: Locator | undefined;
		let activeStage = 'create authenticated GM/player fixture';
		let lastCompletedStage = 'test started';
		const testStartedAt = Date.now();
		const stageDurations: Array<{ stage: string; elapsedMs: number; completed: boolean }> = [];
		const selectionSnapshots: Array<Record<string, unknown>> = [];
		const stage = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
			activeStage = name;
			const stageStartedAt = Date.now();
			try {
				const result = await test.step(name, action);
				stageDurations.push({
					stage: name,
					elapsedMs: Date.now() - stageStartedAt,
					completed: true
				});
				lastCompletedStage = name;
				activeStage = 'between named stages';
				return result;
			} catch (error) {
				stageDurations.push({
					stage: name,
					elapsedMs: Date.now() - stageStartedAt,
					completed: false
				});
				throw error;
			}
		};
		const attachSafeDiagnostics = (page: import('@playwright/test').Page) => {
			page.on('request', (request) => {
				const url = new URL(request.url());
				if (url.origin !== apiOrigin && url.origin !== supabaseOrigin) return;
				if (!url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/auth/v1/')) return;
				const diagnostic: SafeNetworkDiagnostic = {
					method: request.method(),
					route: sanitizedRoute(url.pathname)
				};
				safeNetworkDiagnostics.push(diagnostic);
				safeDiagnosticForRequest.set(request, diagnostic);
			});
			page.on('requestfailed', (request) => {
				const diagnostic = safeDiagnosticForRequest.get(request);
				if (diagnostic) diagnostic.requestFailure = 'request failed before response';
			});
			page.on('response', (response) => {
				const url = new URL(response.url());
				if (url.origin !== apiOrigin && url.origin !== supabaseOrigin) return;
				if (!url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/auth/v1/')) return;
				const diagnostic = safeDiagnosticForRequest.get(response.request());
				if (!diagnostic) return;
				diagnostic.status = response.status();
				if (response.status() >= 400 && url.pathname.startsWith('/api/v1/')) {
					pendingErrorCodeReads.push(
						response
							.json()
							.then((body: { error?: { code?: unknown } }) => {
								if (typeof body.error?.code === 'string') diagnostic.errorCode = body.error.code;
							})
							.catch(() => undefined)
					);
				}
			});
			page.on('console', (message) => {
				if (message.type() === 'error')
					safeConsoleDiagnostics.push(
						`${message.type()}: ${sanitizedConsoleMessage(message.text())}`
					);
			});
			page.on('pageerror', (error) => {
				safeConsoleDiagnostics.push(`pageerror: ${sanitizedConsoleMessage(error.name)}`);
			});
		};

		try {
			const contextOptions =
				test.info().project.name === 'mobile-chromium'
					? devices['Pixel 5']
					: devices['Desktop Chrome'];
			fixture = await stage('authenticate GM and player; create campaign/scene fixture', () =>
				createLocalAuthenticatedFixture(browser, false, 800, contextOptions, attachSafeDiagnostics)
			);
			const { gm, player, sceneId, gmApi, playerApi } = fixture;
			campaignId = fixture.campaignId;

			player.on('request', (request) => {
				if (!capturePlayerPosts || request.method() !== 'POST') return;
				const url = new URL(request.url());
				if (
					url.origin !== apiOrigin ||
					!url.pathname.startsWith(`/api/v1/campaigns/${campaignId}/`)
				)
					return;

				let body: Record<string, unknown> = {};
				try {
					const parsed = request.postDataJSON();
					if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
						body = parsed as Record<string, unknown>;
				} catch {
					// The diagnostic intentionally records only allow-listed fields.
				}
				const diagnostic: SpellCastHttpDiagnostic = {
					method: request.method(),
					route: url.pathname.replace(campaignId, '[campaign]'),
					bodyKeys: Object.keys(body).sort(),
					spellIndex: typeof body.spellIndex === 'number' ? body.spellIndex : null,
					slotLevel: typeof body.slotLevel === 'number' ? body.slotLevel : null,
					freeCast: typeof body.freeCast === 'boolean' ? body.freeCast : null,
					grantIdMatchesExpected: body.grantId === expectedGrantId,
					entryIdMatchesExpected: body.entryId === expectedEntryId,
					presentationSceneIdPresent: typeof body.presentationSceneId === 'string'
				};
				castDiagnostics.push(diagnostic);
				diagnosticForRequest.set(request, diagnostic);
			});
			player.on('requestfailed', (request) => {
				const diagnostic = diagnosticForRequest.get(request);
				if (diagnostic) diagnostic.requestFailure = request.failure()?.errorText?.split(':')[0];
			});

			const catalogResponse = await stage('load spell catalog for synthetic test character', () =>
				gmApi.get(`/api/v1/campaigns/${campaignId}/compendium`)
			);
			expect(catalogResponse.status()).toBe(200);
			const catalog = (await catalogResponse.json()) as {
				entries: Array<{ id: string; entryType: string; rules: Record<string, unknown> }>;
			};
			const entry = (ruleId: string) =>
				catalog.entries.find(
					(candidate) => candidate.entryType === 'spell' && candidate.rules.id === ruleId
				);
			const detectMagic = entry('detect-magic');
			const fireBolt = entry('fire-bolt');
			const light = entry('light');
			expect(detectMagic).toBeTruthy();
			expect(fireBolt).toBeTruthy();
			expect(light).toBeTruthy();

			const character = await stage(
				'create synthetic character with duplicate Detect Magic grants',
				() =>
					fixture!.createCharacter(fixture!.playerUserId, {
						name: 'Usos de magia de Alto Elfo E2E',
						class: 'Mago',
						level: 5,
						species: 'Elf',
						speciesLineage: 'High Elf',
						speciesSpellcastingAbility: 'intelligence',
						feats: 'Magic Initiate',
						featSpellGrants: [
							{
								id: 'e2e-magic-initiate',
								featId: 'magic-initiate',
								spellList: 'wizard',
								ability: 'intelligence',
								cantripEntryIds: [fireBolt!.id, light!.id],
								firstLevelSpellEntryId: detectMagic!.id
							}
						]
					})
			);
			const initial = await gmApi.get(`/api/v1/campaigns/${campaignId}/characters/${character.id}`);
			expect(initial.status()).toBe(200);
			const initialCharacter = (await initial.json()) as { sheet: GrantSheet };
			const speciesGrant = initialCharacter.sheet.speciesSpellGrants.find(
				(item) => item.spellEntryId === detectMagic!.id
			);
			const featGrant = initialCharacter.sheet.featSpellGrants.find(
				(item) => item.firstLevelSpellEntryId === detectMagic!.id
			);
			expect(speciesGrant).toBeTruthy();
			expect(featGrant).toBeTruthy();
			expect(speciesGrant!.id).not.toBe(featGrant!.id);
			expect(speciesGrant!.freeCastsRemaining).toBe(1);
			expect(featGrant!.freeCastsRemaining).toBe(1);

			await stage('GM opens campaign workspace and waits for visible canvas', async () => {
				await gm.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
				await expect(gm.locator('canvas').first()).toBeVisible();
			});
			await stage('GM opens Fichas tab and waits for the embedded sheet region', async () => {
				await gm.getByRole('button', { name: 'Fichas', exact: true }).click();
				gmSheet = gm.locator('.sheet-backdrop.embedded .sheet');
				await expect(gmSheet).toBeVisible();
			});
			await stage(
				'GM confirms the synthetic character selection in the campaign selector',
				async () => {
					const sheetsRegion = gm.getByRole('region', { name: 'Fichas da campanha' });
					await expect(sheetsRegion).toBeVisible();
					const picker = sheetsRegion.getByLabel('Personagem da campanha');
					const initialState = await gm.evaluate(
						(expected) => {
							const selectors = document.querySelectorAll('#campaign-sheet-picker');
							const select = selectors[0] as HTMLSelectElement | undefined;
							const title = document.querySelector('.sheet-backdrop.embedded .sheet header h2');
							return {
								count: selectors.length,
								visible: Boolean(select && select.getClientRects().length),
								enabled: Boolean(select && !select.disabled),
								optionCount: select?.options.length ?? 0,
								targetOptionCount: select
									? [...select.options].filter((option) => option.value === expected.id).length
									: 0,
								selectedOptionCount: select?.selectedOptions.length ?? 0,
								valueMatchesExpected: select?.value === expected.id,
								selectedOptionMatchesExpected:
									select?.selectedOptions[0]?.textContent?.includes(expected.name) ?? false,
								titleMatchesExpected: title?.textContent?.trim() === expected.name,
								elapsedMs: Math.round(performance.now())
							};
						},
						{ id: character.id, name: 'Usos de magia de Alto Elfo E2E' }
					);
					selectionSnapshots.push({ phase: 'before selectOption', ...initialState });
					await gm.evaluate(
						(expected) => {
							const select = document.querySelector<HTMLSelectElement>('#campaign-sheet-picker');
							const state = {
								events: [] as Array<{ type: string; valueMatchesExpected: boolean }>,
								samples: [] as Array<Record<string, boolean | number>>
							};
							const sample = () => {
								const current = document.querySelector<HTMLSelectElement>('#campaign-sheet-picker');
								const title = document.querySelector('.sheet-backdrop.embedded .sheet header h2');
								state.samples.push({
									elapsedMs: Math.round(performance.now()),
									pickerPresent: Boolean(current),
									pickerVisible: Boolean(current && current.getClientRects().length),
									pickerEnabled: Boolean(current && !current.disabled),
									valueMatchesExpected: current?.value === expected.id,
									selectedOptionMatchesExpected:
										current?.selectedOptions[0]?.textContent?.includes(expected.name) ?? false,
									titleMatchesExpected: title?.textContent?.trim() === expected.name
								});
								if (state.samples.length > 12) state.samples.shift();
							};
							select?.addEventListener('input', () =>
								state.events.push({
									type: 'input',
									valueMatchesExpected: select.value === expected.id
								})
							);
							select?.addEventListener('change', () =>
								state.events.push({
									type: 'change',
									valueMatchesExpected: select.value === expected.id
								})
							);
							(
								window as Window & { __spellGrantSelectionDiagnostic?: typeof state }
							).__spellGrantSelectionDiagnostic = state;
							sample();
							window.setInterval(sample, 250);
						},
						{ id: character.id, name: 'Usos de magia de Alto Elfo E2E' }
					);
					if (initialState.valueMatchesExpected) {
						await expect(picker).toHaveValue(character.id);
						selectionSnapshots.push({ phase: 'selection already active; value asserted' });
					} else {
						const selected = await picker.selectOption(character.id);
						selectionSnapshots.push({
							phase: 'selectOption resolved',
							selectedCount: selected.length
						});
					}
				}
			);
			await stage('GM sees the selected character title', async () => {
				await expect(gmSheet!.locator('header h2')).toHaveText('Usos de magia de Alto Elfo E2E');
			});
			await stage('GM opens Magias tab and waits for visible Detect Magic card', async () => {
				await gmSheet!.getByRole('button', { name: 'Magias', exact: true }).click();
				gmSpellCard = gmSheet!
					.locator('.spell-card')
					.filter({ hasText: /Detectar Magia|Detect Magic/ });
				await expect(gmSpellCard).toHaveCount(1);
				await gmSpellCard.locator('.spell-toggle').click();
				speciesConfig = gmSpellCard.locator('.spell-grant-config[aria-label*="Alto Elfo"]');
				featConfig = gmSpellCard.locator('.spell-grant-config[aria-label*="Magic Initiate"]');
				await expect(speciesConfig).toHaveCount(1);
				await expect(featConfig).toHaveCount(1);
			});

			const saveConfig = async (
				group: Locator,
				maximumLabel: RegExp,
				availableLabel: RegExp,
				recoveryLabel: RegExp,
				grant: GrantRecord,
				recovery: 'short' | 'long'
			) => {
				await group.getByLabel(maximumLabel).fill('2');
				await group.getByLabel(availableLabel).fill('2');
				await group.getByLabel(recoveryLabel).selectOption(recovery);
				const responsePromise = gm.waitForResponse((response) => {
					const request = response.request();
					return (
						request.method() === 'PATCH' &&
						new URL(response.url()).pathname.endsWith(
							`/spell-grants/${encodeURIComponent(grant.id)}`
						)
					);
				});
				await group.getByRole('button', { name: 'Salvar usos' }).click();
				const response = await responsePromise;
				expect(response.status()).toBe(200);
				const saved = (await response.json()) as { sheet: GrantSheet };
				const savedGrant = [...saved.sheet.speciesSpellGrants, ...saved.sheet.featSpellGrants].find(
					(item) => item.id === grant.id
				);
				expect(savedGrant?.freeCastsRemaining).toBe(2);
				// Both grants in this synthetic case default to long-rest recovery.
				// The backend omits a stored override when the selected value matches that default.
				expect(savedGrant?.freeCastsRecovery ?? 'long').toBe(recovery);
				expect(savedGrant?.freeCastsMax ?? savedGrant?.freeCastsMaxOverride).toBe(2);
			};
			await stage('GM configures species grant and verifies saved settings', () =>
				saveConfig(
					speciesConfig!,
					/Usos máximos de Alto Elfo|High Elf maximum uses/,
					/Usos disponíveis de Alto Elfo|High Elf available uses/,
					/Recuperação de Alto Elfo|High Elf recovery/,
					speciesGrant!,
					'short'
				)
			);
			await stage('GM configures feat grant and verifies saved settings', () =>
				saveConfig(
					featConfig!,
					/Usos máximos de Magic Initiate|Magic Initiate maximum uses/,
					/Usos disponíveis de Magic Initiate|Magic Initiate available uses/,
					/Recuperação de Magic Initiate|Magic Initiate recovery/,
					featGrant!,
					'long'
				)
			);

			await stage('player opens campaign workspace and waits for visible canvas', async () => {
				await player.goto(`/?campaign=${campaignId}&scene=${sceneId}`);
				await expect(player.locator('canvas').first()).toBeVisible();
			});
			if (test.info().project.name === 'mobile-chromium') {
				expect(await player.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(760);
			}
			await stage('player opens Fichas tab and loads own character', async () => {
				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				playerSheet = player.locator('.sheet-backdrop.embedded .sheet');
				await expect(playerSheet.locator('header h2')).toHaveText('Usos de magia de Alto Elfo E2E');
			});
			await stage('player opens Magias tab and waits for visible Detect Magic card', async () => {
				await playerSheet!.getByRole('button', { name: 'Magias', exact: true }).click();
				playerSpellCard = playerSheet!
					.locator('.spell-card')
					.filter({ hasText: /Detectar Magia|Detect Magic/ });
				await expect(playerSpellCard).toHaveCount(1);
				await playerSpellCard.locator('.spell-toggle').click();
			});
			const sourceLabel = (source: 'Magic Initiate' | 'Alto Elfo') =>
				playerSpellCard!.locator('.spell-actions .feat-casting-source').filter({ hasText: source });
			const sourceFreeCastButton = async (source: 'Magic Initiate' | 'Alto Elfo') => {
				const label = sourceLabel(source);
				await expect(label).toHaveCount(1);
				return label.locator('xpath=following-sibling::*[1]');
			};
			await stage('player sees both grant sources and their available counters', async () => {
				await expect(sourceLabel('Magic Initiate')).toContainText('2/2');
				await expect(sourceLabel('Alto Elfo')).toContainText('2/2');
			});

			async function castFree(
				source: 'Magic Initiate' | 'Alto Elfo',
				grant: GrantRecord,
				remaining: number,
				otherRemaining: number
			) {
				return stage(`player explicitly selects ${source} grant and casts for free`, async () => {
					const button = await sourceFreeCastButton(source);
					await expect(button).toHaveClass(/free-cast/);
					expectedGrantId = grant.id;
					expectedEntryId = detectMagic!.id;
					const requestPromise = player.waitForRequest((request) => {
						if (request.method() !== 'POST') return false;
						const url = new URL(request.url());
						return (
							url.origin === apiOrigin &&
							url.pathname === `/api/v1/campaigns/${campaignId}/character/cast-spell`
						);
					});
					capturePlayerPosts = true;
					await button.click();
					const request = await requestPromise;
					capturePlayerPosts = false;
					const pathname = new URL(request.url()).pathname;
					const response = await request.response();
					expect(response, JSON.stringify(castDiagnostics)).toBeTruthy();
					const diagnostic = diagnosticForRequest.get(request);
					if (diagnostic) {
						diagnostic.status = response!.status();
					}
					const result = (await response!.json()) as {
						sheet?: GrantSheet;
						error?: { code?: string };
					};
					if (diagnostic) {
						if (result.error?.code) diagnostic.errorCode = result.error.code;
						const used = result.sheet && grantRemaining(result.sheet, grant.id);
						if (typeof used === 'number') diagnostic.expectedGrantRemaining = used;
					}
					expect(pathname).toBe(`/api/v1/campaigns/${campaignId}/character/cast-spell`);
					const body = request.postDataJSON() as Record<string, unknown>;
					expect(body).toMatchObject({
						spellIndex: -1,
						slotLevel: 0,
						grantId: grant.id,
						entryId: detectMagic!.id,
						freeCast: true,
						presentationSceneId: sceneId
					});
					expect(response!.status()).toBe(201);
					expect(result.sheet).toBeTruthy();
					expect(grantRemaining(result.sheet!, grant.id)).toBe(remaining);
					const otherGrant = grant.id === featGrant!.id ? speciesGrant! : featGrant!;
					const otherSource = source === 'Magic Initiate' ? 'Alto Elfo' : 'Magic Initiate';
					expect(grantRemaining(result.sheet!, otherGrant.id)).toBe(otherRemaining);
					await expect(sourceLabel(otherSource)).toContainText(`${otherRemaining}/2`);
					await expect(sourceLabel(source)).toContainText(`${remaining}/2`);
					if (remaining === 0) {
						await expect(await sourceFreeCastButton(source)).not.toHaveClass(/free-cast/);
					} else {
						await expect(await sourceFreeCastButton(source)).toHaveClass(/free-cast/);
					}
					await stage(
						'player dismisses the spell presentation before the next action',
						async () => {
							const presentation = player.getByRole('dialog', {
								name: /Detect Magic|Detectar Magia/
							});
							await expect(presentation).toBeVisible();
							await presentation
								.getByRole('button', { name: /Fechar imagem para mim|Close image for me/ })
								.click();
							await expect(presentation).toBeHidden();
						}
					);
					return undefined;
				});
			}

			await castFree('Magic Initiate', featGrant!, 1, 2);
			await castFree('Alto Elfo', speciesGrant!, 1, 1);
			await castFree('Magic Initiate', featGrant!, 0, 1);
			await castFree('Alto Elfo', speciesGrant!, 0, 0);

			await stage(
				'player chooses an explicit spell slot after both grants are exhausted',
				async () => {
					const beforeSlotCast = await playerApi.get(`/api/v1/campaigns/${campaignId}/character`);
					expect(beforeSlotCast.status()).toBe(200);
					const beforeSlotSheet = (await beforeSlotCast.json()) as { sheet: GrantSheet };
					const slotBefore =
						beforeSlotSheet.sheet.spellSlots.find((slot) => slot.level === 1)?.current ?? 0;
					expect(slotBefore).toBeGreaterThan(0);
					await playerSpellCard.getByLabel('Espaço de magia').selectOption('1');
					const slotCastRequestPromise = player.waitForRequest((request) => {
						if (request.method() !== 'POST') return false;
						const url = new URL(request.url());
						return (
							url.origin === apiOrigin &&
							url.pathname === `/api/v1/campaigns/${campaignId}/character/cast-spell`
						);
					});
					expectedGrantId = featGrant!.id;
					expectedEntryId = detectMagic!.id;
					capturePlayerPosts = true;
					await playerSpellCard.getByRole('button', { name: 'Lançar', exact: true }).click();
					const slotCastRequest = await slotCastRequestPromise;
					capturePlayerPosts = false;
					const slotCastResponse = await slotCastRequest.response();
					expect(slotCastResponse, JSON.stringify(castDiagnostics)).toBeTruthy();
					const slotCastResult = (await slotCastResponse!.json()) as { sheet: GrantSheet };
					const slotDiagnostic = diagnosticForRequest.get(slotCastRequest);
					if (slotDiagnostic) slotDiagnostic.status = slotCastResponse!.status();
					expect(slotCastResponse!.status()).toBe(201);
					expect(slotCastRequest.postDataJSON()).toMatchObject({
						spellIndex: -1,
						slotLevel: 1,
						grantId: featGrant!.id,
						entryId: detectMagic!.id,
						freeCast: false
					});
					expect(grantRemaining(slotCastResult.sheet, featGrant!.id)).toBe(0);
					expect(grantRemaining(slotCastResult.sheet, speciesGrant!.id)).toBe(0);
					expect(slotCastResult.sheet.spellSlots.find((slot) => slot.level === 1)?.current).toBe(
						slotBefore - 1
					);
				}
			);
			await stage('player is denied changing narrator-only grant configuration', async () => {
				const deniedConfig = await playerApi.patch(
					`/api/v1/campaigns/${campaignId}/characters/${character.id}/spell-grants/${encodeURIComponent(speciesGrant!.id)}`,
					{
						data: {
							entryId: speciesGrant!.spellEntryId,
							maxUses: 3,
							currentUses: 3,
							restoreOn: 'long'
						}
					}
				);
				expect(deniedConfig.status()).toBe(403);
				const afterDenied = await playerApi.get(`/api/v1/campaigns/${campaignId}/character`);
				expect(afterDenied.status()).toBe(200);
				const afterDeniedSheet = (await afterDenied.json()) as { sheet: GrantSheet };
				expect(grantRemaining(afterDeniedSheet.sheet, speciesGrant!.id)).toBe(0);
				expect(
					afterDeniedSheet.sheet.speciesSpellGrants.find((item) => item.id === speciesGrant!.id)
				).toMatchObject({
					freeCastsMax: 2,
					freeCastsRecovery: 'short'
				});
			});

			await stage('short rest restores only short-recovery grant and survives reload', async () => {
				const shortRest = await playerApi.post(`/api/v1/campaigns/${campaignId}/character/rest`, {
					data: { kind: 'short', hitDiceCount: 0 }
				});
				expect(shortRest.status()).toBe(200);
				const shortReload = await playerApi.get(`/api/v1/campaigns/${campaignId}/character`);
				expect(shortReload.status()).toBe(200);
				const shortState = (await shortReload.json()) as { sheet: GrantSheet };
				expect(grantRemaining(shortState.sheet, speciesGrant!.id)).toBe(2);
				expect(grantRemaining(shortState.sheet, featGrant!.id)).toBe(0);
				await player.reload();
				await expect(player.locator('canvas').first()).toBeVisible();
				await stage(
					'player dismisses the restored spell presentation after short-rest reload',
					async () => {
						const presentation = player.getByRole('dialog', {
							name: /Detect Magic|Detectar Magia/
						});
						await expect(presentation).toBeVisible();
						await presentation
							.getByRole('button', { name: /Fechar imagem para mim|Close image for me/ })
							.click();
						await expect(presentation).toBeHidden();
					}
				);
				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				const shortRestSheet = player.locator('.sheet-backdrop.embedded .sheet');
				await shortRestSheet.getByRole('button', { name: 'Magias', exact: true }).click();
				const shortRestCard = shortRestSheet
					.locator('.spell-card')
					.filter({ hasText: /Detectar Magia|Detect Magic/ });
				await shortRestCard.locator('.spell-toggle').click();
				await expect(
					shortRestCard
						.locator('.spell-actions .feat-casting-source')
						.filter({ hasText: 'Magic Initiate' })
				).toContainText('0/2');
				await expect(
					shortRestCard
						.locator('.spell-actions .feat-casting-source')
						.filter({ hasText: 'Alto Elfo' })
				).toContainText('2/2');
			});

			await stage('long rest restores short and long grants and survives reload', async () => {
				const longRest = await playerApi.post(`/api/v1/campaigns/${campaignId}/character/rest`, {
					data: { kind: 'long', hitDiceCount: 0 }
				});
				expect(longRest.status()).toBe(200);
				const longReload = await playerApi.get(`/api/v1/campaigns/${campaignId}/character`);
				expect(longReload.status()).toBe(200);
				const longState = (await longReload.json()) as { sheet: GrantSheet };
				expect(grantRemaining(longState.sheet, speciesGrant!.id)).toBe(2);
				expect(grantRemaining(longState.sheet, featGrant!.id)).toBe(2);
				await player.reload();
				await expect(player.locator('canvas').first()).toBeVisible();
				await stage(
					'player dismisses the restored spell presentation after long-rest reload',
					async () => {
						const presentation = player.getByRole('dialog', {
							name: /Detect Magic|Detectar Magia/
						});
						await expect(presentation).toBeVisible();
						await presentation
							.getByRole('button', { name: /Fechar imagem para mim|Close image for me/ })
							.click();
						await expect(presentation).toBeHidden();
					}
				);
				await player.getByRole('button', { name: 'Fichas', exact: true }).click();
				const longRestSheet = player.locator('.sheet-backdrop.embedded .sheet');
				await longRestSheet.getByRole('button', { name: 'Magias', exact: true }).click();
				const longRestCard = longRestSheet
					.locator('.spell-card')
					.filter({ hasText: /Detectar Magia|Detect Magic/ });
				await longRestCard.locator('.spell-toggle').click();
				await expect(
					longRestCard
						.locator('.spell-actions .feat-casting-source')
						.filter({ hasText: 'Magic Initiate' })
				).toContainText('2/2');
				await expect(
					longRestCard
						.locator('.spell-actions .feat-casting-source')
						.filter({ hasText: 'Alto Elfo' })
				).toContainText('2/2');
				expect(castDiagnostics).toHaveLength(5);
				expect(castDiagnostics.map((item) => item.status)).toEqual([201, 201, 201, 201, 201]);
			});
		} finally {
			capturePlayerPosts = false;
			await Promise.all(pendingErrorCodeReads);
			if (fixture) {
				try {
					const finalSelectionState = await fixture.gm.evaluate(() => {
						const state = (
							window as Window & {
								__spellGrantSelectionDiagnostic?: {
									events: Array<{ type: string; valueMatchesExpected: boolean }>;
									samples: Array<Record<string, boolean | number>>;
								};
							}
						).__spellGrantSelectionDiagnostic;
						const select = document.querySelector<HTMLSelectElement>('#campaign-sheet-picker');
						const title = document.querySelector('.sheet-backdrop.embedded .sheet header h2');
						return {
							count: document.querySelectorAll('#campaign-sheet-picker').length,
							visible: Boolean(select && select.getClientRects().length),
							enabled: Boolean(select && !select.disabled),
							selectedOptionCount: select?.selectedOptions.length ?? 0,
							titleVisible: Boolean(title && title.getClientRects().length),
							events: state?.events ?? [],
							recentSamples: state?.samples ?? []
						};
					});
					selectionSnapshots.push({ phase: 'final observed state', ...finalSelectionState });
				} catch {
					selectionSnapshots.push({ phase: 'final observed state', pageAvailable: false });
				}
			}
			const content = JSON.stringify(
				{
					lastCompletedStage,
					activeStage,
					testElapsedMs: Date.now() - testStartedAt,
					stageDurations,
					selectionSnapshots,
					visibleExpectedSelectors: [
						'Fichas button',
						'sheet header title: Usos de magia de Alto Elfo E2E',
						'Magias button',
						'Detect Magic spell card',
						'visible casting-source selector and cast button'
					],
					castRequests: castDiagnostics,
					network: safeNetworkDiagnostics,
					consoleErrors: safeConsoleDiagnostics
				},
				null,
				2
			);
			console.info(`Sanitized spell-grant HTTP diagnostics: ${content}`);
			try {
				await test.info().attach('spell-grant-http-diagnostics.json', {
					body: content,
					contentType: 'application/json'
				});
			} finally {
				await fixture?.close();
			}
		}
	});
});
