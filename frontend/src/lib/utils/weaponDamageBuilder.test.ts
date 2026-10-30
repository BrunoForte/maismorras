import { describe, expect, it } from 'vitest';
import {
	DAMAGE_DIE_TYPES,
	normalizeDamageComponents,
	type DamageComponent,
	parseDamageExpression,
	parseLegacyDamage,
	addDamageComponent,
	removeDamageComponent,
	serializeDamageComponents,
	validateDamageBonus,
	validateDamageComponents
} from './weaponDamageBuilder';

describe('weapon damage builder', () => {
	it('accepts every die offered by the visual selector and serializes it as the selected formula', () => {
		for (const sides of DAMAGE_DIE_TYPES) {
			const components = [{ count: 1, sides }];
			expect(validateDamageComponents(components)).toBeNull();
			expect(serializeDamageComponents(components)).toBe(`1d${sides}`);
			expect(parseDamageExpression(serializeDamageComponents(components))).toEqual(components);
		}
	});

	it('normalizes numeric text values from form controls before validation and serialization', () => {
		const formValues = [{ count: '1', sides: '8' }] as unknown as DamageComponent[];
		const normalized = normalizeDamageComponents(formValues);

		expect(normalized).toEqual([{ count: 1, sides: 8 }]);
		expect(validateDamageComponents(formValues)).toBeNull();
		expect(serializeDamageComponents(normalized)).toBe('1d8');
		expect(normalizeDamageComponents([{ count: '', sides: '' }])).toEqual([
			{ count: '', sides: '' }
		]);
		expect(
			validateDamageComponents([{ count: 1, sides: 'invalid' } as unknown as DamageComponent])
		).not.toBeNull();
	});

	it('round-trips additive damage groups', () => {
		const components = parseDamageExpression('2d6+3d8+4d10');
		expect(components).toEqual([
			{ count: 2, sides: 6 },
			{ count: 3, sides: 8 },
			{ count: 4, sides: 10 }
		]);
		expect(serializeDamageComponents(components!)).toBe('2d6+3d8+4d10');
	});

	it('converts supported legacy fixed modifiers separately', () => {
		expect(parseLegacyDamage('2d6+1d4-3')).toEqual({ damage: '2d6+1d4', damageBonus: -3 });
		expect(parseLegacyDamage('11d6+3')).toEqual({ damage: '11d6', damageBonus: 3 });
		expect(parseDamageExpression('')).toEqual([]);
		expect(serializeDamageComponents([])).toBe('');
		expect(validateDamageComponents([])).toBeNull();
		expect(parseDamageExpression('2d6+')).toBeNull();
		expect(parseLegacyDamage('damage varies')).toBeNull();
	});

	it('adds and removes only the selected damage component', () => {
		const initial = [
			{ count: 2, sides: 6 },
			{ count: 3, sides: 8 }
		];
		const added = addDamageComponent(initial);
		expect(added).toEqual([...initial, { count: 1, sides: 6 }]);
		expect(removeDamageComponent(added, 1)).toEqual([initial[0], added[2]]);
		expect(initial).toEqual([
			{ count: 2, sides: 6 },
			{ count: 3, sides: 8 }
		]);
	});

	it('rejects empty, fractional, nonpositive, and over-limit quantities and invalid die sizes', () => {
		for (const count of ['', 0, -1, 1.5, 11])
			expect(validateDamageComponents([{ count: count as number | '', sides: 6 }])).not.toBeNull();
		for (const sides of [1, 1.5, 1001])
			expect(validateDamageComponents([{ count: 1, sides }])).not.toBeNull();
		expect(
			validateDamageComponents([
				{ count: 5, sides: 6 },
				{ count: 6, sides: 8 }
			])
		).not.toBeNull();
		expect(
			validateDamageComponents([
				{ count: 3, sides: 6 },
				{ count: 3, sides: 8 },
				{ count: 4, sides: 10 }
			])
		).toBeNull();
		expect(validateDamageComponents([{ count: 10, sides: 6 }])).toBeNull();
	});

	it.each([4, 6, 12])('accepts and round-trips d%s selections as numeric sides', (sides) => {
		const components = [{ count: 1, sides }];
		const formula = serializeDamageComponents(components);
		expect(typeof components[0].sides).toBe('number');
		expect(formula).toBe(`1d${sides}`);
		expect(validateDamageComponents(components)).toBeNull();
		expect(parseDamageExpression(formula)).toEqual(components);
	});

	it('limits the fixed damage modifier to the server roll bound', () => {
		expect(validateDamageBonus(-10000)).toBeNull();
		expect(validateDamageBonus(10000)).toBeNull();
		expect(validateDamageBonus(10001)).not.toBeNull();
		expect(validateDamageBonus(1.5)).not.toBeNull();
	});
});
