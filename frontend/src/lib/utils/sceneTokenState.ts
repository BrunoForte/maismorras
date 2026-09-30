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
	const index = characters.findIndex((character) => character.persistedId === token.persistedId);
	if (index < 0) return [...characters, token];
	if (characters[index] === token) return characters;
	const next = [...characters];
	next[index] = token;
	return next;
}

/** Removes only the character corresponding to the persisted scene token id. */
export function removeSceneCharacter(characters: Personagem[], tokenId: string): Personagem[] {
	const next = characters.filter((character) => character.persistedId !== tokenId);
	return next.length === characters.length ? characters : next;
}
