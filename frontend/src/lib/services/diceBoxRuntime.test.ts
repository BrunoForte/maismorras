import { describe, expect, it, vi } from 'vitest';
import { DiceBoxRuntime, diceNotation, type DiceBoxPort } from './diceBoxRuntime';

function fakeBox() {
	let groups: Array<{ rolls: Array<{ id: string; value: number }> }> = [];
	const box: DiceBoxPort = {
		roll: vi.fn(async (notation: string) => {
			groups = [{ rolls: makeDice(notation) }];
		}),
		add: vi.fn(async (notation: string) => {
			groups = [...groups, { rolls: makeDice(notation) }];
		}),
		reroll: vi.fn(async (dice) => {
			const count = Array.isArray(dice) ? dice.length : 1;
			groups = [
				...groups,
				{
					rolls: Array.from({ length: count }, (_, index) => ({ id: `reroll-${index}`, value: 4 }))
				}
			];
		}),
		clear: vi.fn(() => {
			groups = [];
		}),
		getRollResults: () => groups
	};
	return box;
}

function makeDice(notation: string) {
	const count = Number(notation.match(/^(\d*)d/i)?.[1] || 1);
	return Array.from({ length: count }, (_, index) => ({
		id: `${notation}-${index}`,
		value: index + 1
	}));
}

describe('DiceBoxRuntime', () => {
	it('shows simultaneous multi-die temporary rolls without replacing the first roll', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);

		await runtime.playBatch(
			[
				{ notation: '2d20+5', slot: 'attack', color: '#aabbcc' },
				{ notation: '4d6+3', slot: 'damage', color: '#aabbcc' }
			],
			'3d-overlay'
		);

		expect(box.roll).toHaveBeenCalledWith('2d20+5', { themeColor: '#aabbcc' });
		expect(box.add).toHaveBeenCalledWith('4d6+3', { themeColor: '#aabbcc' });
		expect(box.getRollResults?.()).toHaveLength(2);
		expect(box.getRollResults?.()?.map((group) => group.rolls?.length)).toEqual([2, 4]);
		runtime.clearTemporary();
		expect(box.clear).toHaveBeenCalledOnce();
	});

	it('keeps all dice in a persistent group and rerolls that complete group', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);
		const roll = { notation: '3d6+4', slot: 'player-blue:3d6+4', color: '#3366ff' };

		await runtime.playBatch([roll], '3d-table');
		const firstGroup = box.getRollResults?.()?.[0]?.rolls;
		expect(firstGroup).toHaveLength(3);

		await runtime.playBatch([roll], '3d-table');
		expect(box.reroll).toHaveBeenCalledWith(firstGroup, { remove: true, newStartPoint: false });
		expect(box.getRollResults?.()?.at(-1)?.rolls).toHaveLength(3);
		expect(box.clear).not.toHaveBeenCalled();
	});

	it('prefers explicit notation and safely infers a d20 fallback', () => {
		expect(diceNotation({ notation: '4d6+2', expression: 'Dano', dice: [1, 2, 3, 4] })).toBe(
			'4d6+2'
		);
		expect(diceNotation({ expression: 'Teste', dice: [8, 12] })).toBe('2d20');
	});
});
