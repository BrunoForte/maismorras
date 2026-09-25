import { describe, expect, it, vi } from 'vitest';
import {
	DiceBoxRuntime,
	diceNotation,
	randomDiceThrow,
	unseenDiceRolls,
	type DiceBoxPort
} from './diceBoxRuntime';

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

	it('uses the installed DiceBox clearDice API and safely ignores absent legacy clear methods', () => {
		const box = fakeBox();
		box.clearDice = vi.fn();
		const runtime = new DiceBoxRuntime(box);

		expect(() => runtime.clearTemporary()).not.toThrow();
		expect(box.clearDice).toHaveBeenCalledOnce();
		expect(box.clear).not.toHaveBeenCalled();
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

	it('lets a persistent die follow the pointer and applies the flick impulse on release', async () => {
		const box = fakeBox();
		const runtime = new DiceBoxRuntime(box);
		const vector = (z = 0) => ({
			x: 0,
			y: 0,
			z,
			set(x: number, y: number, nextZ: number) {
				this.x = x;
				this.y = y;
				this.z = nextZ;
			}
		});
		const die = {
			position: vector(),
			body: {
				position: vector(8),
				velocity: vector(),
				angularVelocity: vector(),
				type: 1,
				wakeUp: vi.fn()
			}
		};
		box.diceList.push(die);

		expect(runtime.movePersistentDie(die, 12, 24)).toBe(true);
		expect(die.body.type).toBe(4);
		expect(die.body.position).toMatchObject({ x: 12, y: 24, z: 8 });

		await runtime.throwPersistentDie(die, { x: 150, y: -80 });
		expect(box.reroll).toHaveBeenCalledWith([0]);
		expect(die.body.type).toBe(1);
		expect(die.body.velocity).toMatchObject({ x: 150, y: -80, z: 1200 });
		expect(die.body.angularVelocity.x).toBeCloseTo((80 / Math.hypot(150, -80)) * 25);
		expect(die.body.angularVelocity.y).toBeCloseTo((150 / Math.hypot(150, -80)) * 25);
		expect(die.body.wakeUp).toHaveBeenCalledOnce();
	});

	it('prefers explicit notation and safely infers a d20 fallback', () => {
		expect(diceNotation({ notation: '4d6+2', expression: 'Dano', dice: [1, 2, 3, 4] })).toBe(
			'4d6+2'
		);
		expect(diceNotation({ expression: 'Teste', dice: [8, 12] })).toBe('2d20');
	});

	it('does not replay a persistent die when reactive state is re-rendered or dragged', () => {
		const seen = new Set<string>();
		const roll = { nonce: 'roll-1', expression: 'Ataque', total: 18 };

		expect(unseenDiceRolls([roll], seen)).toEqual([roll]);
		// Pan, zoom, and pointer-drag updates may render the dice layer again but
		// do not create another roll event; the existing nonce remains consumed.
		expect(unseenDiceRolls([{ ...roll }], seen)).toEqual([]);
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

	it('generates varied physical impulses for automatic persistent rerolls', () => {
		const values = [0, 1, 0.5, 0, 1, 0.5];
		const impulse = randomDiceThrow(() => values.shift() ?? 0.5);
		expect(impulse.velocity).toEqual({ x: -600, y: 600, z: 900 });
		expect(impulse.spin).toEqual({ x: -45, y: 45, z: 0 });
	});
});
