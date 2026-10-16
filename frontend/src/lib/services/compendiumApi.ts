import type { Session } from '@supabase/supabase-js';
import { request as httpRequest } from './httpClient';

export type CompendiumSource = {
	id: string;
	slug: string;
	title: string;
	kind: 'srd' | 'private' | 'homebrew';
	version: string;
	attribution: string;
	licenseUrl: string;
	readOnly: boolean;
};
export type CompendiumEntry = {
	id: string;
	sourceId: string;
	entryType: string;
	name: string;
	summary: string;
	rules: Record<string, unknown>;
	translations: Record<string, string>;
	isPublished: boolean;
	catalogEntryId?: string;
};
export type CompendiumList = {
	sources: CompendiumSource[];
	entries: CompendiumEntry[];
	canTranslateSharedSrd: boolean;
};
const WORKSPACE_COMPENDIUM_CACHE_TTL_MS = 30 * 1000;
const WORKSPACE_COMPENDIUM_CACHE_LIMIT = 8;
type WorkspaceCompendiumCacheEntry = {
	expiresAt: number;
	promise: Promise<CompendiumList>;
	userId: string;
	campaignId: string;
};
const workspaceCompendiumCache = new Map<string, WorkspaceCompendiumCacheEntry>();
const workspaceCompendiumRevisions = new Map<string, number>();
export type CompendiumDraft = Pick<
	CompendiumEntry,
	'name' | 'summary' | 'rules' | 'translations' | 'isPublished'
>;
export type Dnd2024Ability = 'intelligence' | 'wisdom' | 'charisma';
export type CampaignFeatSpellDefinition = {
	spellEntryId: string;
	canUseExistingSlots: boolean;
	freeUses: number;
	recovery: 'none' | 'short' | 'long';
	abilityOptions: Dnd2024Ability[];
};
export type CampaignFeatSpellRule = {
	enabled: boolean;
	spells: CampaignFeatSpellDefinition[];
};
async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
}
const compendiumCacheScope = (session: Session, campaignId: string) =>
	JSON.stringify([session.user.id, session.access_token, campaignId]);
const workspaceCompendiumKey = (session: Session, campaignId: string, locale: string) => {
	const scope = compendiumCacheScope(session, campaignId);
	const revision = workspaceCompendiumRevisions.get(scope) ?? 0;
	return { scope, key: JSON.stringify([scope, locale, revision]) };
};

export const getCompendium = (session: Session, campaignId: string) =>
	request<CompendiumList>(session, `/api/v1/campaigns/${campaignId}/compendium`);

/**
 * Reuses the map's permission-scoped preload briefly for the workspace tab. The API has no catalog
 * revision token, so successful local edits invalidate it and the short TTL bounds external staleness.
 */
export const getWorkspaceCompendium = (
	session: Session,
	campaignId: string,
	locale: string,
	now = Date.now()
) => {
	const { key } = workspaceCompendiumKey(session, campaignId, locale);
	const cached = workspaceCompendiumCache.get(key);
	if (cached && cached.expiresAt > now) {
		workspaceCompendiumCache.delete(key);
		workspaceCompendiumCache.set(key, cached);
		return cached.promise;
	}
	if (cached) workspaceCompendiumCache.delete(key);

	const promise = getCompendium(session, campaignId);
	const entry = {
		expiresAt: now + WORKSPACE_COMPENDIUM_CACHE_TTL_MS,
		promise,
		userId: session.user.id,
		campaignId
	};
	workspaceCompendiumCache.set(key, entry);
	while (workspaceCompendiumCache.size > WORKSPACE_COMPENDIUM_CACHE_LIMIT) {
		const oldestKey = workspaceCompendiumCache.keys().next().value;
		if (oldestKey === undefined) break;
		workspaceCompendiumCache.delete(oldestKey);
	}
	promise.catch(() => {
		if (workspaceCompendiumCache.get(key) === entry) workspaceCompendiumCache.delete(key);
	});
	return promise;
};

function invalidateWorkspaceCompendium(session: Session, campaignId: string) {
	const scope = compendiumCacheScope(session, campaignId);
	workspaceCompendiumRevisions.set(scope, (workspaceCompendiumRevisions.get(scope) ?? 0) + 1);
	for (const [key, entry] of workspaceCompendiumCache) {
		if (entry.userId === session.user.id && entry.campaignId === campaignId)
			workspaceCompendiumCache.delete(key);
	}
	if (workspaceCompendiumRevisions.size > WORKSPACE_COMPENDIUM_CACHE_LIMIT * 4)
		workspaceCompendiumRevisions.delete(workspaceCompendiumRevisions.keys().next().value!);
}

export const createCompendiumEntry = async (
	session: Session,
	campaignId: string,
	entry: Pick<
		CompendiumEntry,
		'sourceId' | 'entryType' | 'name' | 'summary' | 'rules' | 'translations' | 'isPublished'
	>
): Promise<CompendiumEntry> => {
	const result = await request<CompendiumEntry>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/entries`,
		{
			method: 'POST',
			body: JSON.stringify(entry)
		}
	);
	invalidateWorkspaceCompendium(session, campaignId);
	return result;
};
export const importCompendiumEntries = async (
	session: Session,
	campaignId: string,
	sourceId: string,
	entryType: string,
	entries: CompendiumDraft[]
): Promise<{ imported: number }> => {
	const result = await request<{ imported: number }>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/import`,
		{
			method: 'POST',
			body: JSON.stringify({ sourceId, entryType, entries })
		}
	);
	invalidateWorkspaceCompendium(session, campaignId);
	return result;
};
export const translateCompendiumEntry = async (
	session: Session,
	campaignId: string,
	entryId: string
): Promise<CompendiumEntry> => {
	const result = await httpRequest<CompendiumEntry>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}/translate`,
		{ method: 'POST' },
		'Não foi possível traduzir esta entrada.',
		130_000,
		false
	);
	invalidateWorkspaceCompendium(session, campaignId);
	return result;
};
export const updateCompendiumEntry = async (
	session: Session,
	campaignId: string,
	entryId: string,
	entry: Pick<
		CompendiumEntry,
		'entryType' | 'name' | 'summary' | 'rules' | 'translations' | 'isPublished'
	>
): Promise<CompendiumEntry> => {
	const result = await request<CompendiumEntry>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}`,
		{ method: 'PUT', body: JSON.stringify(entry) }
	);
	invalidateWorkspaceCompendium(session, campaignId);
	return result;
};
export const updateCampaignFeatSpellRule = async (
	session: Session,
	campaignId: string,
	entryId: string,
	rule: CampaignFeatSpellRule
): Promise<CompendiumEntry> => {
	const result = await request<CompendiumEntry>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}/campaign-feat-spell-rule`,
		{ method: 'PUT', body: JSON.stringify(rule) }
	);
	invalidateWorkspaceCompendium(session, campaignId);
	return result;
};
export const deleteCompendiumEntry = async (
	session: Session,
	campaignId: string,
	entryId: string
): Promise<void> => {
	await request<void>(session, `/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}`, {
		method: 'DELETE'
	});
	invalidateWorkspaceCompendium(session, campaignId);
};
