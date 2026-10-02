import { describe, expect, it } from 'vitest';
import { parseQuickDiceQuantity, quickDiceExpression } from './quickDice';

describe('quick dice quantity', () => {
	it('builds authoritative roll expressions at the supported limits', () => {
		expect(quickDiceExpression(6, '1')).toBe('1d6');
		expect(quickDiceExpression(20, '3')).toBe('3d20');
		expect(quickDiceExpression(4, 100)).toBe('100d4');
	});

	it.each(['', '0', '-1', '1.5', '1e2', '101', 'NaN', 'Infinity'])(
		'rejects invalid quantity %s',
		(value) => {
			expect(parseQuickDiceQuantity(value)).toBeNull();
			expect(quickDiceExpression(6, value)).toBeNull();
		}
	);

	it('rejects die sides that are not in the quick-dice controls', () => {
		expect(quickDiceExpression(3, 2)).toBeNull();
	});
});
