export const QUICK_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export const QUICK_DICE_MIN = 1;
export const QUICK_DICE_MAX = 100;

export function parseQuickDiceQuantity(value: string | number): number | null {
	const raw = String(value).trim();
	if (!/^\d+$/.test(raw)) return null;
	const quantity = Number(raw);
	return Number.isSafeInteger(quantity) && quantity >= QUICK_DICE_MIN && quantity <= QUICK_DICE_MAX
		? quantity
		: null;
}

export function quickDiceExpression(sides: number, quantity: string | number): string | null {
	if (!(QUICK_DICE_SIDES as readonly number[]).includes(sides)) return null;
	const parsed = parseQuickDiceQuantity(quantity);
	return parsed === null ? null : `${parsed}d${sides}`;
}
