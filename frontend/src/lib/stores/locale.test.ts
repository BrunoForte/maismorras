import { describe, expect, it } from 'vitest';
import { distance, distanceText } from './locale';

describe('locale unit formatting', () => {
	it('keeps meters for Portuguese', () => {
		expect(distance(9, 'pt-BR')).toBe('9 m');
		expect(distanceText('30 ft., fly 60 ft.', 'pt-BR')).toBe('9,1 m, fly 18,3 m');
	});

	it('uses feet for English and preserves canonical English text', () => {
		expect(distance(9, 'en')).toBe('30 ft');
		expect(distanceText('30 ft., fly 60 ft.', 'en')).toBe('30 ft., fly 60 ft.');
	});
});
