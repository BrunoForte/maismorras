import { get } from 'svelte/store';
import { describe, expect, it, afterEach } from 'vitest';
import {
	dice3dEnabled,
	diceColor,
	diceRendererEffective,
	diceRendererMode,
	diceRendererError,
	setDiceRendererMode,
	setDiceColor,
	reportDiceRendererFailure
} from './diceOverlayStore';

describe('dice renderer preferences', () => {
	afterEach(() => {
		setDiceRendererMode('2d');
		setDiceColor(null);
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
});
