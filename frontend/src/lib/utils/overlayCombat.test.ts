import { describe, expect, it } from 'vitest';
import { getOverlayInitiativeOrder, getOverlayNextCombatant } from './overlayCombat';

const tokens = [
	{ id: 'player', name: 'Aventureira', initiative: 5 },
	{ id: 'enemy', name: 'Goblin', initiative: 12 },
	{ id: 'hidden', name: 'Inimigo oculto', initiative: 20, hidden: true }
];

describe('overlay combat timeline', () => {
	it('sorts visible combatants by the persisted combat initiative', () => {
		expect(
			getOverlayInitiativeOrder(tokens, [
				{ tokenId: 'player', initiative: 18 },
				{ tokenId: 'enemy', initiative: 4 },
				{ tokenId: 'hidden', initiative: 20 }
			]).map((token) => token.id)
		).toEqual(['player', 'enemy']);
	});

	it('uses the token initiative as a fallback when no combat roll is stored', () => {
		expect(getOverlayInitiativeOrder(tokens, []).map((token) => token.id)).toEqual([
			'enemy',
			'player'
		]);
	});

	it('returns the following combatant and wraps at the end of the list', () => {
		const order = getOverlayInitiativeOrder(tokens, []);
		expect(getOverlayNextCombatant(order, 'enemy')?.id).toBe('player');
		expect(getOverlayNextCombatant(order, 'player')?.id).toBe('enemy');
		expect(getOverlayNextCombatant(order, 'missing')).toBeNull();
	});
});
