import { describe, expect, it, vi } from 'vitest';
import {
	isValidCharacterSheetInvalidation,
	isValidSceneDelta,
	notifySingleSceneRefresh
} from './sceneRealtime';

const uuid = '12345678-1234-4234-a234-123456789012';

describe('shared scene reconnect invalidation', () => {
	it('runs one synchronization callback for the shared connection', () => {
		const first = vi.fn();
		const second = vi.fn();
		expect(notifySingleSceneRefresh([first, second])).toBe(true);
		expect(first).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
	});

	it('skips subscribers without a scene resync callback', () => {
		const sync = vi.fn();
		expect(notifySingleSceneRefresh([undefined, sync, vi.fn()])).toBe(true);
		expect(sync).toHaveBeenCalledOnce();
	});

	it('does not synchronize on the initial open when no reconnect occurred', () => {
		const sync = vi.fn();
		expect(notifySingleSceneRefresh([])).toBe(false);
		expect(sync).not.toHaveBeenCalled();
	});
});

describe('realtime scene delta validation', () => {
	it('accepts incremental upsert and delete envelopes', () => {
		expect(isValidSceneDelta({ kind: 'area', action: 'upsert', item: { id: uuid } })).toBe(true);
		expect(isValidSceneDelta({ kind: 'wall', action: 'delete', id: uuid })).toBe(true);
	});

	it('rejects malformed or unsupported deltas so callers can refresh from REST', () => {
		for (const event of [
			null,
			{ kind: 'token', action: 'upsert', item: { id: uuid } },
			{ kind: 'effect', action: 'upsert', item: {} },
			{ kind: 'wall', action: 'delete', id: 'short' }
		]) {
			expect(isValidSceneDelta(event)).toBe(false);
		}
	});
});

describe('character sheet realtime invalidation', () => {
	it('uses a minimal actor identifier signal and rejects malformed ids', () => {
		const valid = { actorId: uuid };
		expect(JSON.stringify({ type: 'character.sheet.invalidated', data: valid })).not.toContain(
			'armorClass'
		);
		expect(isValidCharacterSheetInvalidation(valid)).toBe(true);
		expect(isValidCharacterSheetInvalidation({ ...valid, sheet: { armorClass: 12 } })).toBe(false);
		expect(isValidCharacterSheetInvalidation({ actorId: 'short' })).toBe(false);
	});
});
