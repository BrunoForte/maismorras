import { describe, expect, it } from 'vitest';
import { spellIsOnSheet, unlockedSpellCircles } from './spellbook';

describe('unlockedSpellCircles', () => {
	it('offers cantrips and only circles with slots unlocked by progression', () => {
		expect(
			unlockedSpellCircles([
				{ level: 1, max: 2 },
				{ level: 2, max: 0 },
				{ level: 3, max: 1 }
			])
		).toEqual([0, 1, 3]);
	});

	it('does not duplicate circles or expose higher circles with no slots', () => {
		expect(
			unlockedSpellCircles([
				{ level: 0, max: 4 },
				{ level: 1, max: 1 },
				{ level: 1, max: 2 },
				{ level: 9, max: 0 }
			])
		).toEqual([0, 1]);
	});
});

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
