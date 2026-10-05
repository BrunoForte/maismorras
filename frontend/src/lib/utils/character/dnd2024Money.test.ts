import { describe, expect, it } from 'vitest';
import { EMPTY_DND2024_MONEY, normalizeDnd2024Money, parseDnd2024CoinAmount } from './dnd2024Money';

describe('D&D 2024 money', () => {
	it('fills legacy sheets with zero balances and preserves valid denominations', () => {
		expect(normalizeDnd2024Money()).toEqual(EMPTY_DND2024_MONEY);
		expect(normalizeDnd2024Money({ gp: 23, cp: 4 })).toEqual({
			cp: 4,
			sp: 0,
			ep: 0,
			gp: 23,
			pp: 0
		});
	});

	it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
		'rejects invalid coin amount %s',
		(value) => expect(parseDnd2024CoinAmount(value)).toBeNull()
	);

	it('accepts zero and safe whole non-negative amounts', () => {
		expect(parseDnd2024CoinAmount(0)).toBe(0);
		expect(parseDnd2024CoinAmount(100)).toBe(100);
		expect(parseDnd2024CoinAmount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
	});
});
