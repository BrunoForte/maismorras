import { describe, expect, it } from 'vitest';
import { pickProjectedDie, projectDieToViewport, worldDragDelta } from './dicePicking';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('dice pointer picking', () => {
	it('projects die centers and picks the closest visible die', () => {
		const projected = projectDieToViewport(
			{ x: 0, y: 0, z: -5 },
			0.5,
			identity,
			identity,
			800,
			600
		);
		expect(projected?.x).toBe(400);
		expect(projected?.y).toBe(300);
		expect(
			pickProjectedDie(
				[
					{ die: 'far', projected: { ...projected!, depth: 10 } },
					{ die: 'near', projected: { ...projected!, depth: 5 } }
				],
				400,
				300
			)?.die
		).toBe('near');
	});

	it('converts pointer flicks into tabletop direction, with screen y inverted', () => {
		expect(worldDragDelta(20, -10, 2)).toEqual({ x: 10, y: 5 });
	});
});
