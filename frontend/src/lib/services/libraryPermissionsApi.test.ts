import { describe, expect, it } from 'vitest';
import { currentPlayerIds } from './libraryPermissionsApi';

describe('currentPlayerIds', () => {
	it('removes users no longer in the campaign and deduplicates current selections', () => {
		expect(
			currentPlayerIds(['player-a', 'former-player', ' player-a '], ['player-a', 'player-b'])
		).toEqual(['player-a']);
	});

	it('returns an empty allowlist when none of the selected users are current players', () => {
		expect(currentPlayerIds(['former-player'], ['player-a'])).toEqual([]);
	});
});
