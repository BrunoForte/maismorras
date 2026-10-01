export type AudioPlaybackState = {
	path: string | null;
	playing: boolean;
	volume: number;
	positionMs: number;
	startedAt: number;
	revision?: number;
	loop?: boolean;
};

export type AudioAssetKind = 'music' | 'effect';

/** Legacy audio files remain music; new uploads carry an explicit, path-stable kind prefix. */
export function audioAssetKind(name: string): AudioAssetKind {
	return /(?:^|[-/])(?:effect(?:_(?:loop|once))?|sfx)__/.test(name) ? 'effect' : 'music';
}

/** Legacy assets default to their category's conventional loop behavior. */
export function audioAssetLooping(name: string): boolean {
	if (/(?:^|[-/])(?:music|effect)_once__/.test(name)) return false;
	if (/(?:^|[-/])(?:music|effect)_loop__/.test(name)) return true;
	return audioAssetKind(name) === 'music';
}

export function audioAssetDisplayName(name: string): string {
	return name
		.split('/')
		.at(-1)!
		.replace(/^[a-f0-9-]+-/, '')
		.replace(/^(?:effect|sfx|music)(?:_(?:loop|once))?__/, '');
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
	private applyGeneration = 0;
	private targetVolume = 1;
	private lastFailure: 'autoplay' | 'unavailable' | null = null;

	constructor(
		private readonly elements: [HTMLAudioElement, HTMLAudioElement],
		private readonly fadeMs = 450
	) {
		for (const element of elements) {
			element.preload = 'auto';
		}
	}

	get path() {
		return this.activePath;
	}

	get currentTime() {
		return this.elements[this.activeIndex].currentTime;
	}

	get failureReason() {
		return this.lastFailure;
	}

	/** Resume an already-resolved source directly in a user-gesture call stack. */
	async resumeFromGesture(): Promise<boolean> {
		const generation = ++this.applyGeneration;
		const element = this.elements[this.activeIndex];
		if (!element.src) return false;
		this.lastFailure = null;
		element.volume = 0;
		try {
			const started = element.play();
			await started;
			if (generation !== this.applyGeneration) return false;
			await this.fadeTo(element, this.targetVolume, generation);
			return generation === this.applyGeneration;
		} catch {
			if (generation === this.applyGeneration) this.lastFailure = 'autoplay';
			return false;
		}
	}

	dispose() {
		this.applyGeneration++;
		this.revision = -1;
		this.activePath = '';
		this.activeIndex = 0;
		this.lastFailure = null;
		for (const element of this.elements) {
			element.pause();
			element.removeAttribute('src');
			element.volume = 0;
			element.load();
			element.currentTime = 0;
		}
	}

	async apply(
		state: AudioPlaybackState,
		resolveUrl: (path: string) => Promise<string>
	): Promise<boolean> {
		if (state.revision !== undefined && state.revision < this.revision) return false;
		if (state.revision !== undefined) this.revision = state.revision;
		const generation = ++this.applyGeneration;
		this.lastFailure = null;
		const volume = Math.max(0, Math.min(1, state.volume));
		this.targetVolume = volume;
		const loop = state.loop ?? (state.path ? audioAssetLooping(state.path) : false);
		if (!state.path) {
			await Promise.all(this.elements.map((element) => this.fadeTo(element, 0, generation)));
			if (generation !== this.applyGeneration) return false;
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
			current.loop = loop;
			current.volume = volume;
			this.syncPosition(current, state);
			if (state.playing) {
				try {
					await current.play();
					return true;
				} catch {
					this.lastFailure = 'autoplay';
					return false;
				}
			}
			await this.fadeTo(current, 0, generation);
			if (generation !== this.applyGeneration) return false;
			current.pause();
			current.volume = volume;
			return true;
		}

		let url: string;
		try {
			url = await resolveUrl(state.path);
		} catch {
			if (generation === this.applyGeneration) {
				this.lastFailure = 'unavailable';
			}
			return false;
		}
		if (!url) {
			if (generation === this.applyGeneration) {
				this.lastFailure = 'unavailable';
			}
			return false;
		}
		if (generation !== this.applyGeneration) return false;
		const nextIndex = this.activeIndex === 0 ? 1 : 0;
		const next = this.elements[nextIndex];
		next.pause();
		next.src = url;
		next.loop = loop;
		next.currentTime = Math.max(0, this.positionSeconds(state));
		next.volume = state.playing ? 0 : volume;
		next.load();
		if (!state.playing) {
			await this.fadeTo(current, 0, generation);
			if (generation !== this.applyGeneration) return false;
			current.pause();
			next.volume = volume;
			this.activePath = state.path;
			this.activeIndex = nextIndex;
			return true;
		}
		try {
			await next.play();
		} catch {
			if (generation === this.applyGeneration) {
				next.pause();
				next.volume = 0;
				await this.fadeTo(current, 0, generation);
				if (generation === this.applyGeneration) {
					current.pause();
					current.removeAttribute('src');
					current.load();
					this.activePath = state.path;
					this.activeIndex = nextIndex;
					this.lastFailure = 'autoplay';
				}
			}
			return false;
		}
		if (generation !== this.applyGeneration) return false;
		this.activePath = state.path;
		this.activeIndex = nextIndex;
		await Promise.all([this.fadeTo(current, 0, generation), this.fadeTo(next, volume, generation)]);
		if (generation !== this.applyGeneration) return false;
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

	private fadeTo(element: HTMLAudioElement, target: number, generation: number) {
		const initial = element.volume;
		if (this.fadeMs <= 0 || Math.abs(initial - target) < 0.01) {
			if (generation !== this.applyGeneration) return Promise.resolve();
			element.volume = target;
			return Promise.resolve();
		}
		const started = performance.now();
		return new Promise<void>((resolve) => {
			const step = (now: number) => {
				if (generation !== this.applyGeneration) {
					resolve();
					return;
				}
				const progress = Math.max(0, Math.min(1, (now - started) / this.fadeMs));
				element.volume = Math.max(0, Math.min(1, initial + (target - initial) * progress));
				if (progress < 1) requestAnimationFrame(step);
				else resolve();
			};
			requestAnimationFrame(step);
		});
	}
}
