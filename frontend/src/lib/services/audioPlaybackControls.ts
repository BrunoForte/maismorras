import { audioAssetLooping, type AudioPlaybackState } from './audioPlayback';

export type AudioPlaybackCommand = 'play' | 'stop';
export type PendingAudioSelection = { path: string | null; loop: boolean };

/** A selection is local intent only: it cannot modify persisted playback state. */
export function createPendingAudioSelection(
	path: string | null,
	suggestedLoop: boolean
): PendingAudioSelection {
	return { path, loop: suggestedLoop };
}

/** Build a per-scene playback command without mutating the selected or current state. */
export function createPlaybackCommand(
	current: AudioPlaybackState,
	selectedPath: string | null,
	selectedLoop: boolean,
	command: AudioPlaybackCommand,
	now = Date.now(),
	currentPositionMs = current.positionMs
): AudioPlaybackState | null {
	if (command === 'stop') {
		if (!current.path || !current.playing) return null;
		return {
			...current,
			playing: false,
			positionMs: Math.max(0, Math.round(currentPositionMs)),
			startedAt: 0,
			revision: (current.revision ?? 0) + 1
		};
	}
	if (
		!selectedPath ||
		(current.path === selectedPath && current.playing && current.loop === selectedLoop)
	)
		return null;
	const resumes = current.path === selectedPath && !current.playing;
	return {
		path: selectedPath,
		playing: true,
		volume: current.volume,
		positionMs: resumes ? Math.max(0, Math.round(current.positionMs)) : 0,
		startedAt: now,
		loop: selectedLoop,
		revision: (current.revision ?? 0) + 1
	};
}

export function createLoopUpdate(
	current: AudioPlaybackState,
	loop: boolean
): AudioPlaybackState | null {
	if (!current.path || (current.loop ?? audioAssetLooping(current.path)) === loop) return null;
	return { ...current, loop, revision: (current.revision ?? 0) + 1 };
}

export function acceptsAudioRevision(
	current: AudioPlaybackState | null,
	incoming: AudioPlaybackState
) {
	return (
		current?.revision === undefined ||
		incoming.revision === undefined ||
		incoming.revision >= current.revision
	);
}
