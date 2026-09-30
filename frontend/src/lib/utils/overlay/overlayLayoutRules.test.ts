import { describe, expect, it } from 'vitest';
import {
	createDefaultOverlayDocument,
	createDefaultOverlayLayout,
	createOverlayProfile,
	deleteOverlayProfile,
	moveOverlayBlock,
	normalizeOverlayDocument,
	normalizeOverlayLayout,
	renameOverlayProfile,
	resizeOverlayBlock,
	selectOverlayProfile,
	snapOverlayPosition,
	updateOverlayBlockProperty
} from './overlayLayoutRules';

describe('overlayLayoutRules', () => {
	it('normalizes missing and malformed layout values using defaults', () => {
		const defaults = createDefaultOverlayLayout();
		const normalized = normalizeOverlayLayout({ background: 12, blocks: 'invalid' });
		expect(normalized.background).toBe('');
		expect(normalized.livekitUrl).toBe('');
		expect(normalized.blocks).toEqual(defaults.blocks);
	});

	it('loads legacy single-layout documents and preserves current profile documents', () => {
		const legacy = normalizeOverlayDocument({
			background: 'bg.webp',
			livekitRoom: 'room',
			blocks: []
		});
		expect(legacy.activeProfile).toBe('Principal');
		expect(legacy.profiles.Principal.background).toBe('bg.webp');
		const current = normalizeOverlayDocument({
			activeProfile: 'Combate',
			profiles: { Principal: { background: '' }, Combate: { background: 'fight.webp', blocks: [] } }
		});
		expect(current.activeProfile).toBe('Combate');
		expect(current.profiles.Combate.background).toBe('fight.webp');
		expect(current.profiles.Principal.blocks).toHaveLength(9);
	});

	it('falls back to the first valid profile and the default document on invalid input', () => {
		const document = normalizeOverlayDocument({
			activeProfile: 'missing',
			profiles: { Principal: {} }
		});
		expect(document.activeProfile).toBe('Principal');
		expect(normalizeOverlayDocument(null)).toEqual(createDefaultOverlayDocument());
	});

	it('supports profile selection, duplicate, rename, and protected final profile', () => {
		const initial = createDefaultOverlayDocument();
		const created = createOverlayProfile(initial, initial.profiles.Principal, ' Combate ');
		expect(created?.document.activeProfile).toBe('Combate');
		expect(created?.layout).not.toBe(initial.profiles.Principal);
		expect(createOverlayProfile(initial, initial.profiles.Principal, 'Principal')).toBeNull();
		const selected = selectOverlayProfile(created!.document, created!.layout, 'Principal');
		expect(selected.document.activeProfile).toBe('Principal');
		const renamed = renameOverlayProfile(created!.document, 'Batalha');
		expect(renamed?.activeProfile).toBe('Batalha');
		expect(renameOverlayProfile(created!.document, 'Principal')).toBeNull();
		expect(deleteOverlayProfile(initial)).toBeNull();
		expect(deleteOverlayProfile(created!.document)?.activeProfile).toBe('Principal');
	});

	it('snaps to grid/alignment and clamps positions to canvas boundaries', () => {
		const layout = createDefaultOverlayLayout();
		const block = layout.blocks.find((item) => item.id === 'host-camera')!;
		const aligned = snapOverlayPosition(layout, block.id, 50.8, 39.5, true);
		expect(aligned.x).toBe(50);
		expect(aligned.y).toBe(40);
		expect(snapOverlayPosition(layout, block.id, -30, 150, false)).toEqual({
			x: block.width / 2,
			y: 100 - block.height / 2
		});
	});

	it('keeps blocked blocks in place and refuses resizing', () => {
		const layout = createDefaultOverlayLayout();
		const locked = updateOverlayBlockProperty(layout, 'dice', 'locked', true);
		expect(snapOverlayPosition(locked, 'dice', 25, 25, true)).toEqual({ x: 50, y: 57 });
		expect(
			moveOverlayBlock(locked, 'dice', 20, 20).blocks.find((item) => item.id === 'dice')
		).toMatchObject({ x: 50, y: 57 });
		expect(
			resizeOverlayBlock(locked, 'dice', 90, 90).blocks.find((item) => item.id === 'dice')
		).toMatchObject({ width: 36, height: 52 });
	});

	it('clamps inspector dimensions, position, opacity, and rejects invalid values', () => {
		const layout = createDefaultOverlayLayout();
		const updated = updateOverlayBlockProperty(layout, 'host-camera', 'width', '1000');
		expect(updated.blocks.find((item) => item.id === 'host-camera')?.width).toBe(100);
		const moved = updateOverlayBlockProperty(updated, 'host-camera', 'x', '-4');
		expect(moved.blocks.find((item) => item.id === 'host-camera')?.x).toBe(50);
		const opacity = updateOverlayBlockProperty(moved, 'host-camera', 'opacity', '150');
		expect(opacity.blocks.find((item) => item.id === 'host-camera')?.opacity).toBe(100);
		expect(updateOverlayBlockProperty(layout, 'host-camera', 'x', 'bad')).toBe(layout);
	});
});
