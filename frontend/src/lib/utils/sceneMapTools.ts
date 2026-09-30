import type { SceneArea, SceneWall } from '$lib/services/sceneApi';

export type SceneMapTool = 'layers' | 'areas' | 'barriers';
export type SceneFogMode = 'reveal' | 'hide' | null;
export type SceneWallKind = 'wall' | 'door';

export type SceneMapToolsState = {
	isGM: boolean;
	isEnglish: boolean;
	fogEnabled: boolean;
	fogMode: SceneFogMode;
	fogBrush: number;
	areas: SceneArea[];
	saveAreaArmed: boolean;
	areaLabel: string;
	areaVisible: boolean;
	walls: SceneWall[];
	wallDrawing: boolean;
	wallKind: SceneWallKind;
	openTool: SceneMapTool | null;
	cameraZoom: number;
	gridVisible: boolean;
	wallsVisible: boolean;
	areasVisible: boolean;
};

export type SceneMapToolsActions = {
	onFogModeToggle: (mode: Exclude<SceneFogMode, null>) => void;
	onFogBrushChange: (brush: number) => void;
	onZoom: (delta: number) => void;
	onRecenter: () => void;
	onToggleGrid: () => void;
	onToggleLayer: (layer: 'walls' | 'areas') => void;
	onToolToggle: (tool: SceneMapTool) => void;
	onAreaLabelChange: (label: string) => void;
	onAreaVisibilityToggle: () => void;
	onSaveAreaToggle: () => void;
	onAreaRemove: (area: SceneArea) => void;
	onWallKindChange: (kind: SceneWallKind) => void;
	onWallDrawingToggle: () => void;
	onDoorToggle: (wall: SceneWall) => void;
	onWallRemove: (wall: SceneWall) => void;
};

/** Clicking an open tool closes it; clicking another tool switches directly to it. */
export function toggleSceneMapTool(
	current: SceneMapTool | null,
	requested: SceneMapTool
): SceneMapTool | null {
	return current === requested ? null : requested;
}
