import { randomBytes } from 'node:crypto';
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const apiBase = process.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8080';
const localStackEnabled = process.env.E2E_LOCAL_STACK === 'true';

if (
	localStackEnabled &&
	(process.env.LOCAL_AUTH_E2E !== 'true' || !supabaseUrl || !publishableKey || !serviceRoleKey)
) {
	throw new Error('Mandatory local authenticated E2E is missing local Supabase credentials.');
}

test.use({ trace: 'off' });

async function publishTokenInvalidation(page: Page, sceneId: string, tokenId: string) {
	await page.evaluate(
		({ apiBase, sceneId, tokenId }) =>
			new Promise<void>((resolve, reject) => {
				const url = new URL('/api/v1/ws', apiBase);
				url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
				url.searchParams.set('sceneId', sceneId);
				let saved: string | null = null;
				for (let index = 0; index < localStorage.length; index += 1) {
					const key = localStorage.key(index);
					if (key?.includes('auth-token')) saved = localStorage.getItem(key);
				}
				if (!saved) return reject(new Error('Supabase session was not found in browser storage.'));
				const session = JSON.parse(saved) as {
					access_token?: string;
					currentSession?: { access_token?: string };
				};
				const token = session.access_token ?? session.currentSession?.access_token;
				if (!token) return reject(new Error('Access token was not found in browser storage.'));
				const socket = new WebSocket(url, ['maismorras-auth', token]);
				socket.onopen = () => {
					socket.send(JSON.stringify({ type: 'token.updated', data: { tokenId } }));
					window.setTimeout(() => {
						socket.close();
						resolve();
					}, 150);
				};
				socket.onerror = () => reject(new Error('Could not publish the WebSocket token event.'));
			}),
		{ apiBase, sceneId, tokenId }
	);
}

async function publishAndReadToken(
	publisher: Page,
	reader: Page,
	reconciler: Page,
	sceneId: string,
	tokenId: string
) {
	const expectedUrl = new URL(`/api/v1/scenes/${sceneId}/tokens/${tokenId}`, apiBase).href;
	const tokenRequest = reader.waitForRequest(
		(request) => request.method() === 'GET' && request.url() === expectedUrl,
		{ timeout: 15_000 }
	);
	const reconcileRequest = reconciler.waitForRequest(
		(request) => request.method() === 'GET' && request.url() === expectedUrl,
		{ timeout: 15_000 }
	);
	await publishTokenInvalidation(publisher, sceneId, tokenId);
	const [request, reconcile] = await Promise.all([tokenRequest, reconcileRequest]);
	const [response, reconcileResponse] = await Promise.all([
		request.response(),
		reconcile.response()
	]);
	if (!response || !reconcileResponse)
		throw new Error('Realtime token reads did not produce HTTP responses.');
	return { reader: response, reconciler: reconcileResponse };
}

function expectNoStore(response: { headers: () => Record<string, string> }) {
	const headers = response.headers();
	expect(headers['cache-control']).toBe('no-store');
	expect(headers.age).toBeUndefined();
}

test.describe('local authenticated authorization E2E', () => {
	test.skip(!localStackEnabled, 'Runs only against the isolated local Supabase stack in CI.');
	test('GM creates a campaign, player permissions hold, and token realtime reads fresh state', async ({
		browser
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'chromium',
			'The authenticated API integration runs once on desktop.'
		);
		const suffix = randomBytes(8).toString('hex');
		const password = `Local-${randomBytes(24).toString('base64url')}-9!`;
		const gmEmail = `gm-${suffix}@example.test`;
		const playerEmail = `player-${suffix}@example.test`;
		const admin = await playwrightRequest.newContext({
			baseURL: supabaseUrl,
			extraHTTPHeaders: {
				apikey: serviceRoleKey!,
				Authorization: `Bearer ${serviceRoleKey}`
			}
		});
		const gmContext = await browser.newContext();
		const playerContext = await browser.newContext();
		let gmUserId: string | undefined;
		let playerUserId: string | undefined;
		let campaignId: string | undefined;
		try {
			const createUser = async (email: string) => {
				const response = await admin.post('/auth/v1/admin/users', {
					data: { email, password, email_confirm: true }
				});
				expect(response.ok()).toBeTruthy();
				return (await response.json()) as { id: string };
			};
			gmUserId = (await createUser(gmEmail)).id;
			playerUserId = (await createUser(playerEmail)).id;

			const login = async (context: typeof gmContext, email: string) => {
				const page = await context.newPage();
				await page.goto('/');
				await page.getByLabel('E-mail de teste').fill(email);
				await page.getByLabel('Senha de teste').fill(password);
				await page.getByRole('button', { name: 'Entrar no ambiente local' }).click();
				await expect(page.getByText(/Central de campanhas|Campaign hub/i)).toBeVisible({
					timeout: 20_000
				});
				const token = await page.evaluate(() => {
					for (let index = 0; index < localStorage.length; index += 1) {
						const key = localStorage.key(index);
						if (!key?.includes('auth-token')) continue;
						try {
							const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
							const accessToken = stored.access_token ?? stored.currentSession?.access_token;
							if (accessToken) return accessToken as string;
						} catch {
							/* Ignore non-Supabase local-storage keys. */
						}
					}
					return null;
				});
				expect(token).toBeTruthy();
				return { page, token: token! };
			};

			const gm = await login(gmContext, gmEmail);
			const gmRealtimePublisher = await gmContext.newPage();
			await gmRealtimePublisher.goto('/');
			const gmApi = await playwrightRequest.newContext({
				baseURL: apiBase,
				extraHTTPHeaders: { Authorization: `Bearer ${gm.token}` }
			});
			try {
				const created = await gmApi.post('/api/v1/campaigns', {
					data: { name: `Campanha local ${suffix}`, systemId: 'dnd2024' }
				});
				expect(created.status()).toBe(201);
				campaignId = ((await created.json()) as { id: string }).id;
				expectNoStore(created);
				const scenesResponse = await gmApi.get(`/api/v1/campaigns/${campaignId}/scenes`);
				expect(scenesResponse.status()).toBe(200);
				expectNoStore(scenesResponse);
				const scenes = (await scenesResponse.json()) as { scenes: Array<{ id: string }> };
				expect(scenes.scenes).toHaveLength(1);
				const sceneId = scenes.scenes[0].id;
				const inviteResponse = await gmApi.post(`/api/v1/campaigns/${campaignId}/invites`, {
					data: {}
				});
				expect(inviteResponse.status()).toBe(201);
				const invite = (await inviteResponse.json()) as { code: string };

				const player = await login(playerContext, playerEmail);
				const playerApi = await playwrightRequest.newContext({
					baseURL: apiBase,
					extraHTTPHeaders: { Authorization: `Bearer ${player.token}` }
				});
				try {
					const accepted = await playerApi.post(`/api/v1/invites/${invite.code}/accept`, {
						data: {}
					});
					expect(accepted.ok()).toBeTruthy();
					const forbidden = await playerApi.patch(`/api/v1/campaigns/${campaignId}`, {
						data: { name: 'Alteração não autorizada' }
					});
					expect(forbidden.status()).toBe(403);

					const sceneUrl = `/?campaign=${campaignId}&scene=${sceneId}`;
					const frontendSceneRequest = player.page.waitForRequest(
						(request) =>
							request.method() === 'GET' &&
							new URL(request.url()).pathname === `/api/v1/scenes/${sceneId}`,
						{ timeout: 20_000 }
					);
					await Promise.all([gm.page.goto(sceneUrl), player.page.goto(sceneUrl)]);
					const actualFrontendRequest = await frontendSceneRequest;
					expect(new URL(actualFrontendRequest.url()).origin).toBe(new URL(apiBase).origin);
					await Promise.all([
						expect(gm.page.locator('canvas').first()).toBeVisible({ timeout: 20_000 }),
						expect(player.page.locator('canvas').first()).toBeVisible({ timeout: 20_000 })
					]);

					const tokenData = {
						name: 'Token E2E cache',
						imageUrl: null,
						color: 0x4f8f72,
						x: 1,
						y: 1,
						size: 1,
						hpCurrent: 12,
						hpMax: 12,
						armorClass: 12,
						initiative: 0,
						initiativeBonus: 0,
						visionRange: 0,
						lightRange: 0,
						statuses: [],
						hidden: false,
						visibility: {
							showName: true,
							showHP: true,
							showAC: true,
							showStatuses: true,
							imageScale: 1,
							imageOffsetX: 0,
							imageOffsetY: 0
						}
					};
					const tokenCreate = await gmApi.post(`/api/v1/scenes/${sceneId}/tokens`, {
						data: tokenData
					});
					expect(tokenCreate.status()).toBe(201);
					const token = (await tokenCreate.json()) as { id: string };

					const initialToken = await playerApi.get(`/api/v1/scenes/${sceneId}/tokens/${token.id}`);
					expect(initialToken.status()).toBe(200);
					expectNoStore(initialToken);

					const movedToken = { ...tokenData, id: token.id, x: 4, y: 3 };
					const patch = await gmApi.patch(`/api/v1/scenes/${sceneId}/tokens/${token.id}`, {
						data: movedToken
					});
					expect(patch.status()).toBe(200);
					expectNoStore(patch);
					expect(await patch.json()).toMatchObject({ x: 4, y: 3 });
					const directRead = await gmApi.get(`/api/v1/scenes/${sceneId}/tokens/${token.id}`);
					expect(directRead.status()).toBe(200);
					expectNoStore(directRead);
					expect(await directRead.json()).toMatchObject({ x: 4, y: 3 });
					const playerDirectRead = await playerApi.get(
						`/api/v1/scenes/${sceneId}/tokens/${token.id}`
					);
					expect(playerDirectRead.status()).toBe(200);
					expectNoStore(playerDirectRead);
					const playerDirectToken = await playerDirectRead.json();
					if (playerDirectToken.x !== 4 || playerDirectToken.y !== 3) {
						const playerSceneResponse = await playerApi.get(`/api/v1/scenes/${sceneId}`);
						const playerScene = (await playerSceneResponse.json()) as {
							tokens: Array<{ id: string; x: number; y: number }>;
						};
						console.error(
							'[E2E] token state diagnostics',
							JSON.stringify({
								tokenId: token.id,
								sceneId,
								playerToken: { x: playerDirectToken.x, y: playerDirectToken.y },
								playerSceneToken: playerScene.tokens.find((item) => item.id === token.id),
								playerSceneStatus: playerSceneResponse.status()
							})
						);
					}
					expect(playerDirectToken).toMatchObject({ x: 4, y: 3 });

					const realtimeReads = await publishAndReadToken(
						gmRealtimePublisher,
						player.page,
						gm.page,
						sceneId,
						token.id
					);
					const playerRead = realtimeReads.reader;
					expect(playerRead.status()).toBe(200);
					expectNoStore(playerRead);
					expect(await playerRead.json()).toMatchObject({ x: 4, y: 3 });
					expect(realtimeReads.reconciler.status()).toBe(200);
					expectNoStore(realtimeReads.reconciler);
					expect(await realtimeReads.reconciler.json()).toMatchObject({ x: 4, y: 3 });

					const hide = await gmApi.patch(`/api/v1/scenes/${sceneId}/tokens/${token.id}`, {
						data: { ...movedToken, hidden: true }
					});
					expect(hide.status()).toBe(200);
					expect(await hide.json()).toMatchObject({ x: 4, y: 3, hidden: true });
					const hiddenDirectRead = await gmApi.get(`/api/v1/scenes/${sceneId}/tokens/${token.id}`);
					expect(hiddenDirectRead.status()).toBe(200);
					expectNoStore(hiddenDirectRead);
					expect(await hiddenDirectRead.json()).toMatchObject({ x: 4, y: 3, hidden: true });
					const hiddenPlayerDirectRead = await playerApi.get(
						`/api/v1/scenes/${sceneId}/tokens/${token.id}`
					);
					expect(hiddenPlayerDirectRead.status()).toBe(404);
					expectNoStore(hiddenPlayerDirectRead);
				} finally {
					await playerApi.dispose();
				}
			} finally {
				try {
					if (campaignId) {
						const deleted = await gmApi.delete(`/api/v1/campaigns/${campaignId}`);
						expect(deleted.status()).toBe(204);
					}
				} finally {
					await gmApi.dispose();
				}
			}
		} finally {
			for (const userId of [gmUserId, playerUserId]) {
				if (userId) await admin.delete(`/auth/v1/admin/users/${userId}`);
			}
			await Promise.all([gmContext.close(), playerContext.close(), admin.dispose()]);
		}
	});
});
