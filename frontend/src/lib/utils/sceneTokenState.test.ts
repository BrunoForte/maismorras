import { describe, expect, it } from 'vitest';
import type { PersistedToken } from '$lib/services/sceneApi';
import type { Personagem } from '$lib/stores/gameStore';
import {
	normalizeSceneCharacters,
	removeSceneCharacter,
	toSceneCharacter,
	upsertSceneCharacter
} from './sceneTokenState';

const persistedToken: PersistedToken = {
	id: 'token-a',
	actorId: 'actor-a',
	isOwner: true,
	name: 'Arqueira',
	imageUrl: 'portraits/archer.png',
	color: 0x8844aa,
	x: 12,
	y: 18,
	size: 2,
	hpCurrent: 9,
	hpMax: 13,
	armorClass: 15,
	initiative: 3,
	visionRange: 6,
	lightRange: 1,
	statuses: ['Caído'],
	hidden: false,
	visibility: {
		showName: true,
		showHP: true,
		showAC: false,
		showStatuses: true,
		transparentBackground: true,
		imageScale: 1.4,
		imageOffsetX: 6,
		imageOffsetY: -2
	}
};

const character = (id: number, persistedId: string): Personagem =>
	toSceneCharacter({ ...persistedToken, id: persistedId }, id);

describe('scene token state', () => {
	it('maps persisted token data and permits a resolved signed image URL override', () => {
		const character = toSceneCharacter(persistedToken, 7, 'https://assets.example/archer');

		expect(character).toMatchObject({
			id: 7,
			persistedId: 'token-a',
			actorId: 'actor-a',
			isOwned: true,
			hidden: false,
			nome: 'Arqueira',
			cor: 0x8844aa,
			x: 12,
			y: 18,
			hpAtual: 9,
			hpMax: 13,
			ca: 15,
			iniciativa: 3,
			visionRange: 6,
			lightRange: 1,
			fotoUrl: 'https://assets.example/archer',
			tamanho: 2,
			fotoEscala: 1.4,
			fotoOffsetX: 6,
			fotoOffsetY: -2,
			status: ['Caído'],
			visibility: persistedToken.visibility
		});
		expect(toSceneCharacter({ ...persistedToken, hidden: true }, 9).hidden).toBe(true);
		expect(toSceneCharacter({ ...persistedToken, imageUrl: null }, 8).fotoUrl).toBeUndefined();
	});

	it('appends a new realtime token without replacing existing characters', () => {
		const existing = character(1, 'token-existing');
		const incoming = character(2, 'token-new');

		expect(upsertSceneCharacter([existing], incoming)).toEqual([existing, incoming]);
	});

	it('replaces a realtime token in its current position by persisted id', () => {
		const first = character(1, 'token-a');
		const second = character(2, 'token-b');
		const updated = { ...first, x: 44 };

		expect(upsertSceneCharacter([first, second], updated)).toEqual([updated, second]);
	});

	it('preserves local tokens without persisted ids when normalizing and upserting', () => {
		const local = { ...character(3, 'token-local'), persistedId: undefined, nome: 'Local' };
		const existing = character(1, 'token-a');
		const incoming = character(2, 'token-b');

		expect(normalizeSceneCharacters([local, existing])).toEqual([local, existing]);
		expect(upsertSceneCharacter([local, existing], incoming)).toEqual([local, existing, incoming]);
	});

	it('normalizes duplicate API tokens and realtime upserts without duplicate keyed ids', () => {
		const stale = { ...character(1, 'token-a'), x: 10 };
		const latest = { ...character(2, 'token-a'), x: 40 };
		const normalized = normalizeSceneCharacters([stale, latest]);
		expect(normalized).toEqual([latest]);
		expect(upsertSceneCharacter([stale, latest], { ...latest, y: 30 })).toMatchObject([
			{ persistedId: 'token-a', x: 40, y: 30 }
		]);
	});

	it('removes only the requested persisted token and is a no-op for an unknown id', () => {
		const first = character(1, 'token-a');
		const second = character(2, 'token-b');
		const characters = [first, second];

		expect(removeSceneCharacter(characters, 'token-a')).toEqual([second]);
		expect(removeSceneCharacter(characters, 'missing-token')).toBe(characters);
	});
});
