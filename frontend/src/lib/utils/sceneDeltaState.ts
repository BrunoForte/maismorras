import type { SceneArea, SceneEffect, SceneWall } from '$lib/services/sceneApi';
import type { SceneDelta } from '$lib/services/sceneRealtime';

export type SceneDeltaState = {
	areas: SceneArea[];
	paredes: SceneWall[];
	efeitos: SceneEffect[];
};

/**
 * Collapses duplicate ids at the scene boundary. When records carry an
 * updatedAt timestamp, the newest timestamp wins; ties and legacy records use
 * the last occurrence, which is the incoming value for realtime upserts.
 */
export function normalizeSceneItemsByKey<T>(
	items: readonly T[] | null | undefined,
	keyFor: (item: T) => string
): T[] {
	if (!items?.length) return [];
	const seen = new Set<string>();
	let alreadyNormalized = true;
	for (const item of items) {
		const key = keyFor(item);
		if (!item || typeof key !== 'string' || !key.trim() || seen.has(key)) {
			alreadyNormalized = false;
			break;
		}
		seen.add(key);
	}
	if (alreadyNormalized) return items as T[];
	const byId = new Map<string, T>();
	for (const item of items ?? []) {
		if (!item) continue;
		const key = keyFor(item);
		if (typeof key !== 'string' || !key.trim()) continue;
		const previous = byId.get(key);
		if (!previous) {
			byId.set(key, item);
			continue;
		}
		const previousUpdatedAt = (previous as { updatedAt?: string | null }).updatedAt;
		const nextUpdatedAt = (item as { updatedAt?: string | null }).updatedAt;
		const previousTime = previousUpdatedAt ? Date.parse(previousUpdatedAt) : Number.NaN;
		const nextTime = nextUpdatedAt ? Date.parse(nextUpdatedAt) : Number.NaN;
		if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime) || nextTime >= previousTime) {
			byId.set(key, item);
		}
	}
	return [...byId.values()];
}

export function normalizeSceneItemsById<T extends { id: string; updatedAt?: string | null }>(
	items: readonly T[] | null | undefined
): T[] {
	return normalizeSceneItemsByKey(items, (item) => item.id);
}

function upsertSceneItem<T extends { id: string; updatedAt?: string | null }>(
	items: readonly T[],
	item: T
): T[] {
	return normalizeSceneItemsById([...items, item]);
}

/** Applies one realtime change without reloading unrelated scene collections. */
export function applySceneDelta(state: SceneDeltaState, delta: SceneDelta): SceneDeltaState {
	const normalized: SceneDeltaState = {
		areas: normalizeSceneItemsById(state.areas),
		paredes: normalizeSceneItemsById(state.paredes),
		efeitos: normalizeSceneItemsById(state.efeitos)
	};
	if (delta.kind === 'area') {
		return {
			...normalized,
			areas:
				delta.action === 'delete'
					? normalized.areas.filter((item) => item.id !== delta.id)
					: upsertSceneItem(normalized.areas, delta.item)
		};
	}
	if (delta.kind === 'wall') {
		return {
			...normalized,
			paredes:
				delta.action === 'delete'
					? normalized.paredes.filter((item) => item.id !== delta.id)
					: upsertSceneItem(normalized.paredes, delta.item)
		};
	}
	return {
		...normalized,
		efeitos:
			delta.action === 'delete'
				? normalized.efeitos.filter((item) => item.id !== delta.id)
				: upsertSceneItem(normalized.efeitos, delta.item)
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
