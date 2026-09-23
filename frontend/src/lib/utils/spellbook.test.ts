import { describe, expect, it } from 'vitest';
import { spellIsOnSheet } from './spellbook';

describe('spellIsOnSheet', () => {
	it('matches compendium spells by entry id', () => {
		expect(
			spellIsOnSheet('spell-1', 'Fireball', 'Bola de Fogo', [{ entryId: 'spell-1', name: 'Outra' }])
		).toBe(true);
	});

	it('matches a manually entered spell by accent-insensitive name', () => {
		expect(spellIsOnSheet('spell-1', 'Fireball', 'Bola de Fogo', [{ name: 'Bóla de Fogo' }])).toBe(
			true
		);
	});

	it('keeps spells not yet on the sheet available', () => {
		expect(spellIsOnSheet('spell-1', 'Fireball', 'Bola de Fogo', [{ name: 'Raio de Gelo' }])).toBe(
			false
		);
	});
});
