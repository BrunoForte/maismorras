import { get } from 'svelte/store';
import { describe, expect, it, afterEach } from 'vitest';
import {
	dice3dEnabled,
	diceColor,
	diceRendererEffective,
	diceRendererMode,
	diceRendererError,
	activeDiceRolls,
	completedDiceRollNonces,
	diceOverlay,
	reportDiceAnimationComplete,
	setDiceRendererMode,
	setDiceColor,
	diceResultDisplayDuration,
	reportDiceRendererFailure
} from './diceOverlayStore';

describe('dice renderer preferences', () => {
	afterEach(() => {
		setDiceRendererMode('2d');
		setDiceColor(null);
		diceOverlay.set(null);
	});

	it('supports the lightweight 2D fallback', () => {
		setDiceRendererMode('2d');
		expect(get(diceRendererMode)).toBe('2d');
		expect(get(diceRendererEffective)).toBe('2d');
		expect(get(dice3dEnabled)).toBe(false);
	});

	it('keeps persistent 3D as an explicit mode', () => {
		setDiceRendererMode('3d-table');
		expect(get(diceRendererMode)).toBe('3d-table');
		expect(get(diceRendererEffective)).toBe('3d-table');
		expect(get(dice3dEnabled)).toBe(true);
	});

	it('normalizes miniature colors for DiceBox themes', () => {
		setDiceColor(0x12abef);
		expect(get(diceColor)).toBe('#12abef');
	});

	it('keeps a visible failure message and activates the 2D fallback when DiceBox fails', () => {
		setDiceRendererMode('3d-overlay');
		reportDiceRendererFailure();

		expect(get(diceRendererEffective)).toBe('2d');
		expect(get(diceRendererError)).toMatch(/Não foi possível iniciar os dados 3D/);
	});

	it('waits on each roll nonce and clears completion state between batches', async () => {
		diceOverlay.set({ expression: 'Percepção', total: 14, dice: [11], notation: '1d20+3' });
		await Promise.resolve();
		const [roll] = get(activeDiceRolls);
		expect(roll.nonce).toBeTruthy();
		expect(get(completedDiceRollNonces)).not.toContain(roll.nonce);

		reportDiceAnimationComplete([roll.nonce!]);
		expect(get(completedDiceRollNonces)).toContain(roll.nonce);
		diceOverlay.set(null);
		expect(get(completedDiceRollNonces)).toEqual([]);
	});

	it('queues up to ten simultaneous results, in four-per-row groups, with proportional display time', async () => {
		for (let index = 0; index < 10; index += 1) {
			diceOverlay.set({ expression: `Teste ${index + 1}`, total: index + 1, dice: [index + 1] });
		}
		await Promise.resolve();
		expect(get(activeDiceRolls)).toHaveLength(10);
		expect(diceResultDisplayDuration(1)).toBe(5000);
		expect(diceResultDisplayDuration(10)).toBe(14000);
		expect(diceResultDisplayDuration(20)).toBe(14000);
	});
});
