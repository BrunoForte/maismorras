import { describe, expect, it } from 'vitest';
import { readSheetPanelMode, sheetPanelModeKey, writeSheetPanelMode } from './sheetPanelMode';

describe('sheet panel mode preference', () => {
	it('keeps mode independently for each campaign and character', () => {
		const storage = new Map<string, string>();
		const adapter = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value)
		};
		const playerKey = sheetPanelModeKey('campaign-a', 'character-a');
		const gmKey = sheetPanelModeKey('campaign-a', 'character-b');
		writeSheetPanelMode(adapter, playerKey, 'floating');
		writeSheetPanelMode(adapter, gmKey, 'docked');
		expect(readSheetPanelMode(adapter, playerKey)).toBe('floating');
		expect(readSheetPanelMode(adapter, gmKey)).toBe('docked');
		expect(readSheetPanelMode(adapter, sheetPanelModeKey('campaign-b', 'character-a'))).toBe(
			'docked'
		);
	});

	it('defaults safely to docked if storage is unavailable or contains an unknown value', () => {
		const brokenStorage = {
			getItem: () => {
				throw new Error('storage disabled');
			},
			setItem: () => {
				throw new Error('storage disabled');
			}
		};
		const key = sheetPanelModeKey('campaign', null);
		expect(readSheetPanelMode(null, key)).toBe('docked');
		expect(readSheetPanelMode({ getItem: () => 'unexpected' }, key)).toBe('docked');
		writeSheetPanelMode(brokenStorage, key, 'floating');
	});
});
