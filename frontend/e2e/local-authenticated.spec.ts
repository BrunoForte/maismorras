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

type AudioRealtimeRecord = {
	type: 'audio.state' | 'audio.effects';
	path: string;
	playing: boolean;
	loop: boolean | null;
	revision: number;
};

type AudioObservation = {
	events: AudioRealtimeRecord[];
	puts: Array<{ channel: string; path: string | null; loop: boolean; expectedRevision: number }>;
	signedRequests: Array<{ path: string; surface: string; status?: number }>;
};

async function installAudioMediaMock(page: Page, autoplayPolicy: 'allow' | 'effects' | 'all') {
	await page.addInitScript((policy) => {
		type Operation = { kind: 'play' | 'pause' | 'load'; id: string; path: string; at: number };
		const sockets: WebSocket[] = [];
		const NativeWebSocket = window.WebSocket;
		class TrackedWebSocket extends NativeWebSocket {
			constructor(url: string | URL, protocols?: string | string[]) {
				super(url, protocols);
				sockets.push(this);
			}
		}
		Object.setPrototypeOf(TrackedWebSocket, NativeWebSocket);
		Object.defineProperty(window, 'WebSocket', { configurable: true, value: TrackedWebSocket });
		const target = window as Window & {
			__audioE2E?: { operations: Operation[]; sockets: WebSocket[] };
		};
		target.__audioE2E = { operations: [], sockets };
		let userActivated = false;
		window.addEventListener('pointerdown', () => (userActivated = true), { capture: true });
		window.addEventListener('keydown', () => (userActivated = true), { capture: true });
		const identify = (element: HTMLMediaElement) => {
			const elements = Array.from(document.querySelectorAll('audio'));
			const index = elements.indexOf(element as HTMLAudioElement);
			const id =
				element.id ||
				['overlay-music-a', 'overlay-music-b', 'overlay-effects-a', 'overlay-effects-b'][index] ||
				`audio-${index}`;
			let path = '';
			try {
				path = element.getAttribute('src')
					? new URL(element.getAttribute('src')!, location.href).pathname
					: '';
			} catch {
				/* Keep diagnostics URL-safe. */
			}
			return { id, path };
		};
		const operations = () => target.__audioE2E!.operations;
		HTMLMediaElement.prototype.play = function () {
			const media = this as HTMLMediaElement & { dataset: DOMStringMap };
			const info = identify(media);
			operations().push({ kind: 'play', ...info, at: performance.now() });
			const effectsChannel = info.id.includes('effects');
			if ((policy === 'all' || (policy === 'effects' && effectsChannel)) && !userActivated)
				return Promise.reject(
					new DOMException('Autoplay blocked by deterministic E2E policy.', 'NotAllowedError')
				);
			media.dataset.e2ePlaying = 'true';
			return Promise.resolve();
		};
		HTMLMediaElement.prototype.pause = function () {
			const media = this as HTMLMediaElement & { dataset: DOMStringMap };
			operations().push({ kind: 'pause', ...identify(media), at: performance.now() });
			media.dataset.e2ePlaying = 'false';
		};
		HTMLMediaElement.prototype.load = function () {
			operations().push({ kind: 'load', ...identify(this), at: performance.now() });
		};
	}, autoplayPolicy);
}

function observeAudio(page: Page, sceneId: string): AudioObservation {
	const observation: AudioObservation = { events: [], puts: [], signedRequests: [] };
	page.on('websocket', (socket) => {
		try {
			if (new URL(socket.url()).searchParams.get('sceneId') !== sceneId) return;
		} catch {
			return;
		}
		socket.on('framereceived', ({ payload }) => {
			if (typeof payload !== 'string') return;
			try {
				const event = JSON.parse(payload) as { type?: string; state?: AudioRealtimeRecord };
				if ((event.type === 'audio.state' || event.type === 'audio.effects') && event.state)
					observation.events.push({
						type: event.type,
						path: event.state.path,
						playing: event.state.playing,
						loop: event.state.loop,
						revision: event.state.revision
					});
			} catch {
				// Realtime may carry other JSON events; retain only the audio fields above.
			}
		});
	});
	page.on('request', (request) => {
		try {
			const url = new URL(request.url());
			if (url.pathname === `/api/v1/scenes/${sceneId}/audio` && request.method() === 'PUT') {
				const body = request.postDataJSON() as {
					channel?: string;
					path?: string | null;
					loop?: boolean;
					expectedRevision?: number;
				};
				observation.puts.push({
					channel: body.channel ?? '',
					path: body.path ?? null,
					loop: body.loop ?? false,
					expectedRevision: body.expectedRevision ?? -1
				});
			}
			if (url.pathname.endsWith('/assets/signed-url') && request.method() === 'POST') {
				const body = request.postDataJSON() as { path?: string; surface?: string };
				observation.signedRequests.push({
					path: body.path ?? '',
					surface: body.surface ?? ''
				});
			}
		} catch {
			// Never keep request headers or complete URLs in test diagnostics.
		}
	});
	page.on('response', (response) => {
		try {
			const url = new URL(response.url());
			if (!url.pathname.endsWith('/assets/signed-url')) return;
			const requestBody = response.request().postDataJSON() as { path?: string };
			const request = observation.signedRequests.findLast(
				(item) => item.path === requestBody.path && item.status === undefined
			);
			if (request) request.status = response.status();
		} catch {
			// Keep signed URLs and credentials out of logs.
		}
	});
	return observation;
}

async function audioSnapshot(page: Page) {
	return page.evaluate(() => {
		const state = window as Window & {
			__audioE2E?: {
				operations: Array<{ kind: string; id: string; path: string; at: number }>;
				sockets: WebSocket[];
			};
		};
		return {
			elements: Array.from(document.querySelectorAll('audio')).map((element, index) => {
				const id =
					element.id ||
					['overlay-music-a', 'overlay-music-b', 'overlay-effects-a', 'overlay-effects-b'][index] ||
					`audio-${index}`;
				let path = '';
				try {
					path = element.getAttribute('src')
						? new URL(element.getAttribute('src')!, location.href).pathname
						: '';
				} catch {
					/* no-op */
				}
				return {
					id,
					path,
					playing:
						(element as HTMLAudioElement & { dataset: DOMStringMap }).dataset.e2ePlaying === 'true',
					loop: (element as HTMLAudioElement).loop,
					currentTime: Math.round((element as HTMLAudioElement).currentTime)
				};
			}),
			operations: state.__audioE2E?.operations ?? [],
			sockets: (state.__audioE2E?.sockets ?? []).map((socket) => ({
				urlPath: (() => {
					try {
						return new URL(socket.url).pathname;
					} catch {
						return '';
					}
				})(),
				sceneId: (() => {
					try {
						return new URL(socket.url).searchParams.get('sceneId') ?? '';
					} catch {
						return '';
					}
				})(),
				readyState: socket.readyState
			}))
		};
	});
}

function createSilentWav(): Buffer {
	const samples = 800;
	const buffer = Buffer.alloc(44 + samples * 2);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(buffer.length - 8, 4);
	buffer.write('WAVEfmt ', 8);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(8000, 24);
	buffer.writeUInt32LE(16000, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(samples * 2, 40);
	return buffer;
}

async function sendAudioRevision(
	page: Page,
	apiBase: string,
	sceneId: string,
	state: AudioRealtimeRecord
) {
	await page.evaluate(
		({ apiBase, sceneId, state }) =>
			new Promise<void>((resolve, reject) => {
				let saved: string | null = null;
				for (let index = 0; index < localStorage.length; index += 1) {
					const key = localStorage.key(index);
					if (key?.includes('auth-token')) saved = localStorage.getItem(key);
				}
				if (!saved) return reject(new Error('Authenticated browser session is unavailable.'));
				const session = JSON.parse(saved) as {
					access_token?: string;
					currentSession?: { access_token?: string };
				};
				const token = session.access_token ?? session.currentSession?.access_token;
				if (!token) return reject(new Error('Authenticated browser session is unavailable.'));
				const url = new URL('/api/v1/ws', apiBase);
				url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
				url.searchParams.set('sceneId', sceneId);
				const socket = new WebSocket(url, ['maismorras-auth', token]);
				socket.onopen = () => {
					socket.send(
						JSON.stringify({
							type: state.type,
							state: {
								path: state.path,
								playing: state.playing,
								volume: 0.5,
								positionMs: 0,
								startedAt: Date.now(),
								loop: state.loop,
								revision: state.revision
							}
						})
					);
					window.setTimeout(() => {
						socket.close();
						resolve();
					}, 150);
				};
				socket.onerror = () => reject(new Error('Could not publish a test realtime state.'));
			}),
		{ apiBase, sceneId, state }
	);
}

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
		let overlayContext: BrowserContext | undefined;
		let gmUserId: string | undefined;
		let playerUserId: string | undefined;
		let campaignId: string | undefined;
		let audioAssetPaths: string[] = [];
		let audioBucketCreated = false;
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
				const audioNames = {
					musicInitial: `music_once__e2e-old-${suffix}.wav`,
					musicReplacement: `music_loop__e2e-new-${suffix}.wav`,
					effectInitial: `effect_once__e2e-old-${suffix}.wav`,
					effectReplacement: `effect_loop__e2e-new-${suffix}.wav`
				};
				const audioDisplayNames = {
					musicInitial: `e2e-old-${suffix}.wav`,
					musicReplacement: `e2e-new-${suffix}.wav`,
					effectInitial: `e2e-old-${suffix}.wav`,
					effectReplacement: `e2e-new-${suffix}.wav`
				};
				const bucketCheck = await admin.get('/storage/v1/bucket/campaign-assets');
				if (bucketCheck.status() !== 200) {
					const bucketCreate = await admin.post('/storage/v1/bucket', {
						data: { id: 'campaign-assets', name: 'campaign-assets', public: false }
					});
					expect(bucketCreate.status()).toBe(200);
					audioBucketCreated = true;
				} else {
					expect(bucketCheck.status()).toBe(200);
				}
				const mediaPrefix = `campaigns/${campaignId}/media/`;
				audioAssetPaths = Object.values(audioNames).map((name) => `${mediaPrefix}${name}`);
				for (const path of audioAssetPaths) {
					const uploaded = await admin.post(`/storage/v1/object/campaign-assets/${path}`, {
						headers: { 'Content-Type': 'audio/wav', 'x-upsert': 'false' },
						data: createSilentWav()
					});
					if (uploaded.status() !== 200) {
						let safeReason = 'Storage rejected the temporary test asset.';
						try {
							const body = (await uploaded.json()) as {
								error?: unknown;
								message?: unknown;
								statusCode?: unknown;
							};
							const reason = body.message ?? body.error ?? body.statusCode;
							if (typeof reason === 'string') safeReason = reason;
						} catch {
							/* Keep the test failure free of response headers and credentials. */
						}
						throw new Error(
							`Temporary campaign audio upload failed (HTTP ${uploaded.status()}): ${safeReason}`
						);
					}
				}

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
					const characterCreate = await gmApi.post(`/api/v1/campaigns/${campaignId}/characters`, {
						data: { ownerId: playerUserId }
					});
					expect(characterCreate.status()).toBe(201);
					const ownedCharacter = (await characterCreate.json()) as {
						id: string;
						sheet: Record<string, unknown>;
					};
					const saveOwnedCharacter = await gmApi.put(
						`/api/v1/campaigns/${campaignId}/characters/${ownedCharacter.id}`,
						{
							data: {
								...ownedCharacter.sheet,
								name: 'Ficha E2E de jogador',
								hitPointsCurrent: 12,
								hitPointsMax: 12
							}
						}
					);
					expect(saveOwnedCharacter.ok()).toBeTruthy();
					const linkedTokenCreate = await gmApi.post(
						`/api/v1/scenes/${sceneId}/tokens/from-character`,
						{ data: { actorId: ownedCharacter.id } }
					);
					expect(linkedTokenCreate.status()).toBe(201);
					const ownedToken = (await linkedTokenCreate.json()) as { id: string };
					const forbidden = await playerApi.patch(`/api/v1/campaigns/${campaignId}`, {
						data: { name: 'Alteração não autorizada' }
					});
					expect(forbidden.status()).toBe(403);

					const overlaySettings = await gmApi.put(
						`/api/v1/campaigns/${campaignId}/overlay-settings`,
						{ data: { enabled: true, cameras: [], activeSceneId: sceneId } }
					);
					expect(overlaySettings.ok()).toBeTruthy();
					const pairingResponse = await gmApi.post(
						`/api/v1/campaigns/${campaignId}/overlay-pairings`,
						{ data: { sceneId } }
					);
					expect(pairingResponse.status()).toBe(201);
					const pairing = (await pairingResponse.json()) as { code: string };
					const pairingApi = await playwrightRequest.newContext({ baseURL: apiBase });
					let overlayPage: Page | undefined;
					try {
						const exchangedResponse = await pairingApi.post('/api/v1/overlay/pair', {
							data: { code: pairing.code }
						});
						expect(exchangedResponse.ok()).toBeTruthy();
						const grant = (await exchangedResponse.json()) as {
							accessToken: string;
							expiresAt: number;
						};
						overlayContext = await browser.newContext();
						overlayPage = await overlayContext.newPage();
						await installAudioMediaMock(gm.page, 'allow');
						await installAudioMediaMock(player.page, 'effects');
						await installAudioMediaMock(overlayPage, 'all');
						await overlayPage.addInitScript(
							({ campaignId, grant }) =>
								localStorage.setItem(
									`maismorras:overlay-access:${campaignId}`,
									JSON.stringify(grant)
								),
							{ campaignId, grant }
						);
						const gmAudio = observeAudio(gm.page, sceneId);
						const playerAudio = observeAudio(player.page, sceneId);
						const overlayAudio = observeAudio(overlayPage, sceneId);

						const sceneUrl = `/?campaign=${campaignId}&scene=${sceneId}`;
						const frontendSceneRequest = player.page.waitForRequest(
							(request) =>
								request.method() === 'GET' &&
								new URL(request.url()).pathname === `/api/v1/scenes/${sceneId}`,
							{ timeout: 20_000 }
						);
						await Promise.all([
							gm.page.goto(sceneUrl),
							player.page.goto(sceneUrl),
							overlayPage.goto(`/overlay?campaign=${campaignId}&scene=${sceneId}`)
						]);
						const actualFrontendRequest = await frontendSceneRequest;
						expect(new URL(actualFrontendRequest.url()).origin).toBe(new URL(apiBase).origin);
						await Promise.all([
							expect(gm.page.locator('canvas').first()).toBeVisible({ timeout: 20_000 }),
							expect(player.page.locator('canvas').first()).toBeVisible({ timeout: 20_000 }),
							expect(overlayPage.locator('audio')).toHaveCount(4, { timeout: 20_000 })
						]);
						const musicControls = gm.page.locator('.music-player');
						const effectControls = gm.page.locator('.effects-player');
						const musicSelect = musicControls.locator('select');
						const effectSelect = effectControls.locator('select');
						const musicInitialPath = `${mediaPrefix}${audioNames.musicInitial}`;
						const musicReplacementPath = `${mediaPrefix}${audioNames.musicReplacement}`;
						const effectInitialPath = `${mediaPrefix}${audioNames.effectInitial}`;
						const effectReplacementPath = `${mediaPrefix}${audioNames.effectReplacement}`;
						for (const path of audioAssetPaths)
							await expect(gm.page.locator(`option[value="${path}"]`)).toHaveCount(1, {
								timeout: 20_000
							});

						// Initial GM Play persists independently per channel and broadcasts to both listeners.
						await musicSelect.selectOption(musicInitialPath);
						const startMusicResponse = gm.page.waitForResponse(
							(response) =>
								response.url().endsWith(`/api/v1/scenes/${sceneId}/audio`) &&
								response.request().method() === 'PUT'
						);
						await musicControls.getByRole('button', { name: 'Tocar', exact: true }).click();
						expect((await startMusicResponse).status()).toBe(200);
						await effectSelect.selectOption(effectInitialPath);
						const startEffectResponse = gm.page.waitForResponse(
							(response) =>
								response.url().endsWith(`/api/v1/scenes/${sceneId}/audio`) &&
								response.request().method() === 'PUT'
						);
						await effectControls.getByRole('button', { name: 'Tocar', exact: true }).click();
						expect((await startEffectResponse).status()).toBe(200);

						const persistedScene = async () => {
							const response = await gmApi.get(`/api/v1/scenes/${sceneId}`);
							expect(response.status()).toBe(200);
							return (await response.json()).scene as {
								ambientAudioPath: string | null;
								ambientAudioEnabled: boolean;
								ambientAudioLoop: boolean;
								ambientAudioRevision: number;
								ambientEffectPath: string | null;
								ambientEffectEnabled: boolean;
								ambientEffectLoop: boolean;
								ambientEffectRevision: number;
							};
						};
						await expect
							.poll(
								async () => {
									const state = await persistedScene();
									return (
										state.ambientAudioPath === musicInitialPath &&
										state.ambientEffectPath === effectInitialPath &&
										state.ambientAudioRevision === 1 &&
										state.ambientEffectRevision === 1
									);
								},
								{ timeout: 20_000 }
							)
							.toBe(true);
						let audioState = await persistedScene();
						expect(audioState).toMatchObject({
							ambientAudioPath: musicInitialPath,
							ambientAudioEnabled: true,
							ambientAudioLoop: false,
							ambientAudioRevision: 1,
							ambientEffectPath: effectInitialPath,
							ambientEffectEnabled: true,
							ambientEffectLoop: false,
							ambientEffectRevision: 1
						});
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) =>
											event.type === 'audio.state' &&
											event.path === musicInitialPath &&
											event.revision === 1
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) =>
											event.type === 'audio.effects' &&
											event.path === effectInitialPath &&
											event.revision === 1
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) =>
											event.type === 'audio.state' &&
											event.path === musicInitialPath &&
											event.revision === 1
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) =>
											event.type === 'audio.effects' &&
											event.path === effectInitialPath &&
											event.revision === 1
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									playerAudio.signedRequests.some(
										(item) => item.path === effectInitialPath && item.status === 200
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.signedRequests.some(
										(item) =>
											item.path === effectInitialPath &&
											item.surface === 'overlay' &&
											item.status === 200
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect(
							player.page.locator('.effects-player').getByRole('button', { name: 'Ativar áudio' })
						).toBeVisible();
						await expect(
							overlayPage.getByRole('button', { name: /ativar o áudio da transmissão/i })
						).toBeVisible();
						await player.page
							.locator('.effects-player')
							.getByRole('button', { name: 'Ativar áudio' })
							.click();
						await overlayPage
							.getByRole('button', { name: /ativar o áudio da transmissão/i })
							.click();
						const mediaFor = (
							snapshot: Awaited<ReturnType<typeof audioSnapshot>>,
							channel: 'music' | 'effect'
						) =>
							snapshot.elements.filter((item) =>
								channel === 'music'
									? item.id.includes('ambient') || item.id.includes('music')
									: item.id.includes('effects')
							);
						await expect
							.poll(
								async () =>
									(await audioSnapshot(player.page)).elements.filter((item) => item.playing).length,
								{ timeout: 15_000 }
							)
							.toBe(2);
						await expect
							.poll(
								async () =>
									(await audioSnapshot(overlayPage!)).elements.filter((item) => item.playing)
										.length,
								{ timeout: 15_000 }
							)
							.toBe(2);
						expect(
							mediaFor(await audioSnapshot(player.page), 'music').filter((item) => item.playing)
						).toHaveLength(1);
						expect(
							mediaFor(await audioSnapshot(player.page), 'effect').filter((item) => item.playing)
						).toHaveLength(1);
						expect(
							mediaFor(await audioSnapshot(overlayPage), 'music').filter((item) => item.playing)
						).toHaveLength(1);
						expect(
							mediaFor(await audioSnapshot(overlayPage), 'effect').filter((item) => item.playing)
						).toHaveLength(1);

						// Selecting a track and editing its suggested loop is pending intent only.
						const gmBeforeSelection = await audioSnapshot(gm.page);
						const pendingBaseline = {
							puts: gmAudio.puts.length,
							gmEvents: gmAudio.events.length,
							playerEvents: playerAudio.events.length,
							overlayEvents: overlayAudio.events.length
						};
						await musicSelect.selectOption(musicReplacementPath);
						await effectSelect.selectOption(effectReplacementPath);
						await expect(musicControls.locator('.loop-control input')).toBeChecked();
						await expect(effectControls.locator('.loop-control input')).toBeChecked();
						await musicControls.locator('.loop-control input').uncheck();
						await effectControls.locator('.loop-control input').uncheck();
						await expect(musicControls.locator('.track-state')).toContainText(
							audioDisplayNames.musicReplacement
						);
						await expect(musicControls.locator('.track-state')).toContainText(
							audioDisplayNames.musicInitial
						);
						await expect(effectControls.locator('.track-state')).toContainText(
							audioDisplayNames.effectReplacement
						);
						await expect(effectControls.locator('.track-state')).toContainText(
							audioDisplayNames.effectInitial
						);
						await gm.page.waitForTimeout(250);
						const gmAfterSelection = await audioSnapshot(gm.page);
						expect(gmAudio.puts).toHaveLength(pendingBaseline.puts);
						expect(gmAudio.events).toHaveLength(pendingBaseline.gmEvents);
						expect(playerAudio.events).toHaveLength(pendingBaseline.playerEvents);
						expect(overlayAudio.events).toHaveLength(pendingBaseline.overlayEvents);
						expect(gmAfterSelection.elements.map((item) => item.path)).toEqual(
							gmBeforeSelection.elements.map((item) => item.path)
						);
						expect(gmAfterSelection.operations).toHaveLength(gmBeforeSelection.operations.length);

						// Hold the authoritative music response: the old track must keep playing until commit/broadcast.
						let releaseMusic!: () => void;
						let reachedMusic!: () => void;
						const releaseMusicGate = new Promise<void>((resolve) => (releaseMusic = resolve));
						const musicRequestReached = new Promise<void>((resolve) => (reachedMusic = resolve));
						await gm.page.route(`**/api/v1/scenes/${sceneId}/audio`, async (route) => {
							const request = route.request();
							const body = request.postDataJSON() as { channel?: string; path?: string };
							if (body.channel === 'music' && body.path === musicReplacementPath) {
								reachedMusic();
								await releaseMusicGate;
							}
							await route.continue();
						});
						let previousMusicStayedUntilCommit = false;
						try {
							const musicPlayResponse = gm.page.waitForResponse(
								(response) =>
									response.url().endsWith(`/api/v1/scenes/${sceneId}/audio`) &&
									response.request().method() === 'PUT' &&
									(response.request().postDataJSON() as { channel?: string }).channel === 'music'
							);
							await musicControls.getByRole('button', { name: 'Aplicar e tocar' }).click();
							await musicRequestReached;
							const duringCommit = await audioSnapshot(gm.page);
							const oldMusic = gmBeforeSelection.elements.find(
								(item) => item.id.includes('ambient') && item.playing
							);
							previousMusicStayedUntilCommit = Boolean(
								oldMusic &&
								duringCommit.elements.some(
									(item) => item.id === oldMusic.id && item.path === oldMusic.path && item.playing
								) &&
								!duringCommit.operations.some(
									(item) => item.kind === 'play' && item.path.endsWith(audioNames.musicReplacement)
								)
							);
							releaseMusic();
							expect((await musicPlayResponse).status()).toBe(200);
						} finally {
							releaseMusic();
							await gm.page.unroute(`**/api/v1/scenes/${sceneId}/audio`);
						}
						await expect
							.poll(async () => (await persistedScene()).ambientAudioPath, { timeout: 15_000 })
							.toBe(musicReplacementPath);
						audioState = await persistedScene();
						expect(audioState).toMatchObject({
							ambientAudioEnabled: true,
							ambientAudioLoop: false,
							ambientAudioRevision: 2,
							ambientEffectPath: effectInitialPath,
							ambientEffectRevision: 1
						});
						expect(previousMusicStayedUntilCommit).toBe(true);
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) =>
											event.type === 'audio.state' &&
											event.path === musicReplacementPath &&
											event.loop === false &&
											event.revision === 2
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) =>
											event.type === 'audio.state' &&
											event.path === musicReplacementPath &&
											event.loop === false &&
											event.revision === 2
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									playerAudio.signedRequests.some(
										(item) => item.path === musicReplacementPath && item.status === 200
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.signedRequests.some(
										(item) =>
											item.path === musicReplacementPath &&
											item.surface === 'overlay' &&
											item.status === 200
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						const gmTransition = (await audioSnapshot(gm.page)).operations;
						const replacementPlayIndex = gmTransition.findIndex(
							(item) => item.kind === 'play' && item.path.endsWith(audioNames.musicReplacement)
						);
						const previousMusicPauseIndex = gmTransition.findIndex(
							(item) =>
								item.kind === 'pause' &&
								item.id.includes('ambient') &&
								item.path.endsWith(audioNames.musicInitial)
						);
						expect(replacementPlayIndex).toBeGreaterThanOrEqual(0);
						expect(previousMusicPauseIndex).toBeGreaterThan(replacementPlayIndex);
						for (const page of [gm.page, player.page, overlayPage]) {
							await expect
								.poll(
									async () =>
										mediaFor(await audioSnapshot(page), 'music').filter((item) => item.playing)
											.length,
									{ timeout: 10_000 }
								)
								.toBe(1);
							await expect
								.poll(
									async () =>
										mediaFor(await audioSnapshot(page), 'effect').filter((item) => item.playing)
											.length,
									{ timeout: 10_000 }
								)
								.toBe(1);
						}

						// Effect playback uses its own revision and replaces only the effect channel.
						const effectPlayResponse = gm.page.waitForResponse(
							(response) =>
								response.url().endsWith(`/api/v1/scenes/${sceneId}/audio`) &&
								response.request().method() === 'PUT' &&
								(response.request().postDataJSON() as { channel?: string }).channel === 'effect'
						);
						await effectControls.getByRole('button', { name: 'Aplicar e tocar' }).click();
						expect((await effectPlayResponse).status()).toBe(200);
						await expect
							.poll(async () => (await persistedScene()).ambientEffectPath, { timeout: 15_000 })
							.toBe(effectReplacementPath);
						audioState = await persistedScene();
						expect(audioState).toMatchObject({
							ambientAudioPath: musicReplacementPath,
							ambientAudioLoop: false,
							ambientAudioRevision: 2,
							ambientEffectPath: effectReplacementPath,
							ambientEffectEnabled: true,
							ambientEffectLoop: false,
							ambientEffectRevision: 2
						});
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) =>
											event.type === 'audio.effects' &&
											event.path === effectReplacementPath &&
											event.loop === false &&
											event.revision === 2
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) =>
											event.type === 'audio.effects' &&
											event.path === effectReplacementPath &&
											event.loop === false &&
											event.revision === 2
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									playerAudio.signedRequests.some(
										(item) => item.path === effectReplacementPath && item.status === 200
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.signedRequests.some(
										(item) =>
											item.path === effectReplacementPath &&
											item.surface === 'overlay' &&
											item.status === 200
									),
								{ timeout: 15_000 }
							)
							.toBe(true);

						// A scene-level loop choice overrides the file's default and is reflected in both listeners.
						const musicLoop = musicControls.locator('.loop-control input');
						await musicLoop.check();
						await expect
							.poll(async () => (await persistedScene()).ambientAudioRevision, { timeout: 15_000 })
							.toBe(3);
						await effectControls.locator('.loop-control input').check();
						await expect
							.poll(async () => (await persistedScene()).ambientEffectRevision, { timeout: 15_000 })
							.toBe(3);
						audioState = await persistedScene();
						expect(audioState).toMatchObject({
							ambientAudioLoop: true,
							ambientAudioRevision: 3,
							ambientEffectLoop: true,
							ambientEffectRevision: 3
						});
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) => event.type === 'audio.state' && event.loop && event.revision === 3
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) => event.type === 'audio.effects' && event.loop && event.revision === 3
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) => event.type === 'audio.state' && event.loop && event.revision === 3
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) => event.type === 'audio.effects' && event.loop && event.revision === 3
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						for (const page of [gm.page, player.page, overlayPage]) {
							for (const item of mediaFor(await audioSnapshot(page), 'music').filter(
								(entry) => entry.playing
							))
								expect(item.loop).toBe(true);
							for (const item of mediaFor(await audioSnapshot(page), 'effect').filter(
								(entry) => entry.playing
							))
								expect(item.loop).toBe(true);
						}

						// A valid but older GM WebSocket event is delivered, then ignored by each client.
						const staleEvent: AudioRealtimeRecord = {
							type: 'audio.state',
							path: `${mediaPrefix}music_once__stale.wav`,
							playing: true,
							loop: false,
							revision: 2
						};
						await sendAudioRevision(gmRealtimePublisher, apiBase, sceneId, staleEvent);
						await expect
							.poll(
								() =>
									playerAudio.events.some(
										(event) => event.path === staleEvent.path && event.revision === 2
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await expect
							.poll(
								() =>
									overlayAudio.events.some(
										(event) => event.path === staleEvent.path && event.revision === 2
									),
								{ timeout: 15_000 }
							)
							.toBe(true);
						await gm.page.waitForTimeout(250);
						expect((await persistedScene()).ambientAudioPath).toBe(musicReplacementPath);
						for (const page of [gm.page, player.page, overlayPage]) {
							expect(
								mediaFor(await audioSnapshot(page), 'music').filter((item) => item.playing)
							).toHaveLength(1);
							expect(
								(await audioSnapshot(page)).elements.some((item) =>
									item.path.endsWith('music_once__stale.wav')
								)
							).toBe(false);
						}

						// The campaign audio remains mounted across tab switches and a realtime reconnect.
						const beforeTabChange = await audioSnapshot(player.page);
						const workspaceNavigation = player.page.getByRole('navigation', {
							name: /Áreas da mesa|Table areas/
						});
						await workspaceNavigation
							.getByRole('button', { name: /Fichas|Sheets/, exact: true })
							.click();
						await workspaceNavigation
							.getByRole('button', { name: /Mesa|Table/, exact: true })
							.click();
						const afterTabChange = await audioSnapshot(player.page);
						expect(afterTabChange.elements.map((item) => item.path)).toEqual(
							beforeTabChange.elements.map((item) => item.path)
						);
						expect(
							afterTabChange.operations.filter(
								(item) => item.kind === 'pause' || item.kind === 'load'
							)
						).toHaveLength(
							beforeTabChange.operations.filter(
								(item) => item.kind === 'pause' || item.kind === 'load'
							).length
						);
						const reconnect = player.page.waitForEvent('websocket', {
							predicate: (socket) => new URL(socket.url()).searchParams.get('sceneId') === sceneId,
							timeout: 20_000
						});
						await player.page.evaluate((sceneId) => {
							const state = window as Window & { __audioE2E?: { sockets: WebSocket[] } };
							const socket = state.__audioE2E?.sockets.find((item) => {
								try {
									return (
										item.readyState === WebSocket.OPEN &&
										new URL(item.url).searchParams.get('sceneId') === sceneId
									);
								} catch {
									return false;
								}
							});
							if (!socket)
								throw new Error(
									'Scene realtime socket was not available for reconnect validation.'
								);
							socket.close(4000, 'audio reconnect validation');
						}, sceneId);
						await reconnect;
						await player.page.waitForTimeout(500);
						const afterReconnect = await audioSnapshot(player.page);
						expect(afterReconnect.elements.map((item) => item.path)).toEqual(
							afterTabChange.elements.map((item) => item.path)
						);
						expect(
							afterReconnect.operations.filter(
								(item) => item.kind === 'pause' || item.kind === 'load'
							)
						).toHaveLength(
							afterTabChange.operations.filter(
								(item) => item.kind === 'pause' || item.kind === 'load'
							).length
						);
						expect(mediaFor(afterReconnect, 'music').filter((item) => item.playing)).toHaveLength(
							1
						);
						expect(mediaFor(afterReconnect, 'effect').filter((item) => item.playing)).toHaveLength(
							1
						);

						const stopMusicResponse = gm.page.waitForResponse(
							(response) =>
								response.url().endsWith(`/api/v1/scenes/${sceneId}/audio`) &&
								response.request().method() === 'PUT' &&
								(response.request().postDataJSON() as { channel?: string; playing?: boolean })
									.channel === 'music' &&
								!(response.request().postDataJSON() as { playing?: boolean }).playing
						);
						await musicControls.getByRole('button', { name: 'Parar', exact: true }).click();
						expect((await stopMusicResponse).status()).toBe(200);
						await expect
							.poll(async () => (await persistedScene()).ambientAudioEnabled, { timeout: 15_000 })
							.toBe(false);
						expect((await persistedScene()).ambientEffectEnabled).toBe(true);
					} finally {
						await overlayContext?.close();
						await pairingApi.dispose();
					}

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

					const ownedHPUpdate = await playerApi.patch(
						`/api/v1/scenes/${sceneId}/tokens/${ownedToken.id}/hit-points`,
						{ data: { delta: -3 } }
					);
					expect(ownedHPUpdate.status()).toBe(200);
					expect(await ownedHPUpdate.json()).toMatchObject({ hpCurrent: 9, hpMax: 12 });
					const hpRealtimeReads = await publishAndReadToken(
						gmRealtimePublisher,
						player.page,
						gm.page,
						sceneId,
						ownedToken.id
					);
					expect(hpRealtimeReads.reader.status()).toBe(200);
					expect(await hpRealtimeReads.reader.json()).toMatchObject({ hpCurrent: 9 });
					expect(hpRealtimeReads.reconciler.status()).toBe(200);
					expect(await hpRealtimeReads.reconciler.json()).toMatchObject({ hpCurrent: 9 });
					const linkedSheetResponse = await playerApi.get(
						`/api/v1/campaigns/${campaignId}/character`
					);
					expect(linkedSheetResponse.ok()).toBeTruthy();
					expect(await linkedSheetResponse.json()).toMatchObject({
						sheet: {
							name: 'Ficha E2E de jogador',
							hitPointsCurrent: 9,
							hitPointsMax: 12
						}
					});
					const unrelatedTokenHPUpdate = await playerApi.patch(
						`/api/v1/scenes/${sceneId}/tokens/${token.id}/hit-points`,
						{ data: { delta: -1 } }
					);
					expect(unrelatedTokenHPUpdate.status()).toBe(403);
				} finally {
					await playerApi.dispose();
				}
			} finally {
				try {
					if (campaignId) {
						if (audioAssetPaths.length)
							await admin.delete('/storage/v1/object/campaign-assets', {
								data: { prefixes: audioAssetPaths }
							});
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
			if (audioBucketCreated) await admin.delete('/storage/v1/bucket/campaign-assets');
			await Promise.all([gmContext.close(), playerContext.close(), admin.dispose()]);
		}
	});
});
