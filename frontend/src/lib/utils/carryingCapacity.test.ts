import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '$lib/services/characterApi';
import {
	calculateDnd2024CarriedWeight,
	calculateDnd2024CarryingCapacity,
	defaultCharacterSize
} from './carryingCapacity';

const item = (weight: unknown, quantity = 1): InventoryItem => ({
	entryId: 'item',
	name: 'Item',
	quantity,
	equipped: false,
	rules: weight === undefined ? {} : { weight }
});

describe('D&D 2024 carrying capacity', () => {
	it.each([
		['tiny', 7.5],
		['small', 15],
		['medium', 15],
		['large', 30],
		['huge', 60],
		['gargantuan', 120]
	] as const)('uses the SRD size multiplier for %s', (size, multiplier) => {
		expect(calculateDnd2024CarryingCapacity({ strength: 10, size })?.capacityLb).toBe(
			10 * multiplier
		);
	});

	it('uses table endpoints and rejects invalid Strength', () => {
		expect(calculateDnd2024CarryingCapacity({ strength: 1, size: 'tiny' })?.capacityLb).toBe(7.5);
		expect(calculateDnd2024CarryingCapacity({ strength: 30, size: 'gargantuan' })?.capacityLb).toBe(
			3600
		);
		expect(calculateDnd2024CarryingCapacity({ strength: 0, size: 'medium' })).toBeNull();
		expect(calculateDnd2024CarryingCapacity({ strength: 31, size: 'medium' })).toBeNull();
	});

	it('applies Powerful Build once and Large Form before its size step', () => {
		expect(
			calculateDnd2024CarryingCapacity({ strength: 10, size: 'medium', powerfulBuild: true })
		).toEqual({ effectiveSize: 'large', capacityLb: 300 });
		expect(
			calculateDnd2024CarryingCapacity({
				strength: 10,
				size: 'medium',
				powerfulBuild: true,
				largeFormActive: true
			})
		).toEqual({ effectiveSize: 'huge', capacityLb: 600 });
		expect(
			calculateDnd2024CarryingCapacity({ strength: 10, size: 'medium', largeFormActive: true })
		).toEqual({ effectiveSize: 'large', capacityLb: 300 });
	});

	it('defaults existing fixed Small species to Small and other species to Medium', () => {
		expect(defaultCharacterSize('gnome')).toBe('small');
		expect(defaultCharacterSize('Halfling')).toBe('small');
		expect(defaultCharacterSize('Goliath')).toBe('medium');
		expect(defaultCharacterSize('Human')).toBe('medium');
	});

	it('multiplies item weights by quantity, includes coins, and flags unknown weights', () => {
		expect(
			calculateDnd2024CarriedWeight(
				[item(2, 3), item(0.5, 2), item(undefined), item('not-a-weight'), item(-1), item(2, 1.5)],
				{ cp: 10, sp: 10, ep: 10, gp: 10, pp: 10 }
			)
		).toEqual({ weightLb: 8, incomplete: true, unknownItemCount: 4 });
	});

	it('does not flag zero-weight items and reports loads above capacity without applying a penalty', () => {
		const load = calculateDnd2024CarriedWeight([item(0), item('4.5', 2)]);
		expect(load).toEqual({ weightLb: 9, incomplete: false, unknownItemCount: 0 });
		expect(load.weightLb).toBeGreaterThan(
			calculateDnd2024CarryingCapacity({ strength: 1, size: 'tiny' })!.capacityLb
		);
	});
});
