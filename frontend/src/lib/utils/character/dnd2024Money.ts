export type Dnd2024Money = { cp: number; sp: number; ep: number; gp: number; pp: number };

export const EMPTY_DND2024_MONEY: Dnd2024Money = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

export function normalizeDnd2024Money(value?: Partial<Dnd2024Money> | null): Dnd2024Money {
	return {
		cp: validCoin(value?.cp),
		sp: validCoin(value?.sp),
		ep: validCoin(value?.ep),
		gp: validCoin(value?.gp),
		pp: validCoin(value?.pp)
	};
}

export function parseDnd2024CoinAmount(value: number): number | null {
	return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validCoin(value: unknown): number {
	return typeof value === 'number' && parseDnd2024CoinAmount(value) !== null ? value : 0;
}
