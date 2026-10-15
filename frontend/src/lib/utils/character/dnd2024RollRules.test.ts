import { describe, expect, it } from 'vitest';
import { resolveDnd2024RollMode } from './dnd2024RollRules';

describe('D&D 2024 d20 roll mode', () => {
	it.each([
		['normal', [], 'normal'],
		['advantage', [], 'advantage'],
		['disadvantage', [], 'disadvantage'],
		['normal', ['Cego'], 'disadvantage'],
		['advantage', ['Cego'], 'normal'],
		['disadvantage', ['Impedido'], 'disadvantage']
	] as const)('resolves %s with conditions %j to %s', (requested, conditions, expected) => {
		expect(resolveDnd2024RollMode(requested, conditions)).toBe(expected);
	});
});
