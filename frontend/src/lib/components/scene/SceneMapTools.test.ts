import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { SceneMapToolsActions, SceneMapToolsState } from '$lib/utils/sceneMapTools';
import SceneMapTools from './SceneMapTools.svelte';

const actions: SceneMapToolsActions = {
	onFogModeToggle: vi.fn(),
	onFogBrushChange: vi.fn(),
	onZoom: vi.fn(),
	onRecenter: vi.fn(),
	onToggleGrid: vi.fn(),
	onToggleLayer: vi.fn(),
	onToolToggle: vi.fn(),
	onAreaLabelChange: vi.fn(),
	onAreaVisibilityToggle: vi.fn(),
	onSaveAreaToggle: vi.fn(),
	onAreaRemove: vi.fn(),
	onWallKindChange: vi.fn(),
	onWallDrawingToggle: vi.fn(),
	onDoorToggle: vi.fn(),
	onWallRemove: vi.fn()
};

function state(openTool: SceneMapToolsState['openTool'], isGM = true): SceneMapToolsState {
	return {
		isGM,
		isEnglish: false,
		fogEnabled: isGM,
		fogMode: null,
		fogBrush: 1,
		areas: [],
		saveAreaArmed: false,
		areaLabel: '',
		areaVisible: true,
		walls: [],
		wallDrawing: false,
		wallKind: 'wall',
		openTool,
		cameraZoom: 1,
		gridVisible: true,
		wallsVisible: true,
		areasVisible: true
	};
}

describe('SceneMapTools menus', () => {
	it('does not render GM controls for players while retaining camera tools', () => {
		const { body } = render(SceneMapTools, {
			props: { state: state(null, false), actions }
		});
		expect(body).not.toContain('table-tools-gm');
		expect(body).not.toContain('fog-tools');
		expect(body).toContain('camera-tools');
	});

	it('renders fog controls for the GM', () => {
		const { body } = render(SceneMapTools, { props: { state: state(null), actions } });
		expect(body).toContain('table-tools-gm');
		expect(body).toContain('fog-tools');
	});

	it.each([
		['layers', 'Camadas do mapa'],
		['areas', 'Área persistente'],
		['barriers', 'Barreiras']
	] as const)('uses the shared accessible menu surface for %s', (tool, label) => {
		const { body } = render(SceneMapTools, { props: { state: state(tool), actions } });
		expect(body).toContain('map-tool-menu');
		expect(body).toContain(`aria-label="${label}"`);
		expect(body).toContain('role="group"');
	});

	it('retains keyboard-operable labelled triggers and does not render map menus to players', () => {
		const { body } = render(SceneMapTools, {
			props: { state: state(null, false), actions }
		});
		expect(body).toContain('aria-label="Recentralizar mapa"');
		expect(body).not.toContain('Barreiras');
		expect(body).not.toContain('map-tool-menu');
	});
});
