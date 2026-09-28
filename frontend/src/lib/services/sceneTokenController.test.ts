import { describe, expect, it } from 'vitest';
import { toPersistedToken } from './sceneTokenController';
import type { Personagem } from '$lib/stores/gameStore';

const token: Personagem = {
	id: 7,
	persistedId: 'token-id',
	isOwned: true,
	visibility: {
		showName: true,
		showHP: true,
		showAC: false,
		showStatuses: true,
		transparentBackground: true,
		imageScale: 1.2,
		imageOffsetX: -3,
		imageOffsetY: 4
	},
	nome: 'Arqueira',
	cor: 0x8844aa,
	x: 12,
	y: 18,
	hpAtual: 9,
	hpMax: 13,
	ca: 15,
	proficiencia: 2,
	atributos: { for: 10, des: 16, con: 12, int: 10, sab: 13, car: 8 },
	armas: [],
	iniciativa: 3,
	visionRange: 6,
	lightRange: 0,
	fotoUrl: 'portraits/archer.png',
	tamanho: 1,
	fotoEscala: 1.4,
	fotoOffsetX: 6,
	fotoOffsetY: -2,
	status: ['Caído']
};

describe('scene token controller mapping', () => {
	it('serializes only scene-persisted fields and uses the current image crop', () => {
		expect(toPersistedToken(token)).toEqual({
			name: 'Arqueira',
			imageUrl: 'portraits/archer.png',
			color: 0x8844aa,
			x: 12,
			y: 18,
			size: 1,
			hpCurrent: 9,
			hpMax: 13,
			armorClass: 15,
			initiative: 3,
			visionRange: 6,
			lightRange: 0,
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
		});
	});

	it('does not mutate the local character while creating the request snapshot', () => {
		const before = {
			...token,
			visibility: { ...token.visibility },
			status: [...(token.status ?? [])]
		};
		toPersistedToken(token);
		expect(token).toEqual(before);
	});
});
