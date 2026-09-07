import type { Session } from '@supabase/supabase-js';

export type Scene = {
	id: string;
	campaignId: string;
	name: string;
	backgroundUrl: string | null;
	gridSize: number;
};
export type PersistedToken = {
	id: string;
	actorId: string | null;
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
	statuses: string[];
	hidden: boolean;
	visibility: {
		showName: boolean;
		showHP: boolean;
		showAC: boolean;
		showStatuses: boolean;
	};
};

const base = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
export async function request<T>(
	session: Session,
	path: string,
	init: RequestInit = {}
): Promise<T> {
	const response = await fetch(`${base}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			'Content-Type': 'application/json',
			...init.headers
		}
	});
	if (!response.ok)
		throw new Error((await response.json()).error?.message ?? 'Não foi possível carregar a mesa.');
	return response.json() as Promise<T>;
}
export const listScenes = (session: Session, campaignId: string) =>
	request<{ scenes: Scene[] }>(session, `/api/v1/campaigns/${campaignId}/scenes`);
export const createScene = (session: Session, campaignId: string, name: string) =>
	request<Scene>(session, `/api/v1/campaigns/${campaignId}/scenes`, {
		method: 'POST',
		body: JSON.stringify({ name })
	});
export const loadScene = (session: Session, sceneId: string) =>
	request<{ scene: Scene; tokens: PersistedToken[] }>(session, `/api/v1/scenes/${sceneId}`);
export const getCombat = (session: Session, sceneId: string) =>
	request<{ activeTokenId: string | null }>(session, `/api/v1/scenes/${sceneId}/combat`);
export const setCombat = (session: Session, sceneId: string, activeTokenId: string | null) =>
	request<{ activeTokenId: string | null }>(session, `/api/v1/scenes/${sceneId}/combat`, {
		method: 'PATCH',
		body: JSON.stringify({ activeTokenId: activeTokenId ?? '' })
	});

export const createToken = (
	session: Session,
	sceneId: string,
	token: Omit<PersistedToken, 'id' | 'actorId'>
) =>
	request<PersistedToken>(session, `/api/v1/scenes/${sceneId}/tokens`, {
		method: 'POST',
		body: JSON.stringify(token)
	});

export const updateToken = (
	session: Session,
	sceneId: string,
	token: Omit<PersistedToken, 'actorId'>
) =>
	request<PersistedToken>(session, `/api/v1/scenes/${sceneId}/tokens/${token.id}`, {
		method: 'PATCH',
		body: JSON.stringify(token)
	});

export const createTokenFromCharacter = (session: Session, sceneId: string, actorId: string) =>
	request<PersistedToken>(session, `/api/v1/scenes/${sceneId}/tokens/from-character`, {
		method: 'POST',
		body: JSON.stringify({ actorId })
	});

export const createTokenFromCompendiumMonster = (session: Session, sceneId: string, entryId: string) =>
	request<PersistedToken>(session, `/api/v1/scenes/${sceneId}/tokens/from-compendium-monster`, {
		method: 'POST',
		body: JSON.stringify({ entryId })
	});
