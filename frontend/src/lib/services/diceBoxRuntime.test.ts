import { describe, expect, it, vi } from 'vitest';
import { DiceBoxRuntime, diceNotation, type DiceBoxPort } from './diceBoxRuntime';

function fakeBox() {
	let nextId = 0;
	const diceList: Array<Record<string, unknown>> = [];
	const box: DiceBoxPort = {
		roll: vi.fn(async (notation: string) => {
			diceList.splice(0, diceList.length, ...makeDice(notation));
		}),
		add: vi.fn(async (notation: string) => {
			diceList.push(...makeDice(notation));
		}),
		reroll: vi.fn(async (ids: number[]) => {
			ids.forEach((id) => {
				const die = diceList[id];
				if (die) die.value = 4;
			});
		}),
		swapDiceFace: vi.fn((die, value) => {
			die.value = value;
		}),
		clear: vi.fn(() => {
			diceList.splice(0);
		}),
		diceList,
		renderer: { render: vi.fn() },
		scene: {},
		camera: {}
	};
	function makeDice(notation: string) {
		const forcedValues = notation.split('@')[1]?.split(',').map(Number) ?? [];
		const formula = notation.split('@')[0];
		const count = [...formula.matchAll(/(\d*)d(?:4|6|8|10|12|20|100)/gi)].reduce(
			(total, match) => total + Number(match[1] || 1),
			0
		);
		return Array.from({ length: count }, (_, index) => ({
			id: `die-${nextId++}`,
			value: forcedValues[index] ?? index + 1
		}));
	}
	return box;
}

describe('DiceBoxRuntime', () => {
	it('shows simultaneous authoritative multi-die temporary rolls in one batch', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);

		await runtime.playBatch(
			[
				{ notation: '2d20+5', dice: [18, 7], slot: 'attack', color: '#aabbcc' },
				{ notation: '4d6+3', dice: [2, 4, 1, 6], slot: 'damage', color: '#aabbcc' }
			],
			'3d-overlay'
		);

		expect(box.roll).toHaveBeenCalledWith('2d20+4d6@18,7,2,4,1,6');
		expect(box.add).not.toHaveBeenCalled();
		expect(box.diceList.map((die) => die.value)).toEqual([18, 7, 2, 4, 1, 6]);
		runtime.clearTemporary();
		expect(box.clear).toHaveBeenCalledOnce();
	});

	it('reuses persistent dice and remaps their visible faces to authoritative results', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);
		const firstRoll = {
			notation: '3d6+4',
			dice: [3, 4, 5],
			slot: 'player-blue:3d6+4',
			color: '#3366ff'
		};

		await runtime.playBatch([firstRoll], '3d-table');
		const firstDice = [...box.diceList];
		expect(box.add).toHaveBeenCalledWith('3d6@3,4,5');
		expect(firstDice.map((die) => die.value)).toEqual([3, 4, 5]);

		await runtime.playBatch([{ ...firstRoll, dice: [6, 2, 1] }], '3d-table');
		expect(box.reroll).toHaveBeenCalledWith([0, 1, 2]);
		expect(box.diceList).toEqual(firstDice);
		expect(box.diceList.map((die) => die.value)).toEqual([6, 2, 1]);
		expect(box.swapDiceFace).toHaveBeenCalledTimes(3);
		expect(box.clear).not.toHaveBeenCalled();
	});

	it('prefers explicit notation and safely infers a d20 fallback', () => {
		expect(diceNotation({ notation: '4d6+2', expression: 'Dano', dice: [1, 2, 3, 4] })).toBe(
			'4d6+2'
		);
		expect(diceNotation({ expression: 'Teste', dice: [8, 12] })).toBe('2d20');
	});

	it('normalizes implicit dice counts and rejects values outside the die range', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);

		await runtime.playBatch([{ notation: 'd20', dice: [20], slot: 'initiative' }], '3d-overlay');
		expect(box.roll).toHaveBeenCalledWith('1d20@20');

		await expect(
			runtime.playBatch([{ notation: 'd6', dice: [7], slot: 'invalid' }], '3d-overlay')
		).rejects.toThrow('O resultado recebido não cabe em um d6.');
	});
});
