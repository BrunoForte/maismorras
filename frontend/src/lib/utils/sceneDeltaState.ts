import type { SceneArea, SceneEffect, SceneWall } from '$lib/services/sceneApi';
import type { SceneDelta } from '$lib/services/sceneRealtime';

export type SceneDeltaState = {
	areas: SceneArea[];
	paredes: SceneWall[];
	efeitos: SceneEffect[];
};

/** Applies one realtime change without reloading unrelated scene collections. */
export function applySceneDelta(state: SceneDeltaState, delta: SceneDelta): SceneDeltaState {
	if (delta.kind === 'area') {
		return {
			...state,
			areas:
				delta.action === 'delete'
					? state.areas.filter((item) => item.id !== delta.id)
					: [...state.areas.filter((item) => item.id !== delta.item.id), delta.item]
		};
	}
	if (delta.kind === 'wall') {
		return {
			...state,
			paredes:
				delta.action === 'delete'
					? state.paredes.filter((item) => item.id !== delta.id)
					: [...state.paredes.filter((item) => item.id !== delta.item.id), delta.item]
		};
	}
	return {
		...state,
		efeitos:
			delta.action === 'delete'
				? state.efeitos.filter((item) => item.id !== delta.id)
				: [...state.efeitos.filter((item) => item.id !== delta.item.id), delta.item]
	};
}

/** Builds the grid cells covered by the square fog brush centered on a map point. */
export function fogBrushCells(
	worldX: number,
	worldY: number,
	gridSize: number,
	brushSize: number
): [number, number][] {
	if (![worldX, worldY, gridSize, brushSize].every(Number.isFinite) || gridSize <= 0) return [];
	const centerX = Math.floor(worldX / gridSize);
	const centerY = Math.floor(worldY / gridSize);
	const radius = Math.floor(Math.max(1, brushSize) / 2);
	const cells: [number, number][] = [];
	for (let x = centerX - radius; x <= centerX + radius; x++) {
		for (let y = centerY - radius; y <= centerY + radius; y++) cells.push([x, y]);
	}
	return cells;
}
