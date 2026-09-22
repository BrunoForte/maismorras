import { readFile } from 'node:fs/promises';
import {
	expect,
	request as playwrightRequest,
	test,
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

async function accessToken(storageStatePath: string): Promise<string> {
	const state = JSON.parse(await readFile(storageStatePath, 'utf8')) as {
		origins?: { localStorage?: { name: string; value: string }[] }[];
	};
	for (const origin of state.origins ?? []) {
		for (const entry of origin.localStorage ?? []) {
			if (!entry.name.includes('auth-token')) continue;
			const saved = JSON.parse(entry.value) as {
				access_token?: string;
				currentSession?: { access_token?: string };
			};
			const token = saved.access_token ?? saved.currentSession?.access_token;
			if (token) return token;
		}
	}
	throw new Error(`No Supabase access token found in ${storageStatePath}.`);
}

async function apiFor(storageStatePath: string) {
	return playwrightRequest.newContext({
		baseURL: apiBase,
		extraHTTPHeaders: { Authorization: `Bearer ${await accessToken(storageStatePath)}` }
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

test.describe('disposable authenticated campaign and realtime token flow', () => {
	test.skip(!ownerStatePath, 'Configure E2E_STORAGE_STATE with a dedicated narrator account.');

	test('creates a disposable campaign, synchronizes a token, and deletes the campaign', async ({
		browser,
		baseURL
	}) => {
		const ownerApi = await apiFor(ownerStatePath!);
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
				playerApi = await apiFor(playerStatePath);
				const inviteResponse = await ownerApi.post(`/api/v1/campaigns/${campaignId}/invites`, {
					data: {}
				});
				expect(inviteResponse.status()).toBe(201);
				const invite = (await inviteResponse.json()) as { code: string };
				const joinResponse = await playerApi.post(`/api/v1/invites/${invite.code}/accept`, {
					data: {}
				});
				expect(joinResponse.ok()).toBeTruthy();

				ownerContext = await browser.newContext({ storageState: ownerStatePath });
				playerContext = await browser.newContext({ storageState: playerStatePath });
				const ownerPage = await ownerContext.newPage();
				const playerPage = await playerContext.newPage();
				const sceneUrl = `${baseURL}/?campaign=${campaignId}&scene=${scene.id}`;
				await Promise.all([ownerPage.goto(sceneUrl), playerPage.goto(sceneUrl)]);
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

				const visibleTokenResponse = playerPage.waitForResponse(
					(response) => response.url().endsWith(`/api/v1/scenes/${scene.id}/tokens/${token.id}`),
					{ timeout: 15_000 }
				);
				await publishTokenInvalidation(ownerPage, scene.id, token.id);
				const visibleToken = await visibleTokenResponse;
				expect(visibleToken.status()).toBe(200);
				expect((await visibleToken.json()).name).toBe(token.name);

				const changedToken = { ...tokenData, id: token.id, x: 4, y: 3 };
				const updateResponse = await ownerApi.patch(
					`/api/v1/scenes/${scene.id}/tokens/${token.id}`,
					{ data: changedToken }
				);
				expect(updateResponse.ok()).toBeTruthy();
				const movedTokenResponse = playerPage.waitForResponse(
					(response) => response.url().endsWith(`/api/v1/scenes/${scene.id}/tokens/${token.id}`),
					{ timeout: 15_000 }
				);
				await publishTokenInvalidation(ownerPage, scene.id, token.id);
				const movedToken = await movedTokenResponse;
				expect(movedToken.status()).toBe(200);
				expect(await movedToken.json()).toMatchObject({ x: 4, y: 3 });

				const hideResponse = await ownerApi.patch(`/api/v1/scenes/${scene.id}/tokens/${token.id}`, {
					data: { ...changedToken, hidden: true }
				});
				expect(hideResponse.ok()).toBeTruthy();
				const hiddenTokenResponse = playerPage.waitForResponse(
					(response) => response.url().endsWith(`/api/v1/scenes/${scene.id}/tokens/${token.id}`),
					{ timeout: 15_000 }
				);
				await publishTokenInvalidation(ownerPage, scene.id, token.id);
				expect((await hiddenTokenResponse).status()).toBe(404);
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
