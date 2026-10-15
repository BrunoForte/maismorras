import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createCompendiumEntry,
	deleteCompendiumEntry,
	getWorkspaceCompendium,
	importCompendiumEntries,
	translateCompendiumEntry,
	updateCampaignFeatSpellRule,
	updateCompendiumEntry,
	type CompendiumList
} from './compendiumApi';

const session = (userId: string, token: string) =>
	({ user: { id: userId }, access_token: token }) as Session;
const catalog = (name: string): CompendiumList => ({
	sources: [],
	entries: [
		{
			id: name,
			sourceId: 'source',
			entryType: 'item',
			name,
			summary: '',
			rules: {},
			translations: {},
			isPublished: true
		}
	],
	canTranslateSharedSrd: false
});
const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});

afterEach(() => vi.unstubAllGlobals());

describe('workspace compendium reuse', () => {
	it('shares the map preload with the compendium tab for the same session, campaign and locale', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(catalog('initial')));
		vi.stubGlobal('fetch', fetchMock);
		const currentSession = session('user-1', 'token-1');

		const preload = await getWorkspaceCompendium(currentSession, 'campaign-1', 'pt-BR');
		const tabLoad = await getWorkspaceCompendium(currentSession, 'campaign-1', 'pt-BR');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(tabLoad).toBe(preload);
	});

	it('does not reuse data across campaign, user, access session or locale', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(catalog('initial')));
		vi.stubGlobal('fetch', fetchMock);
		const firstSession = session('isolation-user-1', 'isolation-token-1');

		await getWorkspaceCompendium(firstSession, 'campaign-1', 'pt-BR');
		await getWorkspaceCompendium(firstSession, 'campaign-2', 'pt-BR');
		await getWorkspaceCompendium(
			session('isolation-user-2', 'isolation-token-2'),
			'campaign-1',
			'pt-BR'
		);
		await getWorkspaceCompendium(
			session('isolation-user-1', 'isolation-refreshed-token'),
			'campaign-1',
			'pt-BR'
		);
		await getWorkspaceCompendium(firstSession, 'campaign-1', 'en');

		expect(fetchMock).toHaveBeenCalledTimes(5);
	});

	it('expires entries and fetches again instead of retaining an old revision indefinitely', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(catalog('first')))
			.mockResolvedValueOnce(jsonResponse(catalog('refreshed')));
		vi.stubGlobal('fetch', fetchMock);
		const currentSession = session('expiry-user', 'expiry-token');

		await getWorkspaceCompendium(currentSession, 'campaign', 'pt-BR', 1_000);
		const refreshed = await getWorkspaceCompendium(currentSession, 'campaign', 'pt-BR', 121_001);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(refreshed.entries[0]?.name).toBe('refreshed');
	});

	it.each([
		[
			'create',
			(s: Session) =>
				createCompendiumEntry(s, 'campaign', {
					sourceId: 'source',
					entryType: 'item',
					name: 'Entry',
					summary: '',
					rules: {},
					translations: {},
					isPublished: true
				})
		],
		['import', (s: Session) => importCompendiumEntries(s, 'campaign', 'source', 'item', [])],
		['translate', (s: Session) => translateCompendiumEntry(s, 'campaign', 'entry')],
		[
			'update',
			(s: Session) =>
				updateCompendiumEntry(s, 'campaign', 'entry', {
					entryType: 'item',
					name: 'Entry',
					summary: '',
					rules: {},
					translations: {},
					isPublished: true
				})
		],
		[
			'campaign rule',
			(s: Session) =>
				updateCampaignFeatSpellRule(s, 'campaign', 'entry', {
					enabled: false,
					spells: []
				})
		],
		['delete', (s: Session) => deleteCompendiumEntry(s, 'campaign', 'entry')]
	])('invalidates the reused catalog after a successful %s', async (_label, mutate) => {
		const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(catalog('response')));
		vi.stubGlobal('fetch', fetchMock);
		const currentSession = session(`mutation-${String(_label)}`, `token-${String(_label)}`);

		await getWorkspaceCompendium(currentSession, 'campaign', 'pt-BR');
		await mutate(currentSession);
		await getWorkspaceCompendium(currentSession, 'campaign', 'pt-BR');

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('invalidates only the edited campaign for that user and session', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(catalog('response')));
		vi.stubGlobal('fetch', fetchMock);
		const currentSession = session('scope-user', 'scope-token');

		await getWorkspaceCompendium(currentSession, 'campaign-1', 'pt-BR');
		await getWorkspaceCompendium(currentSession, 'campaign-2', 'pt-BR');
		await updateCompendiumEntry(currentSession, 'campaign-1', 'entry', {
			entryType: 'item',
			name: 'Entry',
			summary: '',
			rules: {},
			translations: {},
			isPublished: true
		});
		await getWorkspaceCompendium(currentSession, 'campaign-1', 'pt-BR');
		await getWorkspaceCompendium(currentSession, 'campaign-2', 'pt-BR');

		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it('invalidates cached sessions for the same user and campaign after an edit', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(catalog('response')));
		vi.stubGlobal('fetch', fetchMock);
		const originalSession = session('same-user', 'old-token');
		const refreshedSession = session('same-user', 'new-token');

		await getWorkspaceCompendium(originalSession, 'campaign', 'pt-BR');
		await getWorkspaceCompendium(refreshedSession, 'campaign', 'pt-BR');
		await deleteCompendiumEntry(originalSession, 'campaign', 'entry');
		await getWorkspaceCompendium(refreshedSession, 'campaign', 'pt-BR');

		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it('does not retain a failed load, allowing the compendium retry to fetch again', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('failure', { status: 503 }))
			.mockResolvedValueOnce(jsonResponse(catalog('retry')));
		vi.stubGlobal('fetch', fetchMock);
		const currentSession = session('retry-user', 'retry-token');

		await expect(getWorkspaceCompendium(currentSession, 'campaign', 'pt-BR')).rejects.toThrow();
		await expect(
			getWorkspaceCompendium(currentSession, 'campaign', 'pt-BR')
		).resolves.toMatchObject({ entries: [{ name: 'retry' }] });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
