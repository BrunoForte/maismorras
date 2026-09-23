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
};
export type CompendiumDraft = Pick<
	CompendiumEntry,
	'name' | 'summary' | 'rules' | 'translations' | 'isPublished'
>;
async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
}
export const getCompendium = (session: Session, campaignId: string) =>
	request<{ sources: CompendiumSource[]; entries: CompendiumEntry[] }>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium`
	);
export const createCompendiumEntry = (
	session: Session,
	campaignId: string,
	entry: Pick<
		CompendiumEntry,
		'sourceId' | 'entryType' | 'name' | 'summary' | 'rules' | 'translations' | 'isPublished'
	>
) =>
	request<CompendiumEntry>(session, `/api/v1/campaigns/${campaignId}/compendium/entries`, {
		method: 'POST',
		body: JSON.stringify(entry)
	});
export const importCompendiumEntries = (
	session: Session,
	campaignId: string,
	sourceId: string,
	entryType: string,
	entries: CompendiumDraft[]
) =>
	request<{ imported: number }>(session, `/api/v1/campaigns/${campaignId}/compendium/import`, {
		method: 'POST',
		body: JSON.stringify({ sourceId, entryType, entries })
	});
export const translateCompendiumEntry = (session: Session, campaignId: string, entryId: string) =>
	httpRequest<CompendiumEntry>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}/translate`,
		{ method: 'POST' },
		'Não foi possível traduzir esta entrada.',
		130_000
	);
export const updateCompendiumEntry = (
	session: Session,
	campaignId: string,
	entryId: string,
	entry: Pick<
		CompendiumEntry,
		'entryType' | 'name' | 'summary' | 'rules' | 'translations' | 'isPublished'
	>
) =>
	request<CompendiumEntry>(
		session,
		`/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}`,
		{ method: 'PUT', body: JSON.stringify(entry) }
	);
export const deleteCompendiumEntry = (session: Session, campaignId: string, entryId: string) =>
	request<void>(session, `/api/v1/campaigns/${campaignId}/compendium/entries/${entryId}`, {
		method: 'DELETE'
	});
