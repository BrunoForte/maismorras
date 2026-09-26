import { describe, expect, it, vi } from 'vitest';
import { DiceBoxRuntime, diceNotation, unseenDiceRolls, type DiceBoxPort } from './diceBoxRuntime';

function fakeBox() {
	const diceList: Array<Record<string, unknown>> = [];
	const box: DiceBoxPort & { diceList: typeof diceList } = {
		roll: vi.fn(async (notation: string) => {
			const [formula, valuesText] = notation.split('@');
			const count = [...formula.matchAll(/(\d*)d(?:4|6|8|10|12|20|100)/gi)].reduce(
				(total, match) => total + Number(match[1] || 1),
				0
			);
			const values = valuesText?.split(',').map(Number) ?? [];
			diceList.splice(
				0,
				diceList.length,
				...Array.from({ length: count }, (_, index) => ({ value: values[index] }))
			);
		}),
		clear: vi.fn(() => diceList.splice(0)),
		diceList
	};
	return box;
}

describe('temporary DiceBoxRuntime', () => {
	it('animates concurrent server-authoritative rolls together', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);

		await runtime.playBatch([
			{ notation: '2d20+5', dice: [18, 7] },
			{ notation: '4d6+3', dice: [2, 4, 1, 6] }
		]);

		expect(box.roll).toHaveBeenCalledWith('2d20+4d6@18,7,2,4,1,6');
		expect(box.diceList.map((die) => die.value)).toEqual([18, 7, 2, 4, 1, 6]);
		runtime.clearTemporary();
		expect(box.clear).toHaveBeenCalledOnce();
	});

	it('prefers an installed clearDice API', () => {
		const box = fakeBox();
		box.clearDice = vi.fn();
		const runtime = new DiceBoxRuntime(box);

		expect(() => runtime.clearTemporary()).not.toThrow();
		expect(box.clearDice).toHaveBeenCalledOnce();
		expect(box.clear).not.toHaveBeenCalled();
	});

	it('uses explicit notation or infers a d20 fallback', () => {
		expect(diceNotation({ notation: '4d6+2', expression: 'Dano', dice: [1, 2, 3, 4] })).toBe(
			'4d6+2'
		);
		expect(diceNotation({ expression: 'Teste', dice: [8, 12] })).toBe('2d20');
	});

	it('does not replay an already animated nonce', () => {
		const seen = new Set<string>();
		const roll = { nonce: 'roll-1', expression: 'Ataque', total: 18 };
		expect(unseenDiceRolls([roll], seen)).toEqual([roll]);
		expect(unseenDiceRolls([{ ...roll }], seen)).toEqual([]);
	});

	it('rejects server results outside the die range', async () => {
		const runtime = new DiceBoxRuntime(fakeBox());
		await expect(runtime.playBatch([{ notation: 'd6', dice: [7] }])).rejects.toThrow(
			'O resultado recebido não cabe em um d6.'
		);
	});
});
