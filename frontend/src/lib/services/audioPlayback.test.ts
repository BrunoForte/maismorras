import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	audioAssetDisplayName,
	audioAssetKind,
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
		expect(audioAssetKind('campaigns/c1/media/theme.mp3')).toBe('music');
		expect(audioAssetDisplayName('effect__rain.mp3')).toBe('rain.mp3');
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
			music.apply(state('music.mp3'), async (path) => path),
			effects.apply(state('rain.mp3'), async (path) => path)
		]);

		expect(music.path).toBe('music.mp3');
		expect(effects.path).toBe('rain.mp3');
		expect(
			musicElements.some((element) => (element.play as ReturnType<typeof vi.fn>).mock.calls.length)
		).toBe(true);
		expect(
			effectElements.some((element) => (element.play as ReturnType<typeof vi.fn>).mock.calls.length)
		).toBe(true);
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
});
