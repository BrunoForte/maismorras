import { expect, test } from '@playwright/test';
import {
	audioSnapshot,
	createLocalAuthenticatedFixture,
	localStackEnabled,
	sendAudioRevision,
	type AudioObservation,
	type AudioRealtimeRecord
} from './local-authenticated.helpers';

test.describe('local authenticated audio E2E', () => {
	test.skip(!localStackEnabled, 'Runs only against the isolated local Supabase stack in CI.');

	test('library audio tracks stay below their title/actions and remain usable on desktop and mobile', async ({
		browser
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'chromium',
			'The authenticated browser flow runs once on Chromium.'
		);
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('prepare a campaign with isolated, seekable audio assets', async () => {
				fixture = await createLocalAuthenticatedFixture(browser, true, 32_000);
				await fixture.gm.goto(`/?campaign=${fixture.campaignId}&scene=${fixture.sceneId}`);
				await expect(fixture.gm.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
				await fixture.gm.getByRole('button', { name: 'Mídias', exact: true }).click();
				await expect(fixture.gm.getByTestId('audio-asset-card')).toHaveCount(4);
			});
			const page = fixture!.gm;
			// The persistent chat is intentionally allowed to float over other tabs;
			// collapse it explicitly so this scenario exercises the native media controls.
			const chat = page.locator('.floating-chat');
			if (!(await chat.evaluate((node) => node.classList.contains('closed')))) {
				await chat.getByRole('button', { name: 'Chat da mesa' }).click();
				await expect(chat).toHaveClass(/closed/);
			}
			const groups = page.locator('.audio-groups > .media-group');
			const musicGroup = groups.nth(0);
			const effectsGroup = groups.nth(1);
			await test.step('verify desktop columns and non-overlapping title/actions and track rows', async () => {
				await expect(musicGroup.getByRole('heading', { name: 'Músicas' })).toBeVisible();
				await expect(effectsGroup.getByRole('heading', { name: 'Efeitos sonoros' })).toBeVisible();
				const musicBox = await musicGroup.boundingBox();
				const effectsBox = await effectsGroup.boundingBox();
				expect(musicBox).not.toBeNull();
				expect(effectsBox).not.toBeNull();
				expect(musicBox!.x).toBeLessThan(effectsBox!.x);
				for (const card of await page.getByTestId('audio-asset-card').all()) {
					const footer = await card.locator('.asset-footer').boundingBox();
					const track = await card.locator('audio').boundingBox();
					const cardBox = await card.boundingBox();
					expect(footer).not.toBeNull();
					expect(track).not.toBeNull();
					expect(track!.y).toBeGreaterThanOrEqual(footer!.y + footer!.height);
					expect(track!.x).toBeGreaterThanOrEqual(cardBox!.x);
					expect(track!.x + track!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
				}
			});
			const firstMusic = musicGroup.getByTestId('audio-asset-card').first();
			const track = firstMusic.locator('audio');
			const name = (await track.getAttribute('aria-label'))!.replace('Controles da faixa: ', '');
			await test.step('seek the track independently and exercise every audio item action', async () => {
				await track.evaluate((audio) =>
					audio.scrollIntoView({ block: 'center', inline: 'center' })
				);
				await expect
					.poll(() => track.evaluate((audio) => (audio as HTMLAudioElement).readyState))
					.toBeGreaterThanOrEqual(1);
				const duration = await track.evaluate((audio) => (audio as HTMLAudioElement).duration);
				expect(duration).toBeGreaterThan(3);
				const trackBox = await track.boundingBox();
				expect(trackBox).not.toBeNull();
				await track.evaluate((audio) => {
					audio.addEventListener(
						'play',
						() => ((audio as HTMLAudioElement).dataset.e2ePlayControlUsed = 'true'),
						{ once: true }
					);
				});
				await track.click({ position: { x: 16, y: trackBox!.height / 2 } });
				await expect
					.poll(() =>
						track.evaluate((audio) => (audio as HTMLAudioElement).dataset.e2ePlayControlUsed)
					)
					.toBe('true');
				await track.evaluate((audio) => (audio as HTMLAudioElement).pause());
				const startX = trackBox!.x + trackBox!.width * 0.44;
				const endX = trackBox!.x + trackBox!.width * 0.62;
				const centerY = trackBox!.y + trackBox!.height / 2;
				await page.mouse.move(startX, centerY);
				await page.mouse.down();
				await page.mouse.move(endX, centerY, { steps: 3 });
				await page.mouse.up();
				await expect
					.poll(() => track.evaluate((audio) => (audio as HTMLAudioElement).currentTime))
					.toBeGreaterThan(1);

				const kind = firstMusic.getByLabel(`Tipo do áudio: ${name}`);
				await kind.selectOption('effect');
				await expect(effectsGroup.getByText(name, { exact: false })).toBeVisible();
				const trackSelector = `audio[aria-label="Controles da faixa: ${name}"]`;
				const movedCard = effectsGroup
					.getByTestId('audio-asset-card')
					.filter({ has: page.locator(trackSelector) });
				const loop = movedCard.getByLabel(`Repetir em loop: ${name}`);
				await loop.check();
				await expect(loop).toBeChecked();
				await loop.uncheck();
				await expect(loop).not.toBeChecked();
				await movedCard.getByRole('button', { name: `Gerenciar acesso a ${name}` }).click();
				await expect(page.getByRole('dialog')).toBeVisible();
				await page.getByRole('button', { name: 'Fechar', exact: true }).click();
				page.once('dialog', (dialog) => void dialog.dismiss());
				await movedCard.getByRole('button', { name: `Excluir ${name}` }).click();
				await expect(movedCard).toBeVisible();
				await expect(movedCard.locator('audio')).toBeVisible();
			});
			await test.step('stack music/effects on narrow screens without putting the track above controls', async () => {
				await page.setViewportSize({ width: 390, height: 844 });
				const narrowMusic = page.locator('.audio-groups > .media-group').filter({
					has: page.getByRole('heading', { name: 'Músicas' })
				});
				const narrowEffects = page.locator('.audio-groups > .media-group').filter({
					has: page.getByRole('heading', { name: 'Efeitos sonoros' })
				});
				const musicRect = await narrowMusic.boundingBox();
				const effectsRect = await narrowEffects.boundingBox();
				expect(musicRect).not.toBeNull();
				expect(effectsRect).not.toBeNull();
				expect(effectsRect!.y).toBeGreaterThan(musicRect!.y);
				expect(Math.abs(effectsRect!.x - musicRect!.x)).toBeLessThan(2);
				const movedTrackCard = page
					.getByTestId('audio-asset-card')
					.filter({ has: page.locator(`audio[aria-label="Controles da faixa: ${name}"]`) });
				const footer = await movedTrackCard.locator('.asset-footer').boundingBox();
				const trackRect = await movedTrackCard.locator('audio').boundingBox();
				expect(trackRect!.y).toBeGreaterThanOrEqual(footer!.y + footer!.height);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('music selection is pending until Play and syncs the committed crossfade to player and overlay', async ({
		browser
	}, testInfo) => {
		test.setTimeout(60_000);
		test.skip(
			testInfo.project.name !== 'chromium',
			'The authenticated API integration runs once on desktop.'
		);
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('preparation and isolated campaign/assets', async () => {
				fixture = await createLocalAuthenticatedFixture(browser, true);
			});
			const f = fixture!;
			const audio = await test.step('open GM, player and paired overlay', () => f.startAudio());
			const controls = audio.gm.locator('.music-player');
			const select = controls.locator('select');
			const initial = `${audio.mediaPrefix}${audio.names.musicInitial}`;
			const replacement = `${audio.mediaPrefix}${audio.names.musicReplacement}`;
			await test.step('start music and confirm listeners receive authorized playback', async () => {
				await select.selectOption(initial);
				const response = audio.gm.waitForResponse(
					(item) =>
						item.url().endsWith(`/api/v1/scenes/${audio.sceneId}/audio`) &&
						item.request().method() === 'PUT' &&
						(item.request().postDataJSON() as { channel?: string }).channel === 'music'
				);
				await controls.getByRole('button', { name: 'Tocar', exact: true }).click();
				expect((await response).status()).toBe(200);
				await expect
					.poll(() => hasEvent(audio.playerAudio, 'audio.state', initial, 1), { timeout: 12_000 })
					.toBe(true);
				await expect
					.poll(() => hasEvent(audio.overlayAudio, 'audio.state', initial, 1), { timeout: 12_000 })
					.toBe(true);
				await expect
					.poll(() => hasSignedRequest(audio.playerAudio, initial), { timeout: 12_000 })
					.toBe(true);
				await expect
					.poll(() => hasSignedRequest(audio.overlayAudio, initial, 'overlay'), { timeout: 12_000 })
					.toBe(true);
				await expect(
					audio.overlay.getByRole('button', { name: /ativar o áudio da transmissão/i })
				).toBeVisible();
				await audio.overlay.getByRole('button', { name: /ativar o áudio da transmissão/i }).click();
			});
			await test.step('selection and suggested-loop edits do not execute playback', async () => {
				const beforeGm = await audioSnapshot(audio.gm);
				const baseline = {
					puts: audio.gmAudio.puts.length,
					signedRequests: audio.gmAudio.signedRequests.length,
					gmEvents: audio.gmAudio.events.length,
					playerEvents: audio.playerAudio.events.length,
					overlayEvents: audio.overlayAudio.events.length
				};
				await select.selectOption(replacement);
				await expect(controls.locator('.loop-control input')).toBeChecked();
				await controls.locator('.loop-control input').uncheck();
				await expect(controls.locator('.track-state')).toContainText(
					audio.displayNames.musicReplacement
				);
				await expect(controls.locator('.track-state')).toContainText(
					audio.displayNames.musicInitial
				);
				await audio.gm.waitForTimeout(150);
				expect(audio.gmAudio.puts).toHaveLength(baseline.puts);
				expect(audio.gmAudio.signedRequests).toHaveLength(baseline.signedRequests);
				expect(audio.gmAudio.events).toHaveLength(baseline.gmEvents);
				expect(audio.playerAudio.events).toHaveLength(baseline.playerEvents);
				expect(audio.overlayAudio.events).toHaveLength(baseline.overlayEvents);
				const afterGm = await audioSnapshot(audio.gm);
				expect(afterGm.elements.map((item) => item.path)).toEqual(
					beforeGm.elements.map((item) => item.path)
				);
				expect(afterGm.operations).toHaveLength(beforeGm.operations.length);
			});
			await test.step('Play persists first and only then crossfades to the new track', async () => {
				let release!: () => void;
				let reached!: () => void;
				const gate = new Promise<void>((resolve) => {
					release = resolve;
				});
				const atRequest = new Promise<void>((resolve) => {
					reached = resolve;
				});
				await audio.gm.route(`**/api/v1/scenes/${audio.sceneId}/audio`, async (route) => {
					const body = route.request().postDataJSON() as { channel?: string; path?: string };
					if (body.channel === 'music' && body.path === replacement) {
						reached();
						await gate;
					}
					await route.continue();
				});
				try {
					const response = audio.gm.waitForResponse(
						(item) =>
							item.url().endsWith(`/api/v1/scenes/${audio.sceneId}/audio`) &&
							item.request().method() === 'PUT' &&
							(item.request().postDataJSON() as { channel?: string }).channel === 'music'
					);
					await controls.getByRole('button', { name: 'Aplicar e tocar' }).click();
					await atRequest;
					const duringCommit = await audioSnapshot(audio.gm);
					expect(
						duringCommit.elements.some(
							(item) => item.path.endsWith(audio.names.musicInitial) && item.playing
						)
					).toBe(true);
					expect(
						duringCommit.operations.some(
							(item) => item.kind === 'play' && item.path.endsWith(audio.names.musicReplacement)
						)
					).toBe(false);
					release();
					expect((await response).status()).toBe(200);
				} finally {
					release();
					await audio.gm.unroute(`**/api/v1/scenes/${audio.sceneId}/audio`);
				}
				await expect
					.poll(async () => (await audioFixtureScene(f.gmApi, f.sceneId)).ambientAudioPath, {
						timeout: 10_000
					})
					.toBe(replacement);
				await expect
					.poll(() => hasEvent(audio.playerAudio, 'audio.state', replacement, 2), {
						timeout: 10_000
					})
					.toBe(true);
				await expect
					.poll(() => hasEvent(audio.overlayAudio, 'audio.state', replacement, 2), {
						timeout: 10_000
					})
					.toBe(true);
				await expect
					.poll(() => hasSignedRequest(audio.playerAudio, replacement), { timeout: 10_000 })
					.toBe(true);
				await expect
					.poll(() => hasSignedRequest(audio.overlayAudio, replacement, 'overlay'), {
						timeout: 10_000
					})
					.toBe(true);
				const operations = (await audioSnapshot(audio.gm)).operations;
				const nextPlay = operations.findIndex(
					(item) => item.kind === 'play' && item.path.endsWith(audio.names.musicReplacement)
				);
				const previousPause = operations.findIndex(
					(item) => item.kind === 'pause' && item.path.endsWith(audio.names.musicInitial)
				);
				expect(nextPlay).toBeGreaterThanOrEqual(0);
				expect(previousPause).toBeGreaterThan(nextPlay);
				for (const page of [audio.gm, audio.player, audio.overlay])
					await expect
						.poll(
							async () =>
								(await audioSnapshot(page)).elements
									.filter((item) => item.id.includes('ambient') || item.id.includes('music'))
									.filter((item) => item.playing).length
						)
						.toBe(1);
			});
			await test.step('Stop persists an authoritative fade-out for music', async () => {
				const response = audio.gm.waitForResponse(
					(item) =>
						item.url().endsWith(`/api/v1/scenes/${audio.sceneId}/audio`) &&
						item.request().method() === 'PUT' &&
						(item.request().postDataJSON() as { channel?: string; playing?: boolean }).channel ===
							'music' &&
						(item.request().postDataJSON() as { playing?: boolean }).playing === false
				);
				await controls.getByRole('button', { name: 'Parar', exact: true }).click();
				expect((await response).status()).toBe(200);
				await expect
					.poll(async () => (await audioFixtureScene(f.gmApi, audio.sceneId)).ambientAudioEnabled)
					.toBe(false);
				for (const page of [audio.gm, audio.player, audio.overlay])
					await expect
						.poll(
							async () =>
								(await audioSnapshot(page)).elements.filter(
									(item) =>
										(item.id.includes('ambient') || item.id.includes('music')) && item.playing
								).length
						)
						.toBe(0);
			});
		} finally {
			await fixture?.close();
		}
	});

	test('effects are delivered to the player and overlay, with browser gesture activation', async ({
		browser
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'chromium',
			'The authenticated API integration runs once on desktop.'
		);
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('preparation and isolated campaign/assets', async () => {
				fixture = await createLocalAuthenticatedFixture(browser, true);
			});
			const audio = await test.step('open GM, player and paired overlay', () =>
				fixture!.startAudio());
			const controls = audio.gm.locator('.effects-player');
			const initial = `${audio.mediaPrefix}${audio.names.effectInitial}`;
			const replacement = `${audio.mediaPrefix}${audio.names.effectReplacement}`;
			await test.step('start an effect and verify signed authorization for both listeners', async () => {
				await controls.locator('select').selectOption(initial);
				const response = audio.gm.waitForResponse(
					(item) =>
						item.url().endsWith(`/api/v1/scenes/${audio.sceneId}/audio`) &&
						item.request().method() === 'PUT' &&
						(item.request().postDataJSON() as { channel?: string }).channel === 'effect'
				);
				await controls.getByRole('button', { name: 'Tocar', exact: true }).click();
				expect((await response).status()).toBe(200);
				await expect
					.poll(() => hasEvent(audio.playerAudio, 'audio.effects', initial, 1), { timeout: 12_000 })
					.toBe(true);
				await expect
					.poll(() => hasEvent(audio.overlayAudio, 'audio.effects', initial, 1), {
						timeout: 12_000
					})
					.toBe(true);
				await expect
					.poll(() => hasSignedRequest(audio.playerAudio, initial), { timeout: 12_000 })
					.toBe(true);
				await expect
					.poll(() => hasSignedRequest(audio.overlayAudio, initial, 'overlay'), { timeout: 12_000 })
					.toBe(true);
				const playerEnable = audio.player
					.locator('.effects-player')
					.getByRole('button', { name: 'Ativar áudio' });
				const overlayEnable = audio.overlay.getByRole('button', {
					name: /ativar o áudio da transmissão/i
				});
				await expect(playerEnable).toBeVisible();
				await expect(overlayEnable).toBeVisible();
				await playerEnable.click();
				await overlayEnable.click();
				for (const page of [audio.gm, audio.player, audio.overlay]) {
					const snapshot = await audioSnapshot(page);
					expect(
						snapshot.elements.filter((item) => item.id.includes('effects') && item.playing)
					).toHaveLength(1);
					expect(
						snapshot.elements.filter(
							(item) => (item.id.includes('ambient') || item.id.includes('music')) && item.playing
						)
					).toHaveLength(0);
				}
			});
			await test.step('replace effect without disturbing the music channel', async () => {
				await controls.locator('select').selectOption(replacement);
				const response = audio.gm.waitForResponse(
					(item) =>
						item.url().endsWith(`/api/v1/scenes/${audio.sceneId}/audio`) &&
						item.request().method() === 'PUT' &&
						(item.request().postDataJSON() as { channel?: string }).channel === 'effect'
				);
				await controls.getByRole('button', { name: 'Aplicar e tocar' }).click();
				expect((await response).status()).toBe(200);
				await expect
					.poll(() => hasEvent(audio.playerAudio, 'audio.effects', replacement, 2), {
						timeout: 12_000
					})
					.toBe(true);
				await expect
					.poll(() => hasEvent(audio.overlayAudio, 'audio.effects', replacement, 2), {
						timeout: 12_000
					})
					.toBe(true);
				const state = await audioFixtureScene(fixture!.gmApi, audio.sceneId);
				expect(state).toMatchObject({
					ambientEffectPath: replacement,
					ambientEffectEnabled: true,
					ambientEffectRevision: 2,
					ambientAudioRevision: 0
				});
			});
		} finally {
			await fixture?.close();
		}
	});

	test('loop revisions, stale events and reconnection preserve current audio', async ({
		browser
	}, testInfo) => {
		test.setTimeout(60_000);
		test.skip(
			testInfo.project.name !== 'chromium',
			'The authenticated API integration runs once on desktop.'
		);
		let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
		try {
			await test.step('preparation and isolated campaign/assets', async () => {
				fixture = await createLocalAuthenticatedFixture(browser, true);
			});
			const f = fixture!;
			const audio = await test.step('open GM, player and paired overlay', () => f.startAudio());
			const music = audio.gm.locator('.music-player');
			const effects = audio.gm.locator('.effects-player');
			const musicPath = `${audio.mediaPrefix}${audio.names.musicInitial}`;
			const effectPath = `${audio.mediaPrefix}${audio.names.effectInitial}`;
			await test.step('start both independent channels and set per-scene looping', async () => {
				for (const [controls, path] of [
					[music, musicPath],
					[effects, effectPath]
				] as const) {
					await controls.locator('select').selectOption(path);
					const channel = controls === music ? 'music' : 'effect';
					const response = audio.gm.waitForResponse(
						(item) =>
							item.url().endsWith(`/api/v1/scenes/${audio.sceneId}/audio`) &&
							item.request().method() === 'PUT' &&
							(item.request().postDataJSON() as { channel?: string }).channel === channel
					);
					await controls.getByRole('button', { name: 'Tocar', exact: true }).click();
					expect((await response).status()).toBe(200);
				}
				await expect
					.poll(() => hasEvent(audio.playerAudio, 'audio.state', musicPath, 1), { timeout: 12_000 })
					.toBe(true);
				await expect
					.poll(() => hasEvent(audio.playerAudio, 'audio.effects', effectPath, 1), {
						timeout: 12_000
					})
					.toBe(true);
				await music.locator('.loop-control input').check();
				await effects.locator('.loop-control input').check();
				await expect
					.poll(async () => (await audioFixtureScene(f.gmApi, audio.sceneId)).ambientAudioRevision)
					.toBe(2);
				await expect
					.poll(async () => (await audioFixtureScene(f.gmApi, audio.sceneId)).ambientEffectRevision)
					.toBe(2);
				const state = await audioFixtureScene(f.gmApi, audio.sceneId);
				expect(state).toMatchObject({
					ambientAudioLoop: true,
					ambientEffectLoop: true,
					ambientAudioRevision: 2,
					ambientEffectRevision: 2
				});
				await expect
					.poll(() => hasLoopEvent(audio.playerAudio, 'audio.state', 2), { timeout: 10_000 })
					.toBe(true);
				await expect
					.poll(() => hasLoopEvent(audio.playerAudio, 'audio.effects', 2), { timeout: 10_000 })
					.toBe(true);
				await expect
					.poll(() => hasLoopEvent(audio.overlayAudio, 'audio.state', 2), { timeout: 10_000 })
					.toBe(true);
				await expect
					.poll(() => hasLoopEvent(audio.overlayAudio, 'audio.effects', 2), { timeout: 10_000 })
					.toBe(true);
				await expect(
					audio.player.locator('.effects-player').getByRole('button', { name: 'Ativar áudio' })
				).toBeVisible();
				await audio.player
					.locator('.effects-player')
					.getByRole('button', { name: 'Ativar áudio' })
					.click();
				await expect(
					audio.overlay.getByRole('button', { name: /ativar o áudio da transmissão/i })
				).toBeVisible();
				await audio.overlay.getByRole('button', { name: /ativar o áudio da transmissão/i }).click();
				await expect
					.poll(
						async () =>
							(await audioSnapshot(audio.player)).elements.filter(
								(item) => item.id.includes('effects') && item.playing
							).length,
						{ timeout: 5_000 }
					)
					.toBe(1);
				await expect
					.poll(
						async () =>
							(await audioSnapshot(audio.overlay)).elements.filter(
								(item) => item.id.includes('effects') && item.playing
							).length,
						{ timeout: 5_000 }
					)
					.toBe(1);
			});
			await test.step('ignore an old revision instead of replacing the persisted or rendered state', async () => {
				const stale: AudioRealtimeRecord = {
					type: 'audio.state',
					path: `${audio.mediaPrefix}music_once__stale.wav`,
					playing: true,
					loop: false,
					revision: 1
				};
				await sendAudioRevision(audio.gmPublisher, audio.sceneId, stale);
				await expect
					.poll(
						() =>
							audio.playerAudio.events.some(
								(event) => event.path === stale.path && event.revision === stale.revision
							),
						{ timeout: 10_000 }
					)
					.toBe(true);
				await expect
					.poll(
						() =>
							audio.overlayAudio.events.some(
								(event) => event.path === stale.path && event.revision === stale.revision
							),
						{ timeout: 10_000 }
					)
					.toBe(true);
				await audio.gm.waitForTimeout(150);
				expect((await audioFixtureScene(f.gmApi, audio.sceneId)).ambientAudioPath).toBe(musicPath);
				for (const page of [audio.gm, audio.player, audio.overlay]) {
					const snapshot = await audioSnapshot(page);
					expect(
						snapshot.elements.filter(
							(item) => (item.id.includes('ambient') || item.id.includes('music')) && item.playing
						)
					).toHaveLength(1);
					expect(
						snapshot.elements.some((item) => item.path.endsWith('music_once__stale.wav'))
					).toBe(false);
				}
			});
			await test.step('tab change and websocket reconnection do not duplicate or restart media', async () => {
				const before = await audioSnapshot(audio.player);
				const navigation = audio.player.getByRole('navigation', {
					name: /Áreas da mesa|Table areas/
				});
				await navigation.getByRole('button', { name: /Fichas|Sheets/, exact: true }).click();
				await navigation.getByRole('button', { name: /Mesa|Table/, exact: true }).click();
				const afterTab = await audioSnapshot(audio.player);
				expect(afterTab.elements.map((item) => item.path)).toEqual(
					before.elements.map((item) => item.path)
				);
				expect(
					afterTab.operations.filter((item) => item.kind === 'pause' || item.kind === 'load')
				).toHaveLength(
					before.operations.filter((item) => item.kind === 'pause' || item.kind === 'load').length
				);
				const previousSocketCount = await audio.player.evaluate((sceneId) => {
					const tracked = window as Window & { __audioE2E?: { sockets: WebSocket[] } };
					return (
						tracked.__audioE2E?.sockets.filter((socket) => {
							try {
								return new URL(socket.url).searchParams.get('sceneId') === sceneId;
							} catch {
								return false;
							}
						}).length ?? 0
					);
				}, audio.sceneId);
				const reconnected = audio.player.waitForFunction(
					({ sceneId, previousSocketCount }) => {
						const tracked = window as Window & { __audioE2E?: { sockets: WebSocket[] } };
						const sockets = (tracked.__audioE2E?.sockets ?? []).filter((socket) => {
							try {
								return new URL(socket.url).searchParams.get('sceneId') === sceneId;
							} catch {
								return false;
							}
						});
						return (
							sockets.length > previousSocketCount &&
							sockets
								.slice(previousSocketCount)
								.some((socket) => socket.readyState === WebSocket.OPEN)
						);
					},
					{ sceneId: audio.sceneId, previousSocketCount },
					{ timeout: 15_000 }
				);
				await audio.player.evaluate((sceneId) => {
					const tracked = window as Window & { __audioE2E?: { sockets: WebSocket[] } };
					const socket = tracked.__audioE2E?.sockets.find((item) => {
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
						throw new Error('Scene realtime socket was not available for reconnect validation.');
					socket.close(4000, 'audio reconnect validation');
				}, audio.sceneId);
				await reconnected;
				await audio.player.waitForTimeout(300);
				const afterReconnect = await audioSnapshot(audio.player);
				expect(afterReconnect.elements.map((item) => item.path)).toEqual(
					afterTab.elements.map((item) => item.path)
				);
				expect(
					afterReconnect.operations.filter((item) => item.kind === 'pause' || item.kind === 'load')
				).toHaveLength(
					afterTab.operations.filter((item) => item.kind === 'pause' || item.kind === 'load').length
				);
				expect(
					afterReconnect.elements.filter(
						(item) => (item.id.includes('ambient') || item.id.includes('music')) && item.playing
					)
				).toHaveLength(1);
				expect(
					afterReconnect.elements.filter((item) => item.id.includes('effects') && item.playing)
				).toHaveLength(1);
			});
		} finally {
			await fixture?.close();
		}
	});
});

async function audioFixtureScene(
	api: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>>['gmApi'],
	sceneId: string
) {
	const response = await api.get(`/api/v1/scenes/${sceneId}`);
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
}

function hasEvent(
	observation: AudioObservation,
	type: AudioRealtimeRecord['type'],
	path: string,
	revision: number
) {
	return observation.events.some(
		(event) => event.type === type && event.path === path && event.revision === revision
	);
}
function hasLoopEvent(
	observation: AudioObservation,
	type: AudioRealtimeRecord['type'],
	revision: number
) {
	return observation.events.some(
		(event) => event.type === type && event.loop === true && event.revision === revision
	);
}
function hasSignedRequest(observation: AudioObservation, path: string, surface?: string) {
	return observation.signedRequests.some(
		(request) =>
			request.path === path && request.status === 200 && (!surface || request.surface === surface)
	);
}
