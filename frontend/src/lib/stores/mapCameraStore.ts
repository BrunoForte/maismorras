import { writable } from 'svelte/store';

export type MapCameraView = { x: number; y: number; zoom: number };

/** Shared view transform so table dice follow the same pan/zoom as the map. */
export const mapCameraView = writable<MapCameraView>({ x: 0, y: 0, zoom: 1 });

export function setMapCameraView(view: MapCameraView) {
	if (![view.x, view.y, view.zoom].every(Number.isFinite)) return;
	mapCameraView.set({
		x: view.x,
		y: view.y,
		zoom: Math.max(0.3, Math.min(3, view.zoom))
	});
}
