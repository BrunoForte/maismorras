import type { Session } from '@supabase/supabase-js';

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
const base = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${base}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...init.headers }
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.error?.message ?? 'Não foi possível carregar o compêndio.');
	}
	return response.json() as Promise<T>;
}
export const getCompendium = (session: Session, campaignId: string) =>
	request<{ sources: CompendiumSource[]; entries: CompendiumEntry[] }>(session, `/api/v1/campaigns/${campaignId}/compendium`);
export const createCompendiumEntry = (
	session: Session, campaignId: string,
	entry: Pick<CompendiumEntry, 'sourceId' | 'entryType' | 'name' | 'summary' | 'translations' | 'isPublished'>
) => request<CompendiumEntry>(session, `/api/v1/campaigns/${campaignId}/compendium/entries`, { method: 'POST', body: JSON.stringify(entry) });
