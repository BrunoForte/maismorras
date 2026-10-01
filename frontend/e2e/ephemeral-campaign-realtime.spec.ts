import {
	expect,
	request as playwrightRequest,
	test,
	type Browser,
	type BrowserContext,
	type Page
} from '@playwright/test';

const ownerStatePath = process.env.E2E_STORAGE_STATE;
const playerStatePath = process.env.E2E_PLAYER_STORAGE_STATE;
const apiBase =
	process.env.E2E_API_BASE ?? 'https://maismorras-api-454646414754.southamerica-east1.run.app';

type Campaign = { id: string; name: string };
type Scene = { id: string; campaignId: string };
type Token = {
	id: string;
	actorId?: string | null;
	name: string;
	imageUrl: string | null;
	color: number;
	x: number;
	y: number;
	size: number;
	hpCurrent: number;
	hpMax: number;
	armorClass: number;
	initiative: number;
	initiativeBonus: number;
	visionRange: number;
	lightRange: number;
	statuses: string[];
	hidden: boolean;
	visibility: {
		showName: boolean;
		showHP: boolean;
		showAC: boolean;
		showStatuses: boolean;
		imageScale: number;
		imageOffsetX: number;
		imageOffsetY: number;
	};
};

async function accessToken(browser: Browser, storageStatePath: string): Promise<string> {
	const context = await browser.newContext({ storageState: storageStatePath });
	try {
		const page = await context.newPage();
		await page.goto(process.env.E2E_BASE_URL ?? 'https://maismorras.vercel.app');
		const previousToken = await page.evaluate(() => {
			for (let index = 0; index < localStorage.length; index += 1) {
				const key = localStorage.key(index);
				if (!key?.includes('auth-token')) continue;
				try {
					const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as {
						access_token?: string;
						currentSession?: { access_token?: string; expires_at?: number };
						expires_at?: number;
					};
					const token = saved.access_token ?? saved.currentSession?.access_token;
					if (!token) continue;
					// Force the in-memory test context through Supabase's normal refresh flow.
					saved.expires_at = 0;
					if (saved.currentSession) saved.currentSession.expires_at = 0;
					localStorage.setItem(key, JSON.stringify(saved));
					return token;
				} catch {
					continue;
				}
			}
			return null;
		});
		if (!previousToken)
			throw new Error('Supabase session is missing from the saved browser state.');
		await page.reload();
		const refreshed = await page.waitForFunction(
			(previous) => {
				for (let index = 0; index < localStorage.length; index += 1) {
					const key = localStorage.key(index);
					if (!key?.includes('auth-token')) continue;
					try {
						const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as {
							access_token?: string;
							currentSession?: { access_token?: string; expires_at?: number };
							expires_at?: number;
						};
						const token = saved.access_token ?? saved.currentSession?.access_token;
						const expiresAt = Number(saved.expires_at ?? saved.currentSession?.expires_at ?? 0);
						if (token && token !== previous && expiresAt > Date.now() / 1000 + 30) return token;
					} catch {
						continue;
					}
				}
				return false;
			},
			previousToken,
			{ timeout: 20_000 }
		);
		const refreshedToken: unknown = await refreshed.jsonValue();
		if (typeof refreshedToken !== 'string')
			throw new Error('Supabase session could not be refreshed from the saved browser state.');
		return refreshedToken;
	} finally {
		await context.close();
	}
}

async function apiFor(browser: Browser, storageStatePath: string) {
	return playwrightRequest.newContext({
		baseURL: apiBase,
		extraHTTPHeaders: { Authorization: `Bearer ${await accessToken(browser, storageStatePath)}` }
	});
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

function logCacheDiagnostics(response: { headers: () => Record<string, string> }) {
	const headers = response.headers();
	console.info(
		'[E2E] API cache diagnostics',
		JSON.stringify({
			cacheControl: headers['cache-control'] ?? null,
			age: headers.age ?? null,
			etag: headers.etag ?? null
		})
	);
}

test.describe('disposable authenticated campaign and realtime token flow', () => {
	test.skip(!ownerStatePath, 'Configure E2E_STORAGE_STATE with a dedicated narrator account.');

	test('creates a disposable campaign, synchronizes a token, and deletes the campaign', async ({
		browser,
		baseURL
	}) => {
		const ownerApi = await apiFor(browser, ownerStatePath!);
		let playerApi: Awaited<ReturnType<typeof playwrightRequest.newContext>> | undefined;
		let ownerContext: BrowserContext | undefined;
		let playerContext: BrowserContext | undefined;
		let campaignId: string | undefined;
		try {
			const name = `E2E descartável ${new Date().toISOString()} ${Math.random().toString(36).slice(2, 7)}`;
			const createResponse = await ownerApi.post('/api/v1/campaigns', {
				data: { name, systemId: 'dnd2024' }
			});
			expect(createResponse.status()).toBe(201);
			const campaign = (await createResponse.json()) as Campaign;
			campaignId = campaign.id;
			expect(campaign.name).toBe(name);

			const scenesResponse = await ownerApi.get(`/api/v1/campaigns/${campaignId}/scenes`);
			expect(scenesResponse.ok()).toBeTruthy();
			const scenes = (await scenesResponse.json()) as { scenes: Scene[] };
			expect(scenes.scenes).toHaveLength(1);
			const scene = scenes.scenes[0];

			if (playerStatePath) {
				playerApi = await apiFor(browser, playerStatePath);
				const inviteResponse = await ownerApi.post(`/api/v1/campaigns/${campaignId}/invites`, {
					data: {}
				});
				expect(inviteResponse.status()).toBe(201);
				const invite = (await inviteResponse.json()) as { code: string };
				const joinResponse = await playerApi.post(`/api/v1/invites/${invite.code}/accept`, {
					data: {}
				});
				expect(joinResponse.ok()).toBeTruthy();
				const participantsResponse = await ownerApi.get(
					`/api/v1/campaigns/${campaignId}/participants`
				);
				expect(participantsResponse.ok()).toBeTruthy();
				const participants = (await participantsResponse.json()) as {
					participants: { userId: string; role: string }[];
				};
				const player = participants.participants.find(
					(participant) => participant.role === 'player'
				);
				expect(player).toBeTruthy();
				const characterCreate = await ownerApi.post(`/api/v1/campaigns/${campaignId}/characters`, {
					data: { ownerId: player!.userId }
				});
				expect(characterCreate.status()).toBe(201);
				const character = (await characterCreate.json()) as {
					id: string;
					sheet: Record<string, unknown>;
				};
				const preparedSheet = {
					...character.sheet,
					name: 'Ficha E2E de jogador',
					hitPointsCurrent: 12,
					hitPointsMax: 12
				};
				const saveCharacter = await ownerApi.put(
					`/api/v1/campaigns/${campaignId}/characters/${character.id}`,
					{ data: preparedSheet }
				);
				expect(saveCharacter.ok()).toBeTruthy();
				const linkedTokenResponse = await ownerApi.post(
					`/api/v1/scenes/${scene.id}/tokens/from-character`,
					{ data: { actorId: character.id } }
				);
				expect(linkedTokenResponse.status()).toBe(201);
				const playerOwnedToken = (await linkedTokenResponse.json()) as Token;

				ownerContext = await browser.newContext({ storageState: ownerStatePath });
				playerContext = await browser.newContext({ storageState: playerStatePath });
				const ownerPage = await ownerContext.newPage();
				const playerPage = await playerContext.newPage();
				const ownerRealtimePublisher = await ownerContext.newPage();
				const sceneUrl = `${baseURL}/?campaign=${campaignId}&scene=${scene.id}`;
				const frontendSceneRequest = playerPage.waitForRequest(
					(request) =>
						request.method() === 'GET' &&
						new URL(request.url()).pathname === `/api/v1/scenes/${scene.id}`,
					{ timeout: 30_000 }
				);
				await Promise.all([
					ownerPage.goto(sceneUrl),
					playerPage.goto(sceneUrl),
					ownerRealtimePublisher.goto(baseURL!)
				]);
				const actualFrontendAPIRequest = await frontendSceneRequest;
				expect(new URL(actualFrontendAPIRequest.url()).origin).toBe(new URL(apiBase).origin);
				await Promise.all([
					expect(ownerPage.locator('canvas').first()).toBeVisible({ timeout: 30_000 }),
					expect(playerPage.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
				]);

				const tokenData: Omit<Token, 'id'> = {
					name: 'Token de teste ao vivo',
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
				const tokenCreate = await ownerApi.post(`/api/v1/scenes/${scene.id}/tokens`, {
					data: tokenData
				});
				expect(tokenCreate.status()).toBe(201);
				const token = (await tokenCreate.json()) as Token;
				const playerMapErrors: string[] = [];
				let duplicateTokenReads = 0;
				playerPage.on('pageerror', (error) => playerMapErrors.push(error.message));
				playerPage.on('request', (request) => {
					if (
						request.method() === 'GET' &&
						request.url() === new URL(`/api/v1/scenes/${scene.id}/tokens/${token.id}`, apiBase).href
					)
						duplicateTokenReads += 1;
				});

				const visibleToken = await playerApi.get(`/api/v1/scenes/${scene.id}/tokens/${token.id}`);
				expect(visibleToken.status()).toBe(200);
				logCacheDiagnostics(visibleToken);
				expect((await visibleToken.json()).name).toBe(token.name);

				const changedToken = { ...tokenData, id: token.id, x: 4, y: 3 };
				const updateResponse = await ownerApi.patch(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}`,
					{ data: changedToken }
				);
				expect(updateResponse.ok()).toBeTruthy();
				logCacheDiagnostics(updateResponse);
				expect(await updateResponse.json()).toMatchObject({ x: 4, y: 3 });

				const directTokenResponse = await ownerApi.get(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}`
				);
				expect(directTokenResponse.status()).toBe(200);
				logCacheDiagnostics(directTokenResponse);
				expect(await directTokenResponse.json()).toMatchObject({ x: 4, y: 3 });
				const playerDirectTokenResponse = await playerApi!.get(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}`
				);
				expect(playerDirectTokenResponse.status()).toBe(200);
				logCacheDiagnostics(playerDirectTokenResponse);
				expect(await playerDirectTokenResponse.json()).toMatchObject({ x: 4, y: 3 });

				const realtimeReads = await publishAndReadToken(
					ownerRealtimePublisher,
					playerPage,
					ownerPage,
					scene.id,
					token.id
				);
				const movedToken = realtimeReads.reader;
				expect(movedToken.status()).toBe(200);
				logCacheDiagnostics(movedToken);
				expect(await movedToken.json()).toMatchObject({ x: 4, y: 3 });
				expect(realtimeReads.reconciler.status()).toBe(200);
				logCacheDiagnostics(realtimeReads.reconciler);
				expect(await realtimeReads.reconciler.json()).toMatchObject({ x: 4, y: 3 });

				// Back-to-back invalidations can make the same id arrive more than once
				// while list-based scene state is being reconciled.
				const readsBeforeDuplicateEvents = duplicateTokenReads;
				await Promise.all([
					publishTokenInvalidation(ownerRealtimePublisher, scene.id, token.id),
					publishTokenInvalidation(ownerRealtimePublisher, scene.id, token.id)
				]);
				await expect
					.poll(() => duplicateTokenReads - readsBeforeDuplicateEvents, { timeout: 15_000 })
					.toBeGreaterThanOrEqual(2);
				const workspaceNavigation = playerPage.getByRole('navigation', {
					name: /Áreas da mesa|Table areas/
				});
				await workspaceNavigation
					.getByRole('button', { name: /Fichas|Sheets/, exact: true })
					.click();
				await workspaceNavigation.getByRole('button', { name: /Mesa|Table/, exact: true }).click();
				await expect(playerPage.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
				expect(playerMapErrors.filter((message) => /each_key_duplicate/.test(message))).toEqual([]);

				const hideResponse = await ownerApi.patch(`/api/v1/scenes/${scene.id}/tokens/${token.id}`, {
					data: { ...changedToken, hidden: true }
				});
				expect(hideResponse.ok()).toBeTruthy();
				logCacheDiagnostics(hideResponse);
				expect(await hideResponse.json()).toMatchObject({ x: 4, y: 3, hidden: true });
				const hiddenDirectResponse = await ownerApi.get(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}`
				);
				expect(hiddenDirectResponse.status()).toBe(200);
				logCacheDiagnostics(hiddenDirectResponse);
				expect(await hiddenDirectResponse.json()).toMatchObject({ x: 4, y: 3, hidden: true });
				const hiddenPlayerDirectResponse = await playerApi!.get(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}`
				);
				expect(hiddenPlayerDirectResponse.status()).toBe(404);
				logCacheDiagnostics(hiddenPlayerDirectResponse);

				const ownedHPUpdate = await playerApi!.patch(
					`/api/v1/scenes/${scene.id}/tokens/${playerOwnedToken.id}/hit-points`,
					{ data: { delta: -3 } }
				);
				expect(ownedHPUpdate.status()).toBe(200);
				expect(await ownedHPUpdate.json()).toMatchObject({ hpCurrent: 9, hpMax: 12 });
				const hpRealtimeReads = await publishAndReadToken(
					playerPage,
					ownerPage,
					playerPage,
					scene.id,
					playerOwnedToken.id
				);
				expect(hpRealtimeReads.reader.status()).toBe(200);
				expect(await hpRealtimeReads.reader.json()).toMatchObject({ hpCurrent: 9 });
				expect(hpRealtimeReads.reconciler.status()).toBe(200);
				expect(await hpRealtimeReads.reconciler.json()).toMatchObject({ hpCurrent: 9 });
				const linkedSheetResponse = await playerApi!.get(
					`/api/v1/campaigns/${campaignId}/character`
				);
				expect(linkedSheetResponse.ok()).toBeTruthy();
				expect(await linkedSheetResponse.json()).toMatchObject({
					sheet: { name: 'Ficha E2E de jogador', hitPointsCurrent: 9, hitPointsMax: 12 }
				});
				const unrelatedTokenHPUpdate = await playerApi!.patch(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}/hit-points`,
					{ data: { delta: -1 } }
				);
				expect(unrelatedTokenHPUpdate.status()).toBe(403);
			}
		} finally {
			if (ownerContext) await ownerContext.close();
			if (playerContext) await playerContext.close();
			await playerApi?.dispose();
			if (campaignId) {
				const deletion = await ownerApi.delete(`/api/v1/campaigns/${campaignId}`);
				expect(deletion.status()).toBe(204);
				const remaining = await ownerApi.get('/api/v1/campaigns');
				expect(remaining.ok()).toBeTruthy();
				const campaigns = (await remaining.json()) as { campaigns: Campaign[] };
				expect(campaigns.campaigns.some((item) => item.id === campaignId)).toBeFalsy();
			}
			await ownerApi.dispose();
		}
	});
});
