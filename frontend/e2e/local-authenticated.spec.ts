import { expect, test } from '@playwright/test';
import {
	createLocalAuthenticatedFixture,
	expectNoStore,
	localStackEnabled,
	publishAndReadToken
} from './local-authenticated.helpers';

test.describe('local authenticated authorization E2E', () => {
	test.skip(!localStackEnabled, 'Runs only against the isolated local Supabase stack in CI.');

	test('GM campaign permissions and player token realtime reads fresh state', async ({
		browser
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'chromium',
			'The authenticated API integration runs once on desktop.'
		);
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('preparation and independent local users', async () => {
				fixture = await createLocalAuthenticatedFixture(browser);
			});
			const f = fixture!;
			let ownedTokenId = '';
			await test.step('campaign authorization and linked character setup', async () => {
				const forbidden = await f.playerApi.patch(`/api/v1/campaigns/${f.campaignId}`, {
					data: { name: 'Unauthorized change' }
				});
				expect(forbidden.status()).toBe(403);
				const created = await f.gmApi.post(`/api/v1/campaigns/${f.campaignId}/characters`, {
					data: { ownerId: f.playerUserId }
				});
				expect(created.status()).toBe(201);
				const character = (await created.json()) as { id: string; sheet: Record<string, unknown> };
				const saved = await f.gmApi.put(
					`/api/v1/campaigns/${f.campaignId}/characters/${character.id}`,
					{
						data: {
							...character.sheet,
							name: 'Ficha E2E de jogador',
							hitPointsCurrent: 12,
							hitPointsMax: 12
						}
					}
				);
				expect(saved.ok()).toBeTruthy();
				const linked = await f.gmApi.post(`/api/v1/scenes/${f.sceneId}/tokens/from-character`, {
					data: { actorId: character.id }
				});
				expect(linked.status()).toBe(201);
				ownedTokenId = ((await linked.json()) as { id: string }).id;
			});
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
			const token = await test.step('create token and verify initial no-store reads', async () => {
				const response = await f.gmApi.post(`/api/v1/scenes/${f.sceneId}/tokens`, {
					data: tokenData
				});
				expect(response.status()).toBe(201);
				const created = (await response.json()) as { id: string };
				const playerRead = await f.playerApi.get(
					`/api/v1/scenes/${f.sceneId}/tokens/${created.id}`
				);
				expect(playerRead.status()).toBe(200);
				expectNoStore(playerRead);
				return created;
			});
			await test.step('persist movement, direct fresh reads, then realtime invalidation', async () => {
				const moved = { ...tokenData, id: token.id, x: 4, y: 3 };
				const patch = await f.gmApi.patch(`/api/v1/scenes/${f.sceneId}/tokens/${token.id}`, {
					data: moved
				});
				expect(patch.status()).toBe(200);
				expectNoStore(patch);
				expect(await patch.json()).toMatchObject({ x: 4, y: 3 });
				for (const api of [f.gmApi, f.playerApi]) {
					const read = await api.get(`/api/v1/scenes/${f.sceneId}/tokens/${token.id}`);
					expect(read.status()).toBe(200);
					expectNoStore(read);
					expect(await read.json()).toMatchObject({ x: 4, y: 3 });
				}
				const sceneUrl = `/?campaign=${f.campaignId}&scene=${f.sceneId}`;
				await Promise.all([f.gm.goto(sceneUrl), f.player.goto(sceneUrl)]);
				await Promise.all([
					expect(f.gm.locator('canvas').first()).toBeVisible(),
					expect(f.player.locator('canvas').first()).toBeVisible()
				]);
				const realtime = await publishAndReadToken(
					f.gmPublisher,
					f.player,
					f.gm,
					f.sceneId,
					token.id
				);
				expect(realtime.reader.status()).toBe(200);
				expectNoStore(realtime.reader);
				expect(await realtime.reader.json()).toMatchObject({ x: 4, y: 3 });
				expect(realtime.reconciler.status()).toBe(200);
				expectNoStore(realtime.reconciler);
				expect(await realtime.reconciler.json()).toMatchObject({ x: 4, y: 3 });
			});
			await test.step('hidden token and owner-only hit point permissions', async () => {
				const moved = { ...tokenData, id: token.id, x: 4, y: 3 };
				const hidden = await f.gmApi.patch(`/api/v1/scenes/${f.sceneId}/tokens/${token.id}`, {
					data: { ...moved, hidden: true }
				});
				expect(hidden.status()).toBe(200);
				expect(await hidden.json()).toMatchObject({ x: 4, y: 3, hidden: true });
				const direct = await f.playerApi.get(`/api/v1/scenes/${f.sceneId}/tokens/${token.id}`);
				expect(direct.status()).toBe(404);
				expectNoStore(direct);
				const hp = await f.playerApi.patch(
					`/api/v1/scenes/${f.sceneId}/tokens/${ownedTokenId}/hit-points`,
					{ data: { delta: -3 } }
				);
				expect(hp.status()).toBe(200);
				expect(await hp.json()).toMatchObject({ hpCurrent: 9, hpMax: 12 });
				const realtime = await publishAndReadToken(
					f.gmPublisher,
					f.player,
					f.gm,
					f.sceneId,
					ownedTokenId
				);
				expect(await realtime.reader.json()).toMatchObject({ hpCurrent: 9 });
				expect(await realtime.reconciler.json()).toMatchObject({ hpCurrent: 9 });
				const linkedSheet = await f.playerApi.get(`/api/v1/campaigns/${f.campaignId}/character`);
				expect(linkedSheet.ok()).toBeTruthy();
				expect(await linkedSheet.json()).toMatchObject({
					sheet: { name: 'Ficha E2E de jogador', hitPointsCurrent: 9, hitPointsMax: 12 }
				});
				const forbiddenHp = await f.playerApi.patch(
					`/api/v1/scenes/${f.sceneId}/tokens/${token.id}/hit-points`,
					{ data: { delta: -1 } }
				);
				expect(forbiddenHp.status()).toBe(403);
			});
		} finally {
			await fixture?.close();
		}
	});
});
