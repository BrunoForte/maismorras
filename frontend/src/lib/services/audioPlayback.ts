export type AudioPlaybackState = {
	path: string | null;
	playing: boolean;
	volume: number;
	positionMs: number;
	startedAt: number;
	revision?: number;
};

export type AudioAssetKind = 'music' | 'effect';

/** Legacy audio files remain music; new uploads carry an explicit, path-stable kind prefix. */
export function audioAssetKind(name: string): AudioAssetKind {
	return /(?:^|[-/])(?:effect|sfx)__/.test(name) ? 'effect' : 'music';
}

export function audioAssetDisplayName(name: string): string {
	return name
		.split('/')
		.at(-1)!
		.replace(/^[a-f0-9-]+-/, '')
		.replace(/^(?:effect|sfx|music)__/, '');
}

/** Applies a listener's local output preference without changing shared scene state. */
export function withListenerVolume(
	state: AudioPlaybackState,
	listenerPercent: number
): AudioPlaybackState {
	const local = Math.max(
		0,
		Math.min(100, Number.isFinite(listenerPercent) ? listenerPercent : 100)
	);
	return { ...state, volume: Math.max(0, Math.min(1, state.volume * (local / 100))) };
}

/** Crossfades two HTMLAudioElements without replacing the active source on refreshes. */
export class CrossfadeAudio {
	private activeIndex = 0;
	private activePath = '';
	private revision = 0;

	constructor(
		private readonly elements: [HTMLAudioElement, HTMLAudioElement],
		private readonly fadeMs = 450
	) {
		for (const element of elements) {
			element.loop = true;
			element.preload = 'auto';
		}
	}

	get path() {
		return this.activePath;
	}

	get currentTime() {
		return this.elements[this.activeIndex].currentTime;
	}

	async apply(
		state: AudioPlaybackState,
		resolveUrl: (path: string) => Promise<string>
	): Promise<boolean> {
		if (state.revision !== undefined && state.revision < this.revision) return false;
		if (state.revision !== undefined) this.revision = state.revision;
		const volume = Math.max(0, Math.min(1, state.volume));
		if (!state.path) {
			await this.fadeTo(this.elements[this.activeIndex], 0);
			for (const element of this.elements) {
				element.pause();
				element.removeAttribute('src');
				element.load();
				element.currentTime = 0;
			}
			this.activePath = '';
			return true;
		}

		const current = this.elements[this.activeIndex];
		if (this.activePath === state.path && current.src) {
			current.volume = volume;
			this.syncPosition(current, state);
			if (state.playing) {
				try {
					await current.play();
					return true;
				} catch {
					return false;
				}
			}
			await this.fadeTo(current, 0);
			current.pause();
			current.volume = volume;
			return true;
		}

		const url = await resolveUrl(state.path);
		if (!url) return false;
		const nextIndex = this.activeIndex === 0 ? 1 : 0;
		const next = this.elements[nextIndex];
		next.pause();
		next.src = url;
		next.currentTime = Math.max(0, this.positionSeconds(state));
		next.volume = state.playing ? 0 : volume;
		next.load();
		this.activePath = state.path;
		this.activeIndex = nextIndex;
		if (!state.playing) {
			await this.fadeTo(current, 0);
			current.pause();
			next.volume = volume;
			return true;
		}
		try {
			await next.play();
		} catch {
			return false;
		}
		await Promise.all([this.fadeTo(current, 0), this.fadeTo(next, volume)]);
		current.pause();
		current.removeAttribute('src');
		current.load();
		return true;
	}

	private positionSeconds(state: AudioPlaybackState) {
		const elapsed = state.playing && state.startedAt > 0 ? Date.now() - state.startedAt : 0;
		return Math.max(0, (state.positionMs + elapsed) / 1000);
	}

	private syncPosition(element: HTMLAudioElement, state: AudioPlaybackState) {
		const target = this.positionSeconds(state);
		if (Number.isFinite(target) && Math.abs(element.currentTime - target) > 1.5)
			element.currentTime = target;
	}

	private fadeTo(element: HTMLAudioElement, target: number) {
		const initial = element.volume;
		if (this.fadeMs <= 0 || Math.abs(initial - target) < 0.01) {
			element.volume = target;
			return Promise.resolve();
		}
		const started = performance.now();
		return new Promise<void>((resolve) => {
			const step = (now: number) => {
				const progress = Math.max(0, Math.min(1, (now - started) / this.fadeMs));
				element.volume = Math.max(0, Math.min(1, initial + (target - initial) * progress));
				if (progress < 1) requestAnimationFrame(step);
				else resolve();
			};
			requestAnimationFrame(step);
		});
	}
}
