import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import SceneMapTools from './SceneMapTools.svelte';
import type { SceneMapToolsActions, SceneMapToolsState } from '$lib/utils/sceneMapTools';

function createProps(isGM: boolean) {
	const state: SceneMapToolsState = {
		isGM,
		isEnglish: false,
		fogEnabled: true,
		fogMode: null,
		fogBrush: 1,
		areas: [],
		saveAreaArmed: false,
		areaLabel: 'Área de efeito',
		areaVisible: true,
		walls: [],
		wallDrawing: false,
		wallKind: 'wall',
		openTool: null,
		cameraZoom: 1,
		gridVisible: true,
		wallsVisible: true,
		areasVisible: true
	};
	const noop = vi.fn();
	const actions: SceneMapToolsActions = {
		onFogModeToggle: noop,
		onFogBrushChange: noop,
		onZoom: noop,
		onRecenter: noop,
		onToggleGrid: noop,
		onToggleLayer: noop,
		onToolToggle: noop,
		onAreaLabelChange: noop,
		onAreaVisibilityToggle: noop,
		onSaveAreaToggle: noop,
		onAreaRemove: noop,
		onWallKindChange: noop,
		onWallDrawingToggle: noop,
		onDoorToggle: noop,
		onWallRemove: noop
	};
	return { state, actions };
}

describe('SceneMapTools', () => {
	it('does not render GM controls for players', () => {
		const { body } = render(SceneMapTools, { props: createProps(false) });

		expect(body).not.toContain('table-tools-gm');
		expect(body).not.toContain('fog-tools');
		expect(body).toContain('camera-tools');
	});

	it('renders fog and map-editing controls for the GM', () => {
		const { body } = render(SceneMapTools, { props: createProps(true) });

		expect(body).toContain('table-tools-gm');
		expect(body).toContain('fog-tools');
	});
});
