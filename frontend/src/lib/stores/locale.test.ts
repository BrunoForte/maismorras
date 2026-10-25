import { describe, expect, it } from 'vitest';
import { distance, distanceText } from './locale';

describe('locale unit formatting', () => {
	it('keeps meters for Portuguese', () => {
		expect(distance(9, 'pt-BR')).toBe('9 m');
		expect(distance(1.6, 'pt-BR')).toBe('1,5 m');
		expect(distance(2.3, 'pt-BR')).toBe('3 m');
		expect(distance(4.5, 'pt-BR')).toBe('4,5 m');
		expect(distanceText('30 ft., fly 60 ft.', 'pt-BR')).toBe('9 m, fly 18 m');
		expect(distanceText('Alcance 2 m; alcance curto 4,4 m.', 'pt-BR')).toBe(
			'Alcance 1,5 m; alcance curto 4,5 m.'
		);
		expect(distanceText('Altura 125 cm, volume 1,8 m³ e velocidade 6 m/s.', 'pt-BR')).toBe(
			'Altura 125 cm, volume 1,8 m³ e velocidade 6 m/s.'
		);
	});

	it('uses feet for English and converts stored metric text for display', () => {
		expect(distance(9, 'en')).toBe('30 ft');
		expect(distanceText('30 ft., fly 60 ft.', 'en')).toBe('30 ft., fly 60 ft.');
		expect(distanceText('Deslocamento 9 m', 'en')).toBe('Deslocamento 30 ft');
	});
});
