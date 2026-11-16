import { expect, test } from '@playwright/test';
import {
	createLocalAuthenticatedFixture,
	createSilentWav,
	localStackEnabled
} from './local-authenticated.helpers';

async function attachSanitizedStorageResponse(
	testInfo: import('@playwright/test').TestInfo,
	response: import('@playwright/test').Response,
	objectPath: string
) {
	const payload = await response.json().catch(() => null);
	const allowedKeys = new Set([
		'Key',
		'Id',
		'key',
		'id',
		'status',
		'statusCode',
		'error',
		'message'
	]);
	const sanitizedPayload =
		payload && typeof payload === 'object' && !Array.isArray(payload)
			? Object.fromEntries(
					Object.entries(payload)
						.filter(
							([key, value]) => allowedKeys.has(key) && ['string', 'number'].includes(typeof value)
						)
						.map(([key, value]) => [
							key,
							typeof value === 'string'
								? value
										.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
										.replace(
											/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
											'[REDACTED_JWT]'
										)
										.slice(0, 300)
								: value
						])
				)
			: null;
	await testInfo.attach('storage-upload-response-sanitized.json', {
		contentType: 'application/json',
		body: Buffer.from(
			JSON.stringify(
				{
					status: response.status(),
					objectName: objectPath.split('/').at(-1),
					body: sanitizedPayload
				},
				null,
				2
			)
		)
	});
}

test('Storage keeps the original audio filename metadata after reclassification', async ({
	browser
}, testInfo) => {
	expect(localStackEnabled, 'This check must run against the isolated local Supabase stack').toBe(
		true
	);

	const originalFileName = 'Canção — Noite & Chuva (1).wav';
	let fixture: Awaited<ReturnType<typeof createLocalAuthenticatedFixture>> | undefined;
	let storagePath: string | undefined;
	const cleanupPaths = new Set<string>();
	const infoResponses = new Map<string, import('@playwright/test').Response>();

	try {
		fixture = await createLocalAuthenticatedFixture(browser, true, 32_000);
		const bucketResponse = await fixture.admin.get('/storage/v1/bucket/campaign-assets');
		expect(bucketResponse.ok()).toBeTruthy();
		expect(((await bucketResponse.json()) as { public: boolean }).public).toBe(false);

		const page = fixture.gm;
		page.on('response', (response) => {
			try {
				const pathname = new URL(response.url()).pathname;
				const infoPrefix = '/storage/v1/object/info/campaign-assets/';
				if (pathname.startsWith(infoPrefix)) {
					infoResponses.set(decodeURIComponent(pathname.slice(infoPrefix.length)), response);
				}
			} catch {
				// Ignore non-URL responses from the browser event stream.
			}
		});

		await page.goto(`/?campaign=${fixture.campaignId}&scene=${fixture.sceneId}`);
		await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
		await page.getByRole('button', { name: 'Mídias', exact: true }).click();
		await expect(
			page.getByTestId('audio-asset-card').filter({ hasText: 'e2e-music-old-' })
		).toHaveCount(1);

		const uploadResponsePromise = page.waitForResponse((response) => {
			const request = response.request();
			if (request.method() !== 'POST') return false;
			try {
				return new URL(response.url()).pathname.startsWith(
					`/storage/v1/object/campaign-assets/campaigns/${fixture!.campaignId}/media/`
				);
			} catch {
				return false;
			}
		});
		await page.locator('input[type="file"]').setInputFiles({
			name: originalFileName,
			mimeType: 'audio/wav',
			buffer: createSilentWav(32_000)
		});
		const uploadResponse = await uploadResponsePromise;
		const uploadPathname = decodeURIComponent(new URL(uploadResponse.url()).pathname);
		const uploadPrefix = '/storage/v1/object/campaign-assets/';
		const uploadPrefixIndex = uploadPathname.indexOf(uploadPrefix);
		if (uploadPrefixIndex >= 0) {
			cleanupPaths.add(uploadPathname.slice(uploadPrefixIndex + uploadPrefix.length));
		}
		if (!uploadResponse.ok()) {
			await attachSanitizedStorageResponse(
				testInfo,
				uploadResponse,
				uploadPathname.slice(uploadPrefixIndex + uploadPrefix.length)
			);
		}
		expect(uploadResponse.ok(), `Storage upload returned HTTP ${uploadResponse.status()}`).toBe(
			true
		);
		expect(uploadPathname.startsWith(uploadPrefix)).toBe(true);
		storagePath = uploadPathname.slice(uploadPrefix.length);
		cleanupPaths.add(storagePath);
		const originalObjectName = storagePath.split('/').at(-1)!;
		expect(storagePath.startsWith(`campaigns/${fixture.campaignId}/media/`)).toBe(true);
		const objectUuid = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/.exec(
			originalObjectName
		)?.[1];
		if (objectUuid) {
			cleanupPaths.add(
				`campaigns/${fixture.campaignId}/media/${objectUuid}-effect_once__audio.wav`
			);
		}
		expect(originalObjectName).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-music_loop__audio\.wav$/
		);
		expect(
			[...originalObjectName].every((character) => (character.codePointAt(0) ?? 0) < 128)
		).toBe(true);
		expect(originalObjectName).not.toContain(originalFileName);

		const legacyCard = page.getByTestId('audio-asset-card').filter({ hasText: 'e2e-music-old-' });
		await expect(legacyCard).toHaveCount(1);
		await expect(page.getByText('1 mídia(s) adicionada(s).', { exact: true })).toBeVisible();
		const uploadedCard = page.getByTestId('audio-asset-card').filter({ hasText: originalFileName });
		try {
			await expect(uploadedCard).toBeVisible();
		} catch (error) {
			await attachSanitizedStorageResponse(testInfo, uploadResponse, storagePath);
			throw error;
		}
		await expect(uploadedCard.locator('audio')).toHaveAttribute(
			'aria-label',
			`Controles da faixa: ${originalFileName}`
		);

		await expect.poll(() => infoResponses.has(storagePath!), { timeout: 15_000 }).toBe(true);
		const uploadedInfoResponse = infoResponses.get(storagePath)!;
		expect(uploadedInfoResponse.ok()).toBeTruthy();
		const uploadedInfo = (await uploadedInfoResponse.json()) as {
			metadata?: { originalFileName?: string };
		};
		expect(uploadedInfo.metadata?.originalFileName).toBe(originalFileName);

		infoResponses.clear();
		await page.reload();
		await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
		await expect.poll(() => infoResponses.has(storagePath!), { timeout: 15_000 }).toBe(true);
		const musicOption = page
			.locator('.music-player select option')
			.filter({ hasText: originalFileName });
		await expect(musicOption).toHaveCount(1);

		await page.getByRole('button', { name: 'Mídias', exact: true }).click();
		const reclassifyResponsePromise = page.waitForResponse((response) => {
			const request = response.request();
			return (
				request.method() === 'PUT' &&
				new URL(response.url()).pathname ===
					`/api/v1/campaigns/${fixture!.campaignId}/assets/audio-kind`
			);
		});
		await page.getByLabel(`Tipo do áudio: ${originalFileName}`).selectOption('effect');
		const reclassifyResponse = await reclassifyResponsePromise;
		expect(reclassifyResponse.ok()).toBeTruthy();
		const reclassified = (await reclassifyResponse.json()) as {
			path: string;
			kind: 'music' | 'effect';
			looping: boolean;
		};
		storagePath = reclassified.path;
		cleanupPaths.add(storagePath);
		expect(reclassified.kind).toBe('effect');
		expect(reclassified.looping).toBe(false);
		const reclassifiedObjectName = storagePath.split('/').at(-1)!;
		expect(reclassifiedObjectName).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-effect_once__audio\.wav$/
		);

		const reclassifiedCard = page
			.getByTestId('audio-asset-card')
			.filter({ hasText: originalFileName });
		await expect(reclassifiedCard).toBeVisible();
		await expect(reclassifiedCard.locator('audio')).toHaveAttribute(
			'aria-label',
			`Controles da faixa: ${originalFileName}`
		);
		await expect.poll(() => infoResponses.has(storagePath!), { timeout: 15_000 }).toBe(true);
		const reclassifiedInfoResponse = infoResponses.get(storagePath)!;
		expect(reclassifiedInfoResponse.ok()).toBeTruthy();
		const reclassifiedInfo = (await reclassifiedInfoResponse.json()) as {
			metadata?: { originalFileName?: string };
		};
		expect(reclassifiedInfo.metadata?.originalFileName).toBe(originalFileName);

		await page.reload();
		await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
		const effectOption = page
			.locator('.effects-player select option')
			.filter({ hasText: originalFileName });
		await expect(effectOption).toHaveCount(1);
	} finally {
		if (fixture) {
			try {
				if (cleanupPaths.size > 0) {
					const cleanup = await fixture.admin.delete('/storage/v1/object/campaign-assets', {
						data: { prefixes: [...cleanupPaths] }
					});
					expect(cleanup.ok()).toBeTruthy();
				}
			} finally {
				await fixture.close();
			}
		}
	}
});
