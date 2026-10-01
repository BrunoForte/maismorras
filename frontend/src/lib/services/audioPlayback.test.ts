import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	audioAssetDisplayName,
	audioAssetKind,
	audioAssetLooping,
	CrossfadeAudio,
	withListenerVolume
} from './audioPlayback';

function audioElement(initialVolume: number) {
	let volume = initialVolume;
	return {
		get volume() {
			return volume;
		},
		set volume(value: number) {
			if (value < 0 || value > 1)
				throw new DOMException(`Volume fora do intervalo: ${value}`, 'IndexSizeError');
			volume = value;
		},
		loop: false,
		preload: '',
		currentTime: 0,
		src: '',
		pause: vi.fn(),
		play: vi.fn(async () => {}),
		removeAttribute: vi.fn(),
		load: vi.fn()
	} as unknown as HTMLAudioElement;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('CrossfadeAudio', () => {
	it('classifies tagged audio assets while preserving legacy music files', () => {
		expect(audioAssetKind('campaigns/c1/media/64d0ac2-effect__rain.mp3')).toBe('effect');
		expect(audioAssetKind('campaigns/c1/media/sfx__thunder.ogg')).toBe('effect');
		expect(audioAssetKind('campaigns/c1/media/uuid-effect_loop__rain.mp3')).toBe('effect');
		expect(audioAssetKind('campaigns/c1/media/theme.mp3')).toBe('music');
		expect(audioAssetDisplayName('effect__rain.mp3')).toBe('rain.mp3');
		expect(audioAssetDisplayName('music_once__theme.mp3')).toBe('theme.mp3');
		expect(audioAssetLooping('music_loop__theme.mp3')).toBe(true);
		expect(audioAssetLooping('effect_once__rain.mp3')).toBe(false);
		expect(audioAssetLooping('effect__rain.mp3')).toBe(false);
		expect(audioAssetLooping('theme.mp3')).toBe(true);
	});
	it('applies personal output volume without mutating the shared audio state', () => {
		const shared = { path: 'music.mp3', playing: true, volume: 0.8, positionMs: 0, startedAt: 10 };
		expect(withListenerVolume(shared, 50).volume).toBe(0.4);
		expect(withListenerVolume(shared, 150).volume).toBe(0.8);
		expect(withListenerVolume(shared, -10).volume).toBe(0);
		expect(shared.volume).toBe(0.8);
	});

	it('keeps music and sound effects in independent simultaneous playback engines', async () => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(performance.now() + 1000);
			return 1;
		});
		const musicElements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), audioElement(0)];
		const effectElements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), audioElement(0)];
		const music = new CrossfadeAudio(musicElements);
		const effects = new CrossfadeAudio(effectElements);
		const state = (path: string) => ({
			path,
			playing: true,
			volume: 0.65,
			positionMs: 0,
			startedAt: Date.now(),
			revision: 1
		});

		await Promise.all([
			music.apply(state('music_loop__theme.mp3'), async (path) => path),
			effects.apply(state('effect_once__rain.mp3'), async (path) => path)
		]);

		expect(music.path).toBe('music_loop__theme.mp3');
		expect(effects.path).toBe('effect_once__rain.mp3');
		expect(
			musicElements.some((element) => (element.play as ReturnType<typeof vi.fn>).mock.calls.length)
		).toBe(true);
		expect(
			effectElements.some((element) => (element.play as ReturnType<typeof vi.fn>).mock.calls.length)
		).toBe(true);
		expect(musicElements[1].loop).toBe(true);
		expect(effectElements[1].loop).toBe(false);
	});

	it('clamps fade progress when an animation frame timestamp precedes its start', async () => {
		const element = audioElement(1);
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(performance, 'now').mockReturnValue(100);
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});

		const playback = new CrossfadeAudio([element, audioElement(0)], 450);
		const applying = playback.apply(
			{ path: null, playing: false, volume: 1, positionMs: 0, startedAt: 0 },
			async () => ''
		);

		frames.shift()?.(90);
		expect(element.volume).toBe(1);
		frames.shift()?.(550);
		await applying;
		expect(element.volume).toBe(0);
	});

	it('uses the scene loop override instead of the file name default', async () => {
		const elements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), audioElement(0)];
		const playback = new CrossfadeAudio(elements, 0);
		await playback.apply(
			{
				path: 'music_once__theme.mp3',
				playing: true,
				volume: 0.5,
				positionMs: 0,
				startedAt: 0,
				loop: true,
				revision: 1
			},
			async (path) => path
		);
		expect(elements[1].loop).toBe(true);
		await playback.apply(
			{
				path: 'music_once__theme.mp3',
				playing: true,
				volume: 0.5,
				positionMs: 0,
				startedAt: 0,
				loop: false,
				revision: 2
			},
			async (path) => path
		);
		expect(elements[1].loop).toBe(false);
	});

	it('fades out and pauses the active track when Stop is applied', async () => {
		const elements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), audioElement(0)];
		const playback = new CrossfadeAudio(elements, 0);
		await playback.apply(
			{ path: 'theme.mp3', playing: true, volume: 0.5, positionMs: 0, startedAt: 0, revision: 1 },
			async (path) => path
		);
		await playback.apply(
			{
				path: 'theme.mp3',
				playing: false,
				volume: 0.5,
				positionMs: 1000,
				startedAt: 0,
				revision: 2
			},
			async (path) => path
		);
		expect(elements[1].pause).toHaveBeenCalled();
		expect(elements[1].volume).toBe(0.5);
		expect(playback.path).toBe('theme.mp3');
	});

	it('keeps the current track audible if a selected replacement cannot be resolved', async () => {
		const elements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), audioElement(0)];
		const playback = new CrossfadeAudio(elements, 0);
		await playback.apply(
			{ path: 'current.mp3', playing: true, volume: 0.5, positionMs: 0, startedAt: 0, revision: 1 },
			async (path) => path
		);
		expect(
			await playback.apply(
				{
					path: 'missing.mp3',
					playing: true,
					volume: 0.5,
					positionMs: 0,
					startedAt: 0,
					revision: 2
				},
				async () => ''
			)
		).toBe(false);
		expect(playback.failureReason).toBe('unavailable');
		expect(playback.path).toBe('current.mp3');
		expect(elements[1].src).toBe('current.mp3');
		expect((elements[1].play as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
	});

	it('resumes an already signed track directly from a browser gesture', async () => {
		const element = audioElement(0);
		const elements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), element];
		const play = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'))
			.mockResolvedValueOnce();
		element.play = play;
		const playback = new CrossfadeAudio(elements, 0);
		const resolveUrl = vi.fn(async () => 'signed-track-url');

		await playback.apply(
			{ path: 'theme.mp3', playing: true, volume: 0.6, positionMs: 0, startedAt: 0 },
			resolveUrl
		);
		expect(playback.failureReason).toBe('autoplay');
		expect(playback.path).toBe('theme.mp3');

		expect(await playback.resumeFromGesture()).toBe(true);
		expect(resolveUrl).toHaveBeenCalledTimes(1);
		expect(play).toHaveBeenCalledTimes(2);
		expect(element.volume).toBe(0.6);
	});

	it('does not start or preserve stale async URL resolutions after a newer revision', async () => {
		const elements: [HTMLAudioElement, HTMLAudioElement] = [audioElement(0), audioElement(0)];
		const playback = new CrossfadeAudio(elements, 0);
		let resolveOld!: (url: string) => void;
		const old = playback.apply(
			{ path: 'old.mp3', playing: true, volume: 0.4, positionMs: 0, startedAt: 0, revision: 1 },
			() =>
				new Promise((resolve) => {
					resolveOld = resolve;
				})
		);
		await playback.apply(
			{ path: 'new.mp3', playing: true, volume: 0.4, positionMs: 0, startedAt: 0, revision: 2 },
			async (path) => path
		);
		resolveOld('old.mp3');
		expect(await old).toBe(false);
		expect(playback.path).toBe('new.mp3');
		expect(
			elements.flatMap((element) => (element.play as ReturnType<typeof vi.fn>).mock.calls).length
		).toBe(1);
	});
});
