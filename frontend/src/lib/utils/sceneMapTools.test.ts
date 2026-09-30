import { describe, expect, it } from 'vitest';
import { toggleSceneMapTool } from './sceneMapTools';

describe('toggleSceneMapTool', () => {
	it('opens a tool when none is open', () => {
		expect(toggleSceneMapTool(null, 'layers')).toBe('layers');
	});

	it('closes the currently open tool when clicked again', () => {
		expect(toggleSceneMapTool('areas', 'areas')).toBeNull();
	});

	it('switches directly from one tool to another', () => {
		expect(toggleSceneMapTool('layers', 'barriers')).toBe('barriers');
	});
});
