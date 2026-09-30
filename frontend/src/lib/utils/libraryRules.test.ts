import { describe, expect, it } from 'vitest';
import { libraryAccessMode, normalizeSelectedPlayerIds } from './libraryRules';

describe('library rules', () => {
	it('distinguishes public-to-players, restricted, and GM-private access', () => {
		expect(libraryAccessMode(true, false)).toBe('all');
		expect(libraryAccessMode(true, true)).toBe('restricted');
		expect(libraryAccessMode(false, false)).toBe('private');
		expect(libraryAccessMode(false, true)).toBe('private');
	});

	it('normalizes player IDs, removes duplicates and ignores IDs outside the campaign roster', () => {
		expect(
			normalizeSelectedPlayerIds(
				[' player-a ', 'PLAYER-A', 'missing', 'player-b', ''],
				['player-a', 'player-b']
			)
		).toEqual(['player-a', 'player-b']);
	});

	it('preserves the roster canonical casing and handles empty or malformed selections', () => {
		expect(normalizeSelectedPlayerIds(['ABC-123', 'abc-123'], ['Abc-123'])).toEqual(['Abc-123']);
		expect(normalizeSelectedPlayerIds(['x', '  '], [])).toEqual([]);
	});
});
