import { describe, expect, it } from 'vitest';
import type { PersistedToken } from '$lib/services/sceneApi';
import {
	cameraCharacterLabel,
	cameraHPPercent,
	findCameraCharacterToken,
	type OverlayCameraLink
} from './overlayCamera';

const token = (overrides: Partial<PersistedToken> = {}): PersistedToken => ({
	id: 'token-1',
	actorId: 'character-1',
	isOwner: false,
	name: 'Lira',
	imageUrl: null,
	color: 0,
	x: 0,
	y: 0,
	size: 1,
	hpCurrent: 12,
	hpMax: 20,
	armorClass: 15,
	initiative: 0,
	visionRange: 0,
	lightRange: 0,
	statuses: [],
	hidden: false,
	visibility: { showName: true, showHP: true, showAC: false, showStatuses: false },
	...overrides
});

describe('overlay camera character link', () => {
	it('resolves the visible scene token by character id', () => {
		const camera: OverlayCameraLink = {
			characterId: 'character-1',
			characterName: 'Old name',
			playerName: 'Player'
		};
		expect(findCameraCharacterToken(camera, [token()])?.id).toBe('token-1');
	});

	it('does not resolve hidden tokens or unrelated characters', () => {
		const camera: OverlayCameraLink = {
			characterId: 'character-1',
			characterName: '',
			playerName: 'Player'
		};
		expect(findCameraCharacterToken(camera, [token({ hidden: true })])).toBeNull();
		expect(findCameraCharacterToken(camera, [token({ actorId: 'other-character' })])).toBeNull();
	});

	it('prefers the live token name and bounds HP percentage', () => {
		const camera: OverlayCameraLink = {
			characterId: 'character-1',
			characterName: 'Saved name',
			playerName: 'Player'
		};
		const linked = token({ name: 'Current name', hpCurrent: 25, hpMax: 20 });
		expect(cameraCharacterLabel(camera, linked, 'Player 1')).toBe('Current name');
		expect(cameraHPPercent(linked)).toBe(100);
		expect(cameraHPPercent(token({ hpCurrent: -2, hpMax: 0 }))).toBe(0);
	});
});
