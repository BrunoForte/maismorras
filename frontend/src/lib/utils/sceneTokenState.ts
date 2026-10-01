import type { PersistedToken } from '$lib/services/sceneApi';
import type { Personagem, StatusToken } from '$lib/stores/gameStore';

/** Converts a persisted scene token into the character shape used by the canvas. */
export function toSceneCharacter(
	token: PersistedToken,
	id: number,
	imageUrl = token.imageUrl
): Personagem {
	return {
		id,
		persistedId: token.id,
		hidden: token.hidden,
		actorId: token.actorId ?? undefined,
		isOwned: token.isOwner,
		nome: token.name,
		cor: token.color,
		x: token.x,
		y: token.y,
		hpAtual: token.hpCurrent,
		hpMax: token.hpMax,
		ca: token.armorClass,
		proficiencia: 2,
		atributos: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
		armas: [],
		iniciativa: token.initiative,
		visionRange: token.visionRange,
		lightRange: token.lightRange,
		fotoUrl: imageUrl ?? undefined,
		tamanho: token.size,
		fotoEscala: token.visibility.imageScale ?? 1,
		fotoOffsetX: token.visibility.imageOffsetX ?? 0,
		fotoOffsetY: token.visibility.imageOffsetY ?? 0,
		status: token.statuses as StatusToken[],
		visibility: token.visibility
	};
}

/** Replaces a token in place by persisted id, or appends it when first received. */
export function upsertSceneCharacter(characters: Personagem[], token: Personagem): Personagem[] {
	const unpersisted = characters.filter((character) => !character.persistedId);
	const byPersistedId = new Map<string, Personagem>();
	for (const character of characters) {
		if (!character.persistedId) continue;
		byPersistedId.set(character.persistedId, character);
	}
	if (token.persistedId) byPersistedId.set(token.persistedId, token);
	return [...unpersisted, ...byPersistedId.values()];
}

/** Deduplicates API/realtime token collections, keeping the last item per persisted id. */
export function normalizeSceneCharacters(characters: readonly Personagem[]): Personagem[] {
	const unpersisted = characters.filter((character) => !character.persistedId);
	const byPersistedId = new Map<string, Personagem>();
	for (const character of characters) {
		if (character.persistedId) byPersistedId.set(character.persistedId, character);
	}
	return [...unpersisted, ...byPersistedId.values()];
}

/** Removes only the character corresponding to the persisted scene token id. */
export function removeSceneCharacter(characters: Personagem[], tokenId: string): Personagem[] {
	const next = characters.filter((character) => character.persistedId !== tokenId);
	return next.length === characters.length ? characters : next;
}
