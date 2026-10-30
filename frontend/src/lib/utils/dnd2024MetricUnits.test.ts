import { describe, expect, it } from 'vitest';
import {
	feetToMeters,
	formatDnd2024Distance,
	formatDnd2024Weight,
	kilogramsToPounds,
	poundsToKilograms
} from './dnd2024MetricUnits';
import { calculateDnd2024CarryingCapacity } from './carryingCapacity';

describe('D&D 2024 metric display conversions', () => {
	it('uses exact pound/kilogram conversion factors without changing the input values', () => {
		expect(poundsToKilograms(1)).toBe(0.45359237);
		expect(kilogramsToPounds(1)).toBeCloseTo(2.2046226218, 9);
		expect(poundsToKilograms(7.5)).toBe(3.401942775);
	});

	it('keeps the exact five-foot conversion internally and rounds its metric display to 1.5 m steps', () => {
		expect(feetToMeters(5)).toBe(1.524);
		expect(formatDnd2024Distance(5, 'pt-BR')).toBe('1,5');
		expect(formatDnd2024Distance(5, 'en')).toBe('1.5');
	});

	it('formats displayed weights to two fractional digits by locale', () => {
		expect(formatDnd2024Weight(151, 'pt-BR')).toBe('68,49');
		expect(formatDnd2024Weight(150, 'en')).toBe('68.04');
		expect(formatDnd2024Weight(null, 'pt-BR')).toBe('—');
	});

	it.each([
		['tiny', '34,02', '68,04'],
		['small', '68,04', '136,08'],
		['medium', '68,04', '136,08'],
		['large', '136,08', '272,16'],
		['huge', '272,16', '544,31'],
		['gargantuan', '544,31', '1.088,62']
	] as const)('formats %s carrying and hauling limits in kilograms', (size, carry, haul) => {
		const limits = calculateDnd2024CarryingCapacity({ strength: 10, size });
		expect(formatDnd2024Weight(limits!.capacityLb, 'pt-BR')).toBe(carry);
		expect(formatDnd2024Weight(limits!.pushDragLiftLb, 'pt-BR')).toBe(haul);
	});

	it('converts Large Form and Powerful Build display values without changing their size rules', () => {
		const temporary = calculateDnd2024CarryingCapacity({
			strength: 10,
			size: 'medium',
			largeFormActive: true
		});
		const powerful = calculateDnd2024CarryingCapacity({
			strength: 10,
			size: 'medium',
			powerfulBuild: true
		});
		const ended = calculateDnd2024CarryingCapacity({ strength: 10, size: 'medium' });
		expect(formatDnd2024Weight(temporary!.capacityLb, 'pt-BR')).toBe('136,08');
		expect(formatDnd2024Weight(temporary!.pushDragLiftLb, 'pt-BR')).toBe('272,16');
		expect(formatDnd2024Weight(powerful!.capacityLb, 'pt-BR')).toBe('136,08');
		expect(formatDnd2024Weight(powerful!.pushDragLiftLb, 'pt-BR')).toBe('136,08');
		expect(formatDnd2024Weight(ended!.capacityLb, 'pt-BR')).toBe('68,04');
	});
});
