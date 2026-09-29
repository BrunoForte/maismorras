import { randomBytes } from 'node:crypto';
import { expect, request as playwrightRequest, test } from '@playwright/test';

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

test.describe('local authenticated authorization E2E', () => {
	test.skip(!localStackEnabled, 'Runs only against the isolated local Supabase stack in CI.');
	test('GM can create a campaign; an invited player cannot rename it', async ({
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
