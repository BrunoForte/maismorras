<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import type { Scene } from '$lib/services/sceneApi';
	import {
		loadScene,
		updateSceneAudio,
		type SceneAudioChannel,
		type SceneAudioUpdate
	} from '$lib/services/sceneApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import type { AudioPlaybackState } from '$lib/services/audioPlayback';
	import {
		audioAssetDisplayName,
		audioAssetKind,
		audioAssetLooping,
		CrossfadeAudio,
		withListenerVolume
	} from '$lib/services/audioPlayback';
	import {
		acceptsAudioRevision,
		createLoopUpdate,
		createPendingAudioSelection,
		createPlaybackCommand
	} from '$lib/services/audioPlaybackControls';
	import { getSupabaseClient } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { notifyUserRequestError } from '$lib/services/httpClient';

	let { scene, session, isGM, onSceneUpdate } = $props<{
		scene: Scene;
		session: Session;
		isGM: boolean;
		onSceneUpdate: (scene: Scene) => void;
	}>();
	type Track = { path: string; name: string; kind: 'music' | 'effect' };
	let tracks = $state<Track[]>([]);
	const musicTracks = $derived(tracks.filter((track) => track.kind === 'music'));
	const effectTracks = $derived(tracks.filter((track) => track.kind === 'effect'));
	let needsGesture = $state(false);
	let effectsNeedGesture = $state(false);
	let sceneSocket: SceneSocket | null = null;
	let playback: CrossfadeAudio | null = null;
	let effectsPlayback: CrossfadeAudio | null = null;
	let lastState: AudioPlaybackState | null = null;
	let lastEffectsState: AudioPlaybackState | null = null;
	let listenerVolume = $state(100);
	let effectsListenerVolume = $state(100);
	let selectedMusicPath = $state<string | null>(null);
	let selectedEffectPath = $state<string | null>(null);
	let selectedMusicLoop = $state(true);
	let selectedEffectLoop = $state(false);
	let selectionSceneId = '';
	let musicUnavailable = $state(false);
	let effectsUnavailable = $state(false);
	let musicBusy = $state(false);
	let effectsBusy = $state(false);
	let musicElements: [HTMLAudioElement, HTMLAudioElement] | null = null;
	let effectsElements: [HTMLAudioElement, HTMLAudioElement] | null = null;
	let playbackSceneId = '';
	$effect(() => {
		if (selectionSceneId === scene.id) return;
		selectionSceneId = scene.id;
		selectedMusicPath = scene.ambientAudioPath;
		selectedEffectPath = scene.ambientEffectPath;
		selectedMusicLoop = scene.ambientAudioLoop ?? true;
		selectedEffectLoop = scene.ambientEffectLoop ?? false;
	});
	const targetVolume = (value?: number) =>
		Math.max(0, Math.min(1, (value ?? scene.ambientAudioVolume) / 100));
	const volumeStorageKey = () => `maismorras-audio-volume:${scene.campaignId}:${session.user.id}`;
	const effectsVolumeStorageKey = () =>
		`maismorras-effects-volume:${scene.campaignId}:${session.user.id}`;

	function stateFromScene(value: Scene): AudioPlaybackState {
		return {
			path: value.ambientAudioPath,
			playing: value.ambientAudioEnabled,
			volume: targetVolume(value.ambientAudioVolume),
			positionMs: value.ambientAudioPositionMs ?? 0,
			startedAt: value.ambientAudioStartedAt ? Date.parse(value.ambientAudioStartedAt) : 0,
			revision: value.ambientAudioRevision ?? 0,
			loop: value.ambientAudioLoop ?? true
		};
	}

	function effectsStateFromScene(value: Scene): AudioPlaybackState {
		return {
			path: value.ambientEffectPath,
			playing: value.ambientEffectEnabled,
			volume: Math.max(0, Math.min(1, value.ambientEffectVolume / 100)),
			positionMs: value.ambientEffectPositionMs ?? 0,
			startedAt: value.ambientEffectStartedAt ? Date.parse(value.ambientEffectStartedAt) : 0,
			revision: value.ambientEffectRevision ?? 0,
			loop: value.ambientEffectLoop ?? false
		};
	}

	async function signed(path: string) {
		try {
			return (await getSignedAssetUrl(session, scene.campaignId, path)) ?? '';
		} catch {
			return '';
		}
	}

	async function applyState(state: AudioPlaybackState): Promise<boolean> {
		if (!acceptsAudioRevision(lastState, state)) return false;
		lastState = state;
		if (!playback) return false;
		const applied = await playback.apply(withListenerVolume(state, listenerVolume), signed);
		needsGesture = state.playing && !applied && playback.failureReason === 'autoplay';
		musicUnavailable = state.playing && !applied && playback.failureReason === 'unavailable';
		return applied;
	}

	async function applyEffectsState(state: AudioPlaybackState): Promise<boolean> {
		if (!acceptsAudioRevision(lastEffectsState, state)) return false;
		lastEffectsState = state;
		if (!effectsPlayback) return false;
		const applied = await effectsPlayback.apply(
			withListenerVolume(state, effectsListenerVolume),
			signed
		);
		effectsNeedGesture = state.playing && !applied && effectsPlayback.failureReason === 'autoplay';
		effectsUnavailable =
			state.playing && !applied && effectsPlayback.failureReason === 'unavailable';
		return applied;
	}

	function setListenerVolume(event: Event) {
		listenerVolume = Math.max(
			0,
			Math.min(100, Number((event.currentTarget as HTMLInputElement).value) || 0)
		);
		try {
			localStorage.setItem(volumeStorageKey(), String(listenerVolume));
		} catch {
			// Audio volume remains usable when browser storage is disabled.
		}
		if (lastState) void applyState(lastState);
	}

	function setEffectsListenerVolume(event: Event) {
		effectsListenerVolume = Math.max(
			0,
			Math.min(100, Number((event.currentTarget as HTMLInputElement).value) || 0)
		);
		try {
			localStorage.setItem(effectsVolumeStorageKey(), String(effectsListenerVolume));
		} catch {
			// Efeitos continuam funcionando sem persistência local do volume.
		}
		if (lastEffectsState) void applyEffectsState(lastEffectsState);
	}

	function trackName(path: string | null, empty: string) {
		if (!path) return empty;
		return tracks.find((track) => track.path === path)?.name ?? audioAssetDisplayName(path);
	}

	async function refreshScene(currentSession = session, currentSceneId = scene.id) {
		try {
			const loaded = await loadScene(currentSession, currentSceneId);
			if (loaded.scene.id === scene.id && currentSession.access_token === session.access_token) {
				onSceneUpdate(loaded.scene);
				await applyState(stateFromScene(loaded.scene));
				await applyEffectsState(effectsStateFromScene(loaded.scene));
			}
		} catch {
			// A transient realtime refresh must not interrupt the audio already playing.
		}
	}

	async function loadTracks(currentCampaignId = scene.campaignId) {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const { data } = await supabase.storage
			.from('campaign-assets')
			.list(`campaigns/${currentCampaignId}/media`, {
				limit: 200,
				sortBy: { column: 'created_at', order: 'desc' }
			});
		if (scene.campaignId !== currentCampaignId) return;
		tracks = (data ?? [])
			.filter((file) => file.metadata?.mimetype?.startsWith('audio/'))
			.map((file) => {
				const path = `campaigns/${currentCampaignId}/media/${file.name}`;
				const kind = audioAssetKind(file.name);
				return {
					path,
					name: audioAssetDisplayName(file.name.replace(/^[a-f0-9-]+-/, '')),
					// Keep previously selected, untagged effects usable after introducing categories.
					kind: path === scene.ambientEffectPath ? 'effect' : kind
				};
			});
	}

	function sceneWithAudio(
		value: Scene,
		channel: SceneAudioChannel,
		state: AudioPlaybackState
	): Scene {
		if (channel === 'music')
			return {
				...value,
				ambientAudioPath: state.path,
				ambientAudioEnabled: state.playing,
				ambientAudioVolume: Math.round(state.volume * 100),
				ambientAudioPositionMs: state.positionMs,
				ambientAudioStartedAt:
					state.playing && state.startedAt > 0 ? new Date(state.startedAt).toISOString() : null,
				ambientAudioRevision: state.revision ?? value.ambientAudioRevision,
				ambientAudioLoop: state.loop ?? value.ambientAudioLoop
			};
		return {
			...value,
			ambientEffectPath: state.path,
			ambientEffectEnabled: state.playing,
			ambientEffectVolume: Math.round(state.volume * 100),
			ambientEffectPositionMs: state.positionMs,
			ambientEffectStartedAt:
				state.playing && state.startedAt > 0 ? new Date(state.startedAt).toISOString() : null,
			ambientEffectRevision: state.revision ?? value.ambientEffectRevision,
			ambientEffectLoop: state.loop ?? value.ambientEffectLoop
		};
	}

	async function persistAudio(
		channel: SceneAudioChannel,
		state: AudioPlaybackState,
		expectedRevision: number
	) {
		const payload: SceneAudioUpdate = {
			channel,
			...state,
			loop: state.loop ?? channel === 'music',
			expectedRevision
		};
		const saved = await updateSceneAudio(session, scene.id, payload);
		const canonical = { ...saved, path: saved.path ?? null };
		onSceneUpdate(sceneWithAudio(scene, channel, canonical));
		if (channel === 'music') {
			selectedMusicPath = canonical.path;
			selectedMusicLoop = canonical.loop ?? selectedMusicLoop;
		} else {
			selectedEffectPath = canonical.path;
			selectedEffectLoop = canonical.loop ?? selectedEffectLoop;
		}
		return canonical;
	}

	async function applyRemoteState(state: AudioPlaybackState) {
		if (!acceptsAudioRevision(lastState, state)) return;
		if (state.playing && state.path && !tracks.some((track) => track.path === state.path))
			void loadTracks();
		const previousPath = scene.ambientAudioPath;
		const canonical = {
			...state,
			path: state.path || null,
			loop: state.loop ?? audioAssetLooping(state.path ?? '')
		};
		onSceneUpdate(sceneWithAudio(scene, 'music', canonical));
		if (selectedMusicPath === previousPath) {
			selectedMusicPath = canonical.path;
			selectedMusicLoop = canonical.loop ?? selectedMusicLoop;
		}
		await applyState(state);
	}

	async function applyRemoteEffectsState(state: AudioPlaybackState) {
		if (!acceptsAudioRevision(lastEffectsState, state)) return;
		if (state.playing && state.path && !tracks.some((track) => track.path === state.path))
			void loadTracks();
		const previousPath = scene.ambientEffectPath;
		const canonical = {
			...state,
			path: state.path || null,
			loop: state.loop ?? audioAssetLooping(state.path ?? '')
		};
		onSceneUpdate(sceneWithAudio(scene, 'effect', canonical));
		if (selectedEffectPath === previousPath) {
			selectedEffectPath = canonical.path;
			selectedEffectLoop = canonical.loop ?? selectedEffectLoop;
		}
		await applyEffectsState(state);
	}

	function selectMusic(event: Event) {
		const path = (event.currentTarget as HTMLSelectElement).value || null;
		const track = tracks.find((item) => item.path === path);
		const selection = createPendingAudioSelection(
			path,
			track ? audioAssetLooping(track.path) : true
		);
		selectedMusicPath = selection.path;
		selectedMusicLoop = selection.loop;
	}

	function selectEffect(event: Event) {
		const path = (event.currentTarget as HTMLSelectElement).value || null;
		const track = tracks.find((item) => item.path === path);
		const selection = createPendingAudioSelection(
			path,
			track ? audioAssetLooping(track.path) : false
		);
		selectedEffectPath = selection.path;
		selectedEffectLoop = selection.loop;
	}

	async function runPlaybackCommand(channel: SceneAudioChannel, command: 'play' | 'stop') {
		if (!isGM) return;
		const effects = channel === 'effect';
		if (effects ? effectsBusy : musicBusy) return;
		if (effects) effectsBusy = true;
		else musicBusy = true;
		const current = effects ? effectsStateFromScene(scene) : stateFromScene(scene);
		const path = effects ? selectedEffectPath : selectedMusicPath;
		const loop = effects ? selectedEffectLoop : selectedMusicLoop;
		const engine = effects ? effectsPlayback : playback;
		const positionMs =
			command === 'stop' ? Math.round((engine?.currentTime ?? 0) * 1000) : current.positionMs;
		const next = createPlaybackCommand(current, path, loop, command, Date.now(), positionMs);
		if (!next) {
			if (effects) effectsBusy = false;
			else musicBusy = false;
			return;
		}
		try {
			// Resolve access before committing, but do not touch either media element
			// until the server has accepted the authoritative state transition.
			if (command === 'play' && path && !(await signed(path))) {
				if (effects) effectsUnavailable = true;
				else musicUnavailable = true;
				return;
			}
			const saved = await persistAudio(channel, next, current.revision ?? 0);
			if (effects) await applyEffectsState(saved);
			else await applyState(saved);
		} catch {
			await refreshScene();
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not update audio playback. The latest scene state was restored.'
					: 'Não foi possível atualizar o áudio. O estado mais recente da cena foi restaurado.'
			);
		} finally {
			if (effects) effectsBusy = false;
			else musicBusy = false;
		}
	}

	async function changeLoop(channel: SceneAudioChannel, event: Event) {
		if (!isGM) return;
		const loop = (event.currentTarget as HTMLInputElement).checked;
		const effects = channel === 'effect';
		if (effects) selectedEffectLoop = loop;
		else selectedMusicLoop = loop;
		const selected = effects ? selectedEffectPath : selectedMusicPath;
		const active = effects ? scene.ambientEffectPath : scene.ambientAudioPath;
		if (!selected || selected !== active) return;
		const current = effects ? effectsStateFromScene(scene) : stateFromScene(scene);
		const next = createLoopUpdate(current, loop);
		if (!next) return;
		try {
			const preview = { ...next, revision: current.revision };
			if (effects) await applyEffectsState(preview);
			else await applyState(preview);
			const saved = await persistAudio(channel, next, current.revision ?? 0);
			if (effects) await applyEffectsState(saved);
			else await applyState(saved);
		} catch {
			await refreshScene();
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not change the playback loop.'
					: 'Não foi possível alterar o loop da reprodução.'
			);
		}
	}

	function enableAudio() {
		// Both play() calls happen immediately inside the explicit user gesture;
		// signed-URL resolution and scene state are not rewritten here.
		const resumeMusic = needsGesture;
		const resumeEffects = effectsNeedGesture;
		const musicAttempt = resumeMusic
			? (playback?.resumeFromGesture() ?? Promise.resolve(false))
			: Promise.resolve(true);
		const effectsAttempt = resumeEffects
			? (effectsPlayback?.resumeFromGesture() ?? Promise.resolve(false))
			: Promise.resolve(true);
		void Promise.all([musicAttempt, effectsAttempt]).then(([musicApplied, effectsApplied]) => {
			if (resumeMusic) needsGesture = !musicApplied;
			if (resumeEffects) effectsNeedGesture = !effectsApplied;
		});
	}

	onMount(() => {
		try {
			const storedVolume = Number(localStorage.getItem(volumeStorageKey()));
			if (Number.isFinite(storedVolume)) listenerVolume = Math.max(0, Math.min(100, storedVolume));
		} catch {
			// Keep the default personal volume if browser storage is disabled.
		}
		try {
			const storedEffectsVolume = Number(localStorage.getItem(effectsVolumeStorageKey()));
			if (Number.isFinite(storedEffectsVolume))
				effectsListenerVolume = Math.max(0, Math.min(100, storedEffectsVolume));
		} catch {
			// Use personal default when browser storage is unavailable.
		}
		const first = document.getElementById('maismorras-ambient-a') as HTMLAudioElement | null;
		const second = document.getElementById('maismorras-ambient-b') as HTMLAudioElement | null;
		const effectsFirst = document.getElementById('maismorras-effects-a') as HTMLAudioElement | null;
		const effectsSecond = document.getElementById(
			'maismorras-effects-b'
		) as HTMLAudioElement | null;
		if (first && second) {
			musicElements = [first, second];
			playback = new CrossfadeAudio(musicElements);
		}
		if (effectsFirst && effectsSecond) {
			effectsElements = [effectsFirst, effectsSecond];
			effectsPlayback = new CrossfadeAudio(effectsElements);
		}
		void loadTracks();
		return () => {
			playback?.dispose();
			effectsPlayback?.dispose();
			playback = null;
			effectsPlayback = null;
		};
	});

	$effect(() => {
		const currentSceneId = scene.id;
		const currentSession = session;
		if (!currentSession.access_token) return;
		if (playbackSceneId && playbackSceneId !== currentSceneId) {
			playback?.dispose();
			effectsPlayback?.dispose();
			playback = musicElements ? new CrossfadeAudio(musicElements) : null;
			effectsPlayback = effectsElements ? new CrossfadeAudio(effectsElements) : null;
			lastState = null;
			lastEffectsState = null;
			untrack(() => {
				void loadTracks(scene.campaignId);
			});
		}
		playbackSceneId = currentSceneId;
		const socket = connectSceneSocket(
			currentSession,
			currentSceneId,
			() => void refreshScene(currentSession, currentSceneId),
			undefined,
			undefined,
			(state) => void applyRemoteState(state),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			(state) => void applyRemoteEffectsState(state)
		);
		sceneSocket = socket;
		return () => {
			if (sceneSocket === socket) sceneSocket = null;
			socket.close();
		};
	});

	$effect(() => {
		const state = stateFromScene(scene);
		if (
			!lastState ||
			state.path !== lastState.path ||
			state.playing !== lastState.playing ||
			state.volume !== lastState.volume ||
			state.loop !== lastState.loop ||
			state.revision !== lastState.revision
		) {
			void applyState(state);
		}
	});

	$effect(() => {
		const state = effectsStateFromScene(scene);
		if (
			!lastEffectsState ||
			state.path !== lastEffectsState.path ||
			state.playing !== lastEffectsState.playing ||
			state.volume !== lastEffectsState.volume ||
			state.loop !== lastEffectsState.loop ||
			state.revision !== lastEffectsState.revision
		)
			void applyEffectsState(state);
	});
</script>

<div class="audio-channels" aria-label="Canais de áudio da campanha">
	<div
		class="ambient-player music-player"
		aria-label={$appLocale === 'en' ? 'Campaign music player' : 'Player de música da campanha'}
	>
		{#if isGM}<select value={selectedMusicPath ?? ''} onchange={selectMusic}>
				<option value=""
					>{$appLocale === 'en'
						? 'Select campaign music…'
						: 'Selecionar música da campanha…'}</option
				>
				{#each musicTracks as track (track.path)}<option value={track.path}>{track.name}</option
					>{/each}
			</select>
			<div class="gm-status">
				<p class="track-state">
					<span
						>{$appLocale === 'en' ? 'Selected:' : 'Selecionada:'}
						<strong>{trackName(selectedMusicPath, $appLocale === 'en' ? 'None' : 'Nenhuma')}</strong
						></span
					>
					<span
						>{$appLocale === 'en' ? 'Playing:' : 'Tocando:'}
						<strong
							>{scene.ambientAudioEnabled
								? trackName(scene.ambientAudioPath, $appLocale === 'en' ? 'Nothing' : 'Nada')
								: $appLocale === 'en'
									? 'Stopped'
									: 'Parada'}</strong
						></span
					>
				</p>
				<div class="channel-actions">
					<button
						disabled={!selectedMusicPath ||
							musicBusy ||
							(scene.ambientAudioEnabled &&
								selectedMusicPath === scene.ambientAudioPath &&
								selectedMusicLoop === scene.ambientAudioLoop)}
						onclick={() => void runPlaybackCommand('music', 'play')}
						>{musicBusy
							? '…'
							: scene.ambientAudioEnabled && selectedMusicPath !== scene.ambientAudioPath
								? $appLocale === 'en'
									? 'Apply & play'
									: 'Aplicar e tocar'
								: $appLocale === 'en'
									? 'Play'
									: 'Tocar'}</button
					>
					{#if scene.ambientAudioEnabled}<button
							disabled={musicBusy}
							onclick={() => void runPlaybackCommand('music', 'stop')}
							>{$appLocale === 'en' ? 'Stop' : 'Parar'}</button
						>{/if}
					<label class="loop-control"
						><input
							type="checkbox"
							checked={selectedMusicLoop}
							disabled={!selectedMusicPath}
							onchange={(event) => void changeLoop('music', event)}
						/><span>{$appLocale === 'en' ? 'Loop' : 'Repetir'}</span></label
					>
				</div>
				{#if needsGesture}<button class="audio-enable" onclick={() => void enableAudio()}
						>{$appLocale === 'en' ? 'Enable audio' : 'Ativar áudio'}</button
					>{/if}
				{#if musicUnavailable}<span class="audio-warning"
						>{$appLocale === 'en'
							? 'Audio unavailable. Check the asset or access.'
							: 'Áudio indisponível. Verifique o arquivo ou o acesso.'}</span
					>{/if}
				<label class="volume-control">
					<span>{$appLocale === 'en' ? 'My volume' : 'Meu volume'}</span>
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={listenerVolume}
						oninput={setListenerVolume}
					/>
					<output>{listenerVolume}%</output>
				</label>
			</div>
		{:else}<div class="listener-status">
				<strong
					>{trackName(
						scene.ambientAudioPath,
						$appLocale === 'en' ? 'No music' : 'Nenhuma música'
					)}</strong
				>
				{#if musicUnavailable}<span class="audio-warning"
						>{$appLocale === 'en'
							? 'Audio unavailable; tell the narrator.'
							: 'Áudio indisponível; avise o narrador.'}</span
					>{/if}
				{#if needsGesture}<button class="audio-enable" onclick={() => void enableAudio()}
						>{$appLocale === 'en' ? 'Enable audio' : 'Ativar áudio'}</button
					>{/if}
				<label class="volume-control">
					<span>{$appLocale === 'en' ? 'My volume' : 'Meu volume'}</span>
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={listenerVolume}
						oninput={setListenerVolume}
					/>
					<output>{listenerVolume}%</output>
				</label>
			</div>{/if}
	</div>

	<div
		class="ambient-player effects-player"
		aria-label={$appLocale === 'en'
			? 'Campaign sound effects player'
			: 'Player de efeitos sonoros da campanha'}
	>
		{#if isGM}<select value={selectedEffectPath ?? ''} onchange={selectEffect}>
				<option value=""
					>{$appLocale === 'en' ? 'Select a sound effect…' : 'Selecionar efeito sonoro…'}</option
				>
				{#each effectTracks as track (track.path)}<option value={track.path}>{track.name}</option
					>{/each}
			</select>
			<div class="gm-status">
				<p class="track-state">
					<span
						>{$appLocale === 'en' ? 'Selected:' : 'Selecionado:'}
						<strong>{trackName(selectedEffectPath, $appLocale === 'en' ? 'None' : 'Nenhum')}</strong
						></span
					>
					<span
						>{$appLocale === 'en' ? 'Playing:' : 'Tocando:'}
						<strong
							>{scene.ambientEffectEnabled
								? trackName(scene.ambientEffectPath, $appLocale === 'en' ? 'Nothing' : 'Nada')
								: $appLocale === 'en'
									? 'Stopped'
									: 'Parado'}</strong
						></span
					>
				</p>
				<div class="channel-actions">
					<button
						disabled={!selectedEffectPath ||
							effectsBusy ||
							(scene.ambientEffectEnabled &&
								selectedEffectPath === scene.ambientEffectPath &&
								selectedEffectLoop === scene.ambientEffectLoop)}
						onclick={() => void runPlaybackCommand('effect', 'play')}
						>{effectsBusy
							? '…'
							: scene.ambientEffectEnabled && selectedEffectPath !== scene.ambientEffectPath
								? $appLocale === 'en'
									? 'Apply & play'
									: 'Aplicar e tocar'
								: $appLocale === 'en'
									? 'Play'
									: 'Tocar'}</button
					>
					{#if scene.ambientEffectEnabled}<button
							disabled={effectsBusy}
							onclick={() => void runPlaybackCommand('effect', 'stop')}
							>{$appLocale === 'en' ? 'Stop' : 'Parar'}</button
						>{/if}
					<label class="loop-control"
						><input
							type="checkbox"
							checked={selectedEffectLoop}
							disabled={!selectedEffectPath}
							onchange={(event) => void changeLoop('effect', event)}
						/><span>{$appLocale === 'en' ? 'Loop' : 'Repetir'}</span></label
					>
				</div>
				{#if effectsNeedGesture}<button class="audio-enable" onclick={() => void enableAudio()}
						>{$appLocale === 'en' ? 'Enable audio' : 'Ativar áudio'}</button
					>{/if}
				{#if effectsUnavailable}<span class="audio-warning"
						>{$appLocale === 'en'
							? 'Audio unavailable. Check the asset or access.'
							: 'Áudio indisponível. Verifique o arquivo ou o acesso.'}</span
					>{/if}
				<label class="volume-control"
					><span>{$appLocale === 'en' ? 'My effects' : 'Meus efeitos'}</span><input
						type="range"
						min="0"
						max="100"
						step="1"
						value={effectsListenerVolume}
						oninput={setEffectsListenerVolume}
					/><output>{effectsListenerVolume}%</output></label
				>
			</div>
		{:else}<div class="listener-status">
				<strong
					>{trackName(
						scene.ambientEffectPath,
						$appLocale === 'en' ? 'No sound effect' : 'Nenhum efeito sonoro'
					)}</strong
				>
				{#if effectsUnavailable}<span class="audio-warning"
						>{$appLocale === 'en'
							? 'Audio unavailable; tell the narrator.'
							: 'Áudio indisponível; avise o narrador.'}</span
					>{/if}
				{#if effectsNeedGesture}<button class="audio-enable" onclick={() => void enableAudio()}
						>{$appLocale === 'en' ? 'Enable audio' : 'Ativar áudio'}</button
					>{/if}
				<label class="volume-control"
					><span>{$appLocale === 'en' ? 'My effects' : 'Meus efeitos'}</span><input
						type="range"
						min="0"
						max="100"
						step="1"
						value={effectsListenerVolume}
						oninput={setEffectsListenerVolume}
					/><output>{effectsListenerVolume}%</output></label
				>
			</div>{/if}
	</div>
</div>

<style>
	.audio-channels {
		position: fixed;
		z-index: 45;
		box-sizing: border-box;
		min-height: 3.5rem;
		inset-inline: 0;
		inset-block-end: 0;
		width: 100vw;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: clamp(0.35rem, 1vw, 0.75rem);
		align-items: center;
		padding: clamp(0.35rem, 0.8vw, 0.6rem) max(0.55rem, env(safe-area-inset-right))
			calc(clamp(0.35rem, 0.8vw, 0.6rem) + env(safe-area-inset-bottom))
			max(0.55rem, env(safe-area-inset-left));
		border-top: 1px solid #5a493b;
		background: #211b1e;
		box-shadow: 0 -5px 20px #0008;
	}
	.ambient-player {
		position: static;
		box-sizing: border-box;
		min-width: 0;
		min-height: 2.8rem;
		width: 100%;
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.5fr);
		gap: clamp(0.35rem, 0.8vw, 0.75rem);
		align-items: center;
		padding: 0;
		border: 0;
		background: transparent;
		box-shadow: none;
		container-type: inline-size;
	}
	.effects-player {
		inset-block-end: auto;
	}
	.ambient-player select {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: clamp(0.4rem, 0.6vw, 0.55rem);
		color: #eee4d6;
		background: #121012;
	}
	.listener-status,
	.gm-status {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: clamp(0.35rem, 0.75vw, 0.9rem);
		min-width: 0;
		color: #eee4d6;
	}
	.listener-status {
		pointer-events: auto;
	}
	.listener-status strong,
	.gm-status strong {
		flex: 1 1 5rem;
		min-width: 0;
		overflow: hidden;
		color: #e8c786;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track-state {
		flex: 1 1 100%;
		min-width: 0;
		margin: 0;
		display: flex;
		justify-content: space-between;
		gap: 0.65rem;
		font-size: 0.76rem;
	}
	.track-state span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.channel-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.loop-control {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: #eee4d6;
		font-size: 0.78rem;
		white-space: nowrap;
	}
	.loop-control input {
		accent-color: #e0b86f;
	}
	.audio-warning {
		flex: 1 1 100%;
		color: #f2b7a2;
		font-size: 0.72rem;
	}
	.ambient-player button {
		flex: 0 0 auto;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.45rem, 0.8vw, 0.8rem);
		color: #26190e;
		background: #e0b86f;
		font-weight: 700;
		pointer-events: auto;
	}
	.volume-control {
		display: flex;
		flex: 0 1 auto;
		align-items: center;
		gap: clamp(0.2rem, 0.4vw, 0.45rem);
		min-width: 0;
		color: #eee4d6;
		font-size: 0.78rem;
	}
	.volume-control span {
		white-space: nowrap;
	}
	.volume-control input {
		width: clamp(3rem, 7vw, 7rem);
		min-width: 2.5rem;
		accent-color: #e0b86f;
	}
	.volume-control output {
		min-width: 2.5em;
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 900px) {
		.audio-channels {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}
		.ambient-player {
			width: 100%;
			grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.5fr);
			min-height: 2.6rem;
		}
	}
	@media (max-width: 520px) {
		.audio-channels {
			padding-inline: max(0.35rem, env(safe-area-inset-right))
				max(0.35rem, env(safe-area-inset-left));
		}
		.ambient-player {
			grid-template-columns: minmax(0, 0.65fr) minmax(0, 1.4fr);
			gap: 0.35rem;
		}
		.listener-status,
		.gm-status {
			gap: 0.3rem;
		}
		.track-state {
			font-size: 0.68rem;
		}
		.ambient-player button {
			padding: 0.3rem 0.4rem;
			font-size: 0.72rem;
		}
		.volume-control span {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}
		.volume-control input {
			width: clamp(2.5rem, 14vw, 4rem);
		}
	}
</style>
