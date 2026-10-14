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
		['tiny', 7.5, 15],
		['small', 15, 30],
		['medium', 15, 30],
		['large', 30, 60],
		['huge', 60, 120],
		['gargantuan', 120, 240]
	] as const)('uses the SRD limits for %s', (size, carryMultiplier, pushDragLiftMultiplier) => {
		const limits = calculateDnd2024CarryingCapacity({ strength: 10, size });
		expect(limits?.capacityLb).toBe(10 * carryMultiplier);
		expect(limits?.pushDragLiftLb).toBe(10 * pushDragLiftMultiplier);
		expect(limits?.actualSize).toBe(size);
	});

	it('uses table endpoints and rejects invalid Strength', () => {
		expect(calculateDnd2024CarryingCapacity({ strength: 1, size: 'tiny' })).toMatchObject({
			capacityLb: 7.5,
			pushDragLiftLb: 15
		});
		expect(calculateDnd2024CarryingCapacity({ strength: 30, size: 'gargantuan' })).toMatchObject({
			capacityLb: 3600,
			pushDragLiftLb: 7200
		});
		expect(calculateDnd2024CarryingCapacity({ strength: 0, size: 'medium' })).toBeNull();
		expect(calculateDnd2024CarryingCapacity({ strength: 31, size: 'medium' })).toBeNull();
		expect(calculateDnd2024CarryingCapacity({ strength: 10.5, size: 'medium' })).toBeNull();
		expect(calculateDnd2024CarryingCapacity({ strength: Number.NaN, size: 'medium' })).toBeNull();
		expect(
			calculateDnd2024CarryingCapacity({ strength: undefined as unknown as number, size: 'medium' })
		).toBeNull();
	});

	it('applies Powerful Build only to carrying capacity and Large Form to actual size', () => {
		expect(
			calculateDnd2024CarryingCapacity({ strength: 10, size: 'medium', powerfulBuild: true })
		).toEqual({
			actualSize: 'medium',
			effectiveSize: 'large',
			capacityLb: 300,
			pushDragLiftLb: 300,
			powerfulBuildApplied: true
		});
		expect(
			calculateDnd2024CarryingCapacity({
				strength: 10,
				size: 'medium',
				powerfulBuild: true,
				largeFormActive: true
			})
		).toEqual({
			actualSize: 'large',
			effectiveSize: 'huge',
			capacityLb: 600,
			pushDragLiftLb: 600,
			powerfulBuildApplied: true
		});
		expect(
			calculateDnd2024CarryingCapacity({ strength: 10, size: 'medium', largeFormActive: true })
		).toEqual({
			actualSize: 'large',
			effectiveSize: 'large',
			capacityLb: 300,
			pushDragLiftLb: 600,
			powerfulBuildApplied: false
		});
	});

	it('keeps Powerful Build at the table maximum without applying another size step', () => {
		expect(
			calculateDnd2024CarryingCapacity({ strength: 10, size: 'gargantuan', powerfulBuild: true })
		).toEqual({
			actualSize: 'gargantuan',
			effectiveSize: 'gargantuan',
			capacityLb: 1200,
			pushDragLiftLb: 2400,
			powerfulBuildApplied: true
		});
	});

	it('returns to the recorded size when the temporary Large Form effect ends', () => {
		const before = calculateDnd2024CarryingCapacity({
			strength: 12,
			size: 'medium',
			powerfulBuild: true
		});
		const active = calculateDnd2024CarryingCapacity({
			strength: 12,
			size: 'medium',
			powerfulBuild: true,
			largeFormActive: true
		});
		const ended = calculateDnd2024CarryingCapacity({
			strength: 12,
			size: 'medium',
			powerfulBuild: true
		});
		expect(before?.capacityLb).toBe(360);
		expect(active?.capacityLb).toBe(720);
		expect(ended).toEqual(before);
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
