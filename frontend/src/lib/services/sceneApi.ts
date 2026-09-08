import type { Session } from '@supabase/supabase-js';

export type Scene = {
	id: string;
	campaignId: string;
	name: string;
	backgroundUrl: string | null;
	gridSize: number;
	playerAccess: 'hidden' | 'available' | 'active';
	fogEnabled: boolean;
	visionMode: 'manual' | 'shared' | 'token';
};
export type PersistedToken = {
	id: string;
	actorId: string | null;
	isOwner: boolean;
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
	initiativeBonus?: number;
	statuses: string[];
	hidden: boolean;
	visibility: {
		showName: boolean;
		showHP: boolean;
		showAC: boolean;
		showStatuses: boolean;
	};
};
export type SceneEffect = {
	id: string;
	tokenId: string;
	name: string;
	source: string;
	remainingTurns: number | null;
	tickAt: 'turn_start' | 'turn_end';
};
export type EffectDefinition = {
	slug: string;
	name: string;
	summary: string;
	source: string;
};
export type FogState = { visibleCells: string[]; revealedCells: string[]; hiddenCells: string[] };
export type SceneArea = { id: string; shape: 'line' | 'circle' | 'cone'; startX: number; startY: number; endX: number; endY: number; color: number; label: string; visibleToPlayers: boolean };

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
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}
export const listScenes = (session: Session, campaignId: string) =>
	request<{ scenes: Scene[] }>(session, `/api/v1/campaigns/${campaignId}/scenes`);
export const createScene = (session: Session, campaignId: string, name: string) =>
	request<Scene>(session, `/api/v1/campaigns/${campaignId}/scenes`, {
		method: 'POST',
		body: JSON.stringify({ name })
	});
export const updateScene = (session: Session, scene: Scene) => request<Scene>(session, `/api/v1/scenes/${scene.id}`, { method: 'PATCH', body: JSON.stringify(scene) });
export const updateFog = (session: Session, sceneId: string, mode: 'reveal' | 'hide', cells: [number, number][]) =>
	request<{ ok: boolean }>(session, `/api/v1/scenes/${sceneId}/fog`, { method: 'PATCH', body: JSON.stringify({ mode, cells }) });
export const loadScene = (session: Session, sceneId: string) =>
	request<{ scene: Scene; tokens: PersistedToken[]; fog: FogState; areas: SceneArea[] }>(session, `/api/v1/scenes/${sceneId}`);
export const createSceneArea = (session: Session, sceneId: string, area: Omit<SceneArea, 'id'>) => request<SceneArea>(session, `/api/v1/scenes/${sceneId}/areas`, { method: 'POST', body: JSON.stringify(area) });
export const deleteSceneArea = (session: Session, sceneId: string, areaId: string) => request<void>(session, `/api/v1/scenes/${sceneId}/areas/${areaId}`, { method: 'DELETE' });
export const getCombat = (session: Session, sceneId: string) =>
	request<{ activeTokenId: string | null }>(session, `/api/v1/scenes/${sceneId}/combat`);
export const setCombat = (session: Session, sceneId: string, activeTokenId: string | null) =>
	request<{ activeTokenId: string | null; message?: string }>(session, `/api/v1/scenes/${sceneId}/combat`, {
		method: 'PATCH',
		body: JSON.stringify({ activeTokenId: activeTokenId ?? '' })
	});
export const rollSceneInitiative = (session: Session, sceneId: string) =>
	request<{ tokens: { id: string; initiative: number }[] }>(session, `/api/v1/scenes/${sceneId}/combat/roll-initiative`, {
		method: 'POST'
	});
export const listSceneEffects = (session: Session, sceneId: string) =>
	request<{ effects: SceneEffect[] }>(session, `/api/v1/scenes/${sceneId}/effects`);
export const listEffectDefinitions = (session: Session, sceneId: string) =>
	request<{ definitions: EffectDefinition[] }>(session, `/api/v1/scenes/${sceneId}/effect-definitions`);
export const addSceneEffect = (
	session: Session,
	sceneId: string,
	effect: Omit<SceneEffect, 'id'>
) =>
	request<SceneEffect>(session, `/api/v1/scenes/${sceneId}/effects`, {
		method: 'POST',
		body: JSON.stringify(effect)
	});
export const removeSceneEffect = (session: Session, sceneId: string, effectId: string) =>
	request<void>(session, `/api/v1/scenes/${sceneId}/effects/${effectId}`, { method: 'DELETE' });

export const createToken = (
	session: Session,
	sceneId: string,
	token: Omit<PersistedToken, 'id' | 'actorId' | 'isOwner'>
) =>
	request<PersistedToken>(session, `/api/v1/scenes/${sceneId}/tokens`, {
		method: 'POST',
		body: JSON.stringify(token)
	});

export const updateToken = (
	session: Session,
	sceneId: string,
	token: Omit<PersistedToken, 'actorId' | 'isOwner'>
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
