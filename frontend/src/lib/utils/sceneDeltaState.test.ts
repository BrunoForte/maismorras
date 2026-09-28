import { describe, expect, it } from 'vitest';
import { applySceneDelta, fogBrushCells } from './sceneDeltaState';
import type { SceneArea, SceneEffect, SceneWall } from '$lib/services/sceneApi';

const area = (id: string) => ({ id, shape: 'circle' }) as SceneArea;
const wall = (id: string) => ({ id, kind: 'wall' }) as SceneWall;
const effect = (id: string) => ({ id, name: id }) as SceneEffect;

describe('applySceneDelta', () => {
	it('updates only the collection addressed by the realtime event', () => {
		const state = { areas: [area('a')], paredes: [wall('w')], efeitos: [effect('e')] };
		const next = applySceneDelta(state, { kind: 'area', action: 'upsert', item: area('b') });
		expect(next.areas.map((item) => item.id)).toEqual(['a', 'b']);
		expect(next.paredes).toBe(state.paredes);
		expect(next.efeitos).toBe(state.efeitos);
	});

	it('replaces existing entries and removes deleted entries by id', () => {
		const original = area('a');
		const replacement = { ...original, shape: 'line' } as SceneArea;
		const state = { areas: [original], paredes: [wall('w')], efeitos: [effect('e')] };
		const updated = applySceneDelta(state, { kind: 'area', action: 'upsert', item: replacement });
		expect(updated.areas).toEqual([replacement]);
		const deleted = applySceneDelta(updated, { kind: 'area', action: 'delete', id: 'a' });
		expect(deleted.areas).toEqual([]);
	});
});

describe('fogBrushCells', () => {
	it('returns the centered square of grid cells and rejects invalid geometry', () => {
		expect(fogBrushCells(25, 25, 50, 1)).toEqual([[0, 0]]);
		expect(fogBrushCells(75, 75, 50, 3)).toHaveLength(9);
		expect(fogBrushCells(0, 0, 0, 3)).toEqual([]);
	});
});
