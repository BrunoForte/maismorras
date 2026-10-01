import { describe, expect, it } from 'vitest';
import {
	acceptsAudioRevision,
	createLoopUpdate,
	createPendingAudioSelection,
	createPlaybackCommand
} from './audioPlaybackControls';
import type { AudioPlaybackState } from './audioPlayback';

const current: AudioPlaybackState = {
	path: 'music_loop__old.mp3',
	playing: true,
	volume: 0.7,
	positionMs: 3000,
	startedAt: 100,
	revision: 8,
	loop: true
};

describe('audio playback commands', () => {
	it('keeps selection local until Play builds a new command', () => {
		const selection = createPendingAudioSelection('effect_once__rain.mp3', false);
		expect(current.path).toBe('music_loop__old.mp3');
		expect(selection).toEqual({ path: 'effect_once__rain.mp3', loop: false });
		const next = createPlaybackCommand(current, selection.path, selection.loop, 'play', 500);
		expect(next).toMatchObject({
			path: selection.path,
			playing: true,
			positionMs: 0,
			loop: false,
			revision: 9
		});
		expect(current.path).toBe('music_loop__old.mp3');
	});

	it('resumes a paused same track from its saved position and preserves loop choice', () => {
		const paused = { ...current, playing: false, loop: false };
		expect(createPlaybackCommand(paused, paused.path, false, 'play', 900)).toMatchObject({
			path: paused.path,
			positionMs: 3000,
			startedAt: 900,
			loop: false,
			revision: 9
		});
	});

	it('stops with fadeable state, the current playback position and no start timestamp', () => {
		expect(createPlaybackCommand(current, 'other.mp3', true, 'stop', 900, 4321)).toMatchObject({
			path: current.path,
			playing: false,
			positionMs: 4321,
			startedAt: 0,
			revision: 9,
			loop: true
		});
	});

	it('updates and persists loop independently from file naming suggestions', () => {
		expect(createLoopUpdate(current, false)).toMatchObject({
			loop: false,
			path: current.path,
			revision: 9
		});
		expect(createLoopUpdate({ ...current, loop: false }, false)).toBeNull();
		expect(createLoopUpdate({ ...current, loop: undefined }, true)).toBeNull();
	});

	it('rejects stale remote revisions but accepts equal or newer values', () => {
		expect(acceptsAudioRevision(current, { ...current, revision: 7 })).toBe(false);
		expect(acceptsAudioRevision(current, { ...current, revision: 8 })).toBe(true);
		expect(acceptsAudioRevision(current, { ...current, revision: 9 })).toBe(true);
	});
});
