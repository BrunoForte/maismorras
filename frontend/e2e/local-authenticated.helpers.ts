import { randomBytes } from 'node:crypto';
import {
	expect,
	request as playwrightRequest,
	test,
	type Browser,
	type BrowserContext,
	type Page,
	type APIRequestContext
} from '@playwright/test';

export const localStackEnabled = process.env.E2E_LOCAL_STACK === 'true';
const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
const publishableKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
export const apiBase = process.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8080';

if (
	localStackEnabled &&
	(!supabaseUrl || !publishableKey || !serviceRoleKey || process.env.LOCAL_AUTH_E2E !== 'true')
) {
	throw new Error('Mandatory local authenticated E2E is missing local Supabase credentials.');
}

export type AudioRealtimeRecord = {
	type: 'audio.state' | 'audio.effects';
	path: string;
	playing: boolean;
	loop: boolean | null;
	revision: number;
};

export type AudioObservation = {
	events: AudioRealtimeRecord[];
	puts: Array<{ channel: string; path: string | null; loop: boolean; expectedRevision: number }>;
	signedRequests: Array<{ path: string; surface: string; status?: number }>;
};

type AudioSetup = {
	gm: Page;
	player: Page;
	overlay: Page;
	gmPublisher: Page;
	sceneId: string;
	mediaPrefix: string;
	names: {
		musicInitial: string;
		musicReplacement: string;
		effectInitial: string;
		effectReplacement: string;
	};
	displayNames: {
		musicInitial: string;
		musicReplacement: string;
		effectInitial: string;
		effectReplacement: string;
	};
	gmAudio: AudioObservation;
	playerAudio: AudioObservation;
	overlayAudio: AudioObservation;
};

export type LocalAuthenticatedFixture = {
	gm: Page;
	player: Page;
	gmApi: APIRequestContext;
	playerApi: APIRequestContext;
	admin: APIRequestContext;
	campaignId: string;
	sceneId: string;
	gmPublisher: Page;
	gmUserId: string;
	playerUserId: string;
	createCharacter: (
		ownerId: string,
		sheetChanges?: Record<string, unknown>
	) => Promise<{ id: string; sheet: Record<string, unknown> }>;
	createCharacterToken: (characterId: string) => Promise<string>;
	startAudio: () => Promise<AudioSetup>;
	close: () => Promise<void>;
};

export async function createLocalAuthenticatedFixture(
	browser: Browser,
	withAudio = false
): Promise<LocalAuthenticatedFixture> {
	if (!supabaseUrl || !serviceRoleKey)
		throw new Error('Local Supabase test configuration is unavailable.');
	const suffix = randomBytes(8).toString('hex');
	const password = `Local-${randomBytes(24).toString('base64url')}-9!`;
	const gmEmail = `gm-${suffix}@example.test`;
	const playerEmail = `player-${suffix}@example.test`;
	const admin = await playwrightRequest.newContext({
		baseURL: supabaseUrl,
		extraHTTPHeaders: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
	});
	const gmContext = await browser.newContext();
	const playerContext = await browser.newContext();
	let overlayContext: BrowserContext | undefined;
	let gmUserId: string | undefined;
	let playerUserId: string | undefined;
	let campaignId: string | undefined;
	let sceneId: string | undefined;
	let audioPaths: string[] = [];
	let gmApi: APIRequestContext | undefined;
	let playerApi: APIRequestContext | undefined;
	let pairingApi: APIRequestContext | undefined;
	let gm: Page | undefined;
	let player: Page | undefined;
	let gmPublisher: Page | undefined;
	let overlay: Page | undefined;
	let closed = false;

	const close = async () => {
		if (closed) return;
		closed = true;
		try {
			await overlayContext?.close();
			if (campaignId && gmApi) {
				if (audioPaths.length) {
					await admin
						.delete('/storage/v1/object/campaign-assets', { data: { prefixes: audioPaths } })
						.catch(() => undefined);
				}
				await gmApi.delete(`/api/v1/campaigns/${campaignId}`).catch(() => undefined);
			}
		} finally {
			await Promise.all(
				[gmApi?.dispose(), playerApi?.dispose(), pairingApi?.dispose()].filter(Boolean)
			);
			for (const id of [gmUserId, playerUserId]) {
				if (id) await admin.delete(`/auth/v1/admin/users/${id}`).catch(() => undefined);
			}
			await Promise.all([gmContext.close(), playerContext.close(), admin.dispose()]);
		}
	};

	try {
		const createUser = async (email: string) => {
			const response = await admin.post('/auth/v1/admin/users', {
				data: { email, password, email_confirm: true }
			});
			expect(response.ok()).toBeTruthy();
			return (await response.json()) as { id: string };
		};
		[gmUserId, playerUserId] = await test.step('create unique GM/player test users', async () => [
			(await createUser(gmEmail)).id,
			(await createUser(playerEmail)).id
		]);
		const login = async (role: 'GM' | 'player', context: BrowserContext, email: string) =>
			test.step(`login ${role}`, async () => {
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
							/* Ignore unrelated local storage entries. */
						}
					}
					return null;
				});
				expect(token).toBeTruthy();
				return { page, token: token! };
			});

		gm = (await login('GM', gmContext, gmEmail)).page;
		gmPublisher = await gmContext.newPage();
		await gmPublisher.goto('/');
		const gmToken = await gm.evaluate(() => {
			for (let i = 0; i < localStorage.length; i += 1) {
				const key = localStorage.key(i);
				if (key?.includes('auth-token')) {
					try {
						const value = JSON.parse(localStorage.getItem(key) ?? '{}');
						return value.access_token ?? value.currentSession?.access_token ?? null;
					} catch {
						/* Ignore unrelated entries. */
					}
				}
			}
			return null;
		});
		gmApi = await playwrightRequest.newContext({
			baseURL: apiBase,
			extraHTTPHeaders: { Authorization: `Bearer ${gmToken}` }
		});
		const { campaignId: createdCampaignId, sceneId: createdSceneId } =
			await test.step('create campaign and initial scene', async () => {
				const campaign = await gmApi!.post('/api/v1/campaigns', {
					data: { name: `Campanha E2E ${suffix}`, systemId: 'dnd2024' }
				});
				expect(campaign.status()).toBe(201);
				const id = ((await campaign.json()) as { id: string }).id;
				campaignId = id;
				const scenesResponse = await gmApi!.get(`/api/v1/campaigns/${id}/scenes`);
				expect(scenesResponse.status()).toBe(200);
				const scenes = (await scenesResponse.json()) as { scenes: Array<{ id: string }> };
				expect(scenes.scenes).toHaveLength(1);
				sceneId = scenes.scenes[0].id;
				return { campaignId: id, sceneId: sceneId };
			});
		campaignId = createdCampaignId;
		sceneId = createdSceneId;
		await test.step('create invite and join player to campaign', async () => {
			const inviteResponse = await gmApi!.post(`/api/v1/campaigns/${campaignId}/invites`, {
				data: {}
			});
			expect(inviteResponse.status()).toBe(201);
			const invite = (await inviteResponse.json()) as { code: string };
			player = (await login('player', playerContext, playerEmail)).page;
			const playerToken = await player.evaluate(() => {
				for (let i = 0; i < localStorage.length; i += 1) {
					const key = localStorage.key(i);
					if (key?.includes('auth-token')) {
						try {
							const value = JSON.parse(localStorage.getItem(key) ?? '{}');
							return value.access_token ?? value.currentSession?.access_token ?? null;
						} catch {
							/* Ignore unrelated entries. */
						}
					}
				}
				return null;
			});
			playerApi = await playwrightRequest.newContext({
				baseURL: apiBase,
				extraHTTPHeaders: { Authorization: `Bearer ${playerToken}` }
			});
			const accepted = await playerApi.post(`/api/v1/invites/${invite.code}/accept`, { data: {} });
			expect(accepted.ok()).toBeTruthy();
		});
		if (withAudio)
			await test.step('upload unique temporary audio assets to Storage', async () => {
				await prepareAudioAssets(admin, campaignId!, suffix, (paths) => {
					audioPaths = paths;
				});
			});

		const fixture: LocalAuthenticatedFixture = {
			gm,
			player,
			gmApi,
			playerApi,
			admin,
			campaignId,
			sceneId,
			gmPublisher,
			gmUserId,
			playerUserId,
			createCharacter: async (ownerId, sheetChanges = {}) => {
				const response = await gmApi!.post(`/api/v1/campaigns/${campaignId}/characters`, {
					data: { ownerId }
				});
				expect(response.status()).toBe(201);
				const character = (await response.json()) as {
					id: string;
					sheet: Record<string, unknown>;
				};
				const saved = await gmApi!.put(
					`/api/v1/campaigns/${campaignId}/characters/${character.id}`,
					{ data: { ...character.sheet, ...sheetChanges } }
				);
				expect(saved.ok()).toBeTruthy();
				return {
					id: character.id,
					sheet: ((await saved.json()) as { sheet: Record<string, unknown> }).sheet
				};
			},
			createCharacterToken: async (characterId) => {
				const response = await gmApi!.post(`/api/v1/scenes/${sceneId}/tokens/from-character`, {
					data: { actorId: characterId }
				});
				expect(response.status()).toBe(201);
				return ((await response.json()) as { id: string }).id;
			},
			startAudio: async () => {
				if (!withAudio) throw new Error('Audio assets were not provisioned for this scenario.');
				const grant = await test.step('pair overlay using a one-time test code', async () => {
					const settings = await gmApi!.put(`/api/v1/campaigns/${campaignId}/overlay-settings`, {
						data: { enabled: true, cameras: [], activeSceneId: sceneId }
					});
					expect(settings.ok()).toBeTruthy();
					const pairingResponse = await gmApi!.post(
						`/api/v1/campaigns/${campaignId}/overlay-pairings`,
						{ data: { sceneId } }
					);
					expect(pairingResponse.status()).toBe(201);
					const pairing = (await pairingResponse.json()) as { code: string };
					pairingApi = await playwrightRequest.newContext({ baseURL: apiBase });
					const exchange = await pairingApi.post('/api/v1/overlay/pair', {
						data: { code: pairing.code }
					});
					expect(exchange.ok()).toBeTruthy();
					return await exchange.json();
				});
				overlayContext = await browser.newContext();
				overlay = await overlayContext.newPage();
				await installAudioMediaMock(gm, 'allow');
				await installAudioMediaMock(player, 'effects');
				await installAudioMediaMock(overlay, 'all');
				await overlay.addInitScript(
					({ campaign, access }) =>
						localStorage.setItem(`maismorras:overlay-access:${campaign}`, JSON.stringify(access)),
					{ campaign: campaignId!, access: grant }
				);
				const gmAudio = observeAudio(gm, sceneId!);
				const playerAudio = observeAudio(player, sceneId!);
				const overlayAudio = observeAudio(overlay, sceneId!);
				await test.step('open campaign scene and wait for canvas/overlay players', async () => {
					const sceneRead = gm!.waitForRequest((request) => {
						try {
							const url = new URL(request.url());
							return request.method() === 'GET' && url.pathname === `/api/v1/scenes/${sceneId}`;
						} catch {
							return false;
						}
					});
					await Promise.all([
						gm!.goto(`/?campaign=${campaignId}&scene=${sceneId}`),
						player!.goto(`/?campaign=${campaignId}&scene=${sceneId}`),
						overlay!.goto(`/overlay?campaign=${campaignId}&scene=${sceneId}`)
					]);
					await Promise.all([
						expect(gm!.locator('canvas').first()).toBeVisible({ timeout: 20_000 }),
						expect(player!.locator('canvas').first()).toBeVisible({ timeout: 20_000 }),
						expect(overlay!.locator('audio')).toHaveCount(4, { timeout: 20_000 })
					]);
					expect(new URL((await sceneRead).url()).origin).toBe(new URL(apiBase).origin);
				});
				const mediaNames = {
					musicInitial: `music_once__e2e-old-${suffix}.wav`,
					musicReplacement: `music_loop__e2e-new-${suffix}.wav`,
					effectInitial: `effect_once__e2e-old-${suffix}.wav`,
					effectReplacement: `effect_loop__e2e-new-${suffix}.wav`
				};
				return {
					gm,
					player,
					overlay,
					gmPublisher: gmPublisher!,
					sceneId: sceneId!,
					mediaPrefix: `campaigns/${campaignId}/media/`,
					names: mediaNames,
					displayNames: {
						musicInitial: `e2e-old-${suffix}.wav`,
						musicReplacement: `e2e-new-${suffix}.wav`,
						effectInitial: `e2e-old-${suffix}.wav`,
						effectReplacement: `e2e-new-${suffix}.wav`
					},
					gmAudio,
					playerAudio,
					overlayAudio
				};
			},
			close
		};
		return fixture;
	} catch (error) {
		await close();
		throw error;
	}
}

async function prepareAudioAssets(
	admin: APIRequestContext,
	campaignId: string,
	suffix: string,
	setPaths: (paths: string[]) => void
) {
	const names = [
		`music_once__e2e-old-${suffix}.wav`,
		`music_loop__e2e-new-${suffix}.wav`,
		`effect_once__e2e-old-${suffix}.wav`,
		`effect_loop__e2e-new-${suffix}.wav`
	];
	const paths = names.map((name) => `campaigns/${campaignId}/media/${name}`);
	setPaths(paths);
	const bucket = await admin.get('/storage/v1/bucket/campaign-assets');
	if (bucket.status() !== 200) {
		const created = await admin.post('/storage/v1/bucket', {
			data: { id: 'campaign-assets', name: 'campaign-assets', public: false }
		});
		if (![200, 409].includes(created.status()))
			throw new Error(`Temporary E2E Storage bucket setup failed (${created.status()}).`);
		if (created.status() === 409) {
			let available = false;
			for (let attempt = 0; attempt < 10; attempt += 1) {
				if ((await admin.get('/storage/v1/bucket/campaign-assets')).status() === 200) {
					available = true;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			if (!available)
				throw new Error('Shared local campaign-assets bucket did not become available.');
		}
	}
	const wav = createSilentWav();
	for (const path of paths) {
		const uploaded = await admin.post(`/storage/v1/object/campaign-assets/${path}`, {
			headers: { 'Content-Type': 'audio/wav', 'x-upsert': 'false' },
			data: wav
		});
		if (uploaded.status() !== 200)
			throw new Error(`Temporary audio upload failed (HTTP ${uploaded.status()}).`);
	}
}

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
		let activated = false;
		window.addEventListener('pointerdown', () => (activated = true), { capture: true });
		window.addEventListener('keydown', () => (activated = true), { capture: true });
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
				/* Ignore non-relative sources. */
			}
			return { id, path };
		};
		HTMLMediaElement.prototype.play = function () {
			const media = this as HTMLMediaElement & { dataset: DOMStringMap };
			const info = identify(media);
			target.__audioE2E!.operations.push({ kind: 'play', ...info, at: performance.now() });
			const effects = info.id.includes('effects');
			if ((policy === 'all' || (policy === 'effects' && effects)) && !activated)
				return Promise.reject(
					new DOMException('Autoplay blocked by deterministic E2E policy.', 'NotAllowedError')
				);
			media.dataset.e2ePlaying = 'true';
			return Promise.resolve();
		};
		HTMLMediaElement.prototype.pause = function () {
			const media = this as HTMLMediaElement & { dataset: DOMStringMap };
			target.__audioE2E!.operations.push({
				kind: 'pause',
				...identify(media),
				at: performance.now()
			});
			media.dataset.e2ePlaying = 'false';
		};
		HTMLMediaElement.prototype.load = function () {
			target.__audioE2E!.operations.push({
				kind: 'load',
				...identify(this),
				at: performance.now()
			});
		};
	}, autoplayPolicy);
}

function observeAudio(page: Page, sceneId: string): AudioObservation {
	const result: AudioObservation = { events: [], puts: [], signedRequests: [] };
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
					result.events.push({
						type: event.type,
						path: event.state.path,
						playing: event.state.playing,
						loop: event.state.loop,
						revision: event.state.revision
					});
			} catch {
				/* Other realtime events contain no audio assertions. */
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
				result.puts.push({
					channel: body.channel ?? '',
					path: body.path ?? null,
					loop: body.loop ?? false,
					expectedRevision: body.expectedRevision ?? -1
				});
			}
			if (url.pathname.endsWith('/assets/signed-url') && request.method() === 'POST') {
				const body = request.postDataJSON() as { path?: string; surface?: string };
				result.signedRequests.push({ path: body.path ?? '', surface: body.surface ?? '' });
			}
		} catch {
			/* Do not retain headers or signed URL values. */
		}
	});
	page.on('response', (response) => {
		try {
			const url = new URL(response.url());
			if (!url.pathname.endsWith('/assets/signed-url')) return;
			const body = response.request().postDataJSON() as { path?: string };
			const item = result.signedRequests.findLast(
				(entry) => entry.path === body.path && entry.status === undefined
			);
			if (item) item.status = response.status();
		} catch {
			/* No response URL or credentials are logged. */
		}
	});
	return result;
}

export async function audioSnapshot(page: Page) {
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
					/* Hide invalid or signed URL details. */
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

export function createSilentWav(): Buffer {
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

export async function sendAudioRevision(page: Page, sceneId: string, state: AudioRealtimeRecord) {
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

export async function publishAndReadToken(
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
	await publisher.evaluate(
		({ apiBase, sceneId, tokenId }) =>
			new Promise<void>((resolve, reject) => {
				let saved: string | null = null;
				for (let i = 0; i < localStorage.length; i += 1) {
					const key = localStorage.key(i);
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
	const [request, reconcile] = await Promise.all([tokenRequest, reconcileRequest]);
	const [response, reconcileResponse] = await Promise.all([
		request.response(),
		reconcile.response()
	]);
	if (!response || !reconcileResponse)
		throw new Error('Realtime token reads did not produce HTTP responses.');
	return { reader: response, reconciler: reconcileResponse };
}

export function expectNoStore(response: { headers: () => Record<string, string> }) {
	const headers = response.headers();
	expect(headers['cache-control']).toBe('no-store');
	expect(headers.age).toBeUndefined();
}
