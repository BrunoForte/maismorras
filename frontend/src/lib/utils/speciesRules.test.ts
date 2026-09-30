import { describe, expect, it } from 'vitest';
import { displayedSpeed, storedSpeedFromDisplay } from './speciesRules';

describe('species rules', () => {
	it('converts displayed speed while preserving canonical metric storage', () => {
		expect(displayedSpeed(9, 'en')).toBe(30);
		expect(storedSpeedFromDisplay('30', 'en')).toBe(9.1);
		expect(storedSpeedFromDisplay('10.5', 'pt-BR')).toBe(10.5);
		expect(storedSpeedFromDisplay('-1', 'pt-BR')).toBeNull();
		expect(storedSpeedFromDisplay('not a number', 'en')).toBeNull();
	});
});
