<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import type { Scene } from '$lib/services/sceneApi';
	import { loadScene, updateScene } from '$lib/services/sceneApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import type { AudioPlaybackState } from '$lib/services/audioPlayback';
	import {
		audioAssetDisplayName,
		audioAssetKind,
		CrossfadeAudio,
		withListenerVolume
	} from '$lib/services/audioPlayback';
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
			revision: value.ambientAudioRevision ?? 0
		};
	}

	function effectsStateFromScene(value: Scene): AudioPlaybackState {
		return {
			path: value.ambientEffectPath,
			playing: value.ambientEffectEnabled,
			volume: Math.max(0, Math.min(1, value.ambientEffectVolume / 100)),
			positionMs: value.ambientEffectPositionMs ?? 0,
			startedAt: value.ambientEffectStartedAt ? Date.parse(value.ambientEffectStartedAt) : 0,
			revision: value.ambientEffectRevision ?? 0
		};
	}

	async function signed(path: string) {
		return (await getSignedAssetUrl(session, scene.campaignId, path)) ?? '';
	}

	async function applyState(state: AudioPlaybackState) {
		lastState = state;
		if (!playback) return;
		const applied = await playback.apply(withListenerVolume(state, listenerVolume), signed);
		needsGesture = state.playing && !applied;
	}

	async function applyEffectsState(state: AudioPlaybackState) {
		lastEffectsState = state;
		if (!effectsPlayback) return;
		const applied = await effectsPlayback.apply(
			withListenerVolume(state, effectsListenerVolume),
			signed
		);
		effectsNeedGesture = state.playing && !applied;
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

	async function refreshScene() {
		try {
			const loaded = await loadScene(session, scene.id);
			if (loaded.scene.id === scene.id) {
				onSceneUpdate(loaded.scene);
				await applyState(stateFromScene(loaded.scene));
				await applyEffectsState(effectsStateFromScene(loaded.scene));
			}
		} catch {
			// A transient realtime refresh must not interrupt the audio already playing.
		}
	}

	async function loadTracks() {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const { data } = await supabase.storage
			.from('campaign-assets')
			.list(`campaigns/${scene.campaignId}/media`, {
				limit: 200,
				sortBy: { column: 'created_at', order: 'desc' }
			});
		tracks = (data ?? [])
			.filter((file) => file.metadata?.mimetype?.startsWith('audio/'))
			.map((file) => {
				const path = `campaigns/${scene.campaignId}/media/${file.name}`;
				const kind = audioAssetKind(file.name);
				return {
					path,
					name: audioAssetDisplayName(file.name.replace(/^[a-f0-9-]+-/, '')),
					// Keep previously selected, untagged effects usable after introducing categories.
					kind: path === scene.ambientEffectPath ? 'effect' : kind
				};
			});
	}

	async function save(next: Scene, notify = true) {
		const saved = await updateScene(session, next);
		onSceneUpdate(saved);
		if (notify) sceneSocket?.publishAudioState(stateFromScene(saved));
		return saved;
	}

	async function applyRemoteState(state: AudioPlaybackState) {
		if (state.playing && state.path && !tracks.some((track) => track.path === state.path))
			void loadTracks();
		onSceneUpdate({
			...scene,
			ambientAudioPath: state.path,
			ambientAudioEnabled: state.playing,
			ambientAudioVolume: Math.round(state.volume * 100),
			ambientAudioPositionMs: state.positionMs,
			ambientAudioStartedAt:
				state.playing && state.startedAt > 0 ? new Date(state.startedAt).toISOString() : null,
			ambientAudioRevision: state.revision ?? scene.ambientAudioRevision ?? 0
		});
		await applyState(state);
	}

	async function applyRemoteEffectsState(state: AudioPlaybackState) {
		if (state.playing && state.path && !tracks.some((track) => track.path === state.path))
			void loadTracks();
		onSceneUpdate({
			...scene,
			ambientEffectPath: state.path,
			ambientEffectEnabled: state.playing,
			ambientEffectVolume: Math.round(state.volume * 100),
			ambientEffectPositionMs: state.positionMs,
			ambientEffectStartedAt:
				state.playing && state.startedAt > 0 ? new Date(state.startedAt).toISOString() : null,
			ambientEffectRevision: state.revision ?? scene.ambientEffectRevision ?? 0
		});
		await applyEffectsState(state);
	}

	function publishState(state: AudioPlaybackState) {
		sceneSocket?.publishAudioState(state);
	}

	async function selectTrack(event: Event) {
		if (!isGM) return;
		const path = (event.currentTarget as HTMLSelectElement).value;
		if (path === (scene.ambientAudioPath ?? '')) return;
		const continuePlayback = scene.ambientAudioEnabled && Boolean(path);
		const startedAt = continuePlayback ? new Date().toISOString() : null;
		const next = {
			...scene,
			ambientAudioPath: path || null,
			ambientAudioEnabled: continuePlayback,
			ambientAudioPositionMs: 0,
			ambientAudioStartedAt: startedAt,
			ambientAudioRevision: (scene.ambientAudioRevision ?? 0) + 1
		};
		const saved = await save(next, false);
		const state: AudioPlaybackState = {
			path: saved.ambientAudioPath,
			playing: continuePlayback,
			volume: targetVolume(saved.ambientAudioVolume),
			positionMs: saved.ambientAudioPositionMs ?? 0,
			startedAt:
				continuePlayback && saved.ambientAudioStartedAt
					? Date.parse(saved.ambientAudioStartedAt)
					: 0,
			revision: saved.ambientAudioRevision ?? 0
		};
		publishState(state);
		await applyState(state);
	}

	async function toggle() {
		if (!isGM) return;
		const playing = !scene.ambientAudioEnabled;
		const positionMs = playing ? 0 : Math.round((playback?.currentTime ?? 0) * 1000);
		const next = {
			...scene,
			ambientAudioEnabled: playing,
			ambientAudioPositionMs: positionMs,
			ambientAudioStartedAt: playing ? new Date().toISOString() : null,
			ambientAudioRevision: (scene.ambientAudioRevision ?? 0) + 1
		};
		const state: AudioPlaybackState = {
			path: next.ambientAudioPath,
			playing,
			volume: targetVolume(next.ambientAudioVolume),
			positionMs,
			startedAt: playing ? Date.parse(next.ambientAudioStartedAt ?? '') || Date.now() : 0,
			revision: next.ambientAudioRevision ?? 0
		};
		// Start locally during the click gesture; waiting for the API save first can
		// outlive the browser's autoplay-activation window and make the first play fail.
		await applyState(state);
		try {
			const saved = await save(next, false);
			state.revision = saved.ambientAudioRevision ?? state.revision;
			publishState(state);
		} catch {
			await applyState(stateFromScene(scene));
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not update music playback.'
					: 'Não foi possível atualizar a música.'
			);
		}
	}

	async function selectEffect(event: Event) {
		if (!isGM) return;
		const path = (event.currentTarget as HTMLSelectElement).value;
		if (path === (scene.ambientEffectPath ?? '')) return;
		try {
			const continuePlayback = scene.ambientEffectEnabled && Boolean(path);
			const startedAt = continuePlayback ? new Date().toISOString() : null;
			const saved = await save(
				{
					...scene,
					ambientEffectPath: path || null,
					ambientEffectEnabled: continuePlayback,
					ambientEffectPositionMs: 0,
					ambientEffectStartedAt: startedAt,
					ambientEffectRevision: (scene.ambientEffectRevision ?? 0) + 1
				},
				false
			);
			const state = effectsStateFromScene(saved);
			sceneSocket?.publishAudioEffects(state);
			await applyEffectsState(state);
		} catch {
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not change the sound effect.'
					: 'Não foi possível trocar o efeito sonoro.'
			);
		}
	}

	async function toggleEffect() {
		if (!isGM) return;
		try {
			const playing = !scene.ambientEffectEnabled;
			const positionMs = playing ? 0 : Math.round((effectsPlayback?.currentTime ?? 0) * 1000);
			const next = {
				...scene,
				ambientEffectEnabled: playing,
				ambientEffectPositionMs: positionMs,
				ambientEffectStartedAt: playing ? new Date().toISOString() : null,
				ambientEffectRevision: (scene.ambientEffectRevision ?? 0) + 1
			};
			const state = effectsStateFromScene(next);
			await applyEffectsState(state);
			const saved = await save(next, false);
			state.revision = saved.ambientEffectRevision ?? state.revision;
			sceneSocket?.publishAudioEffects(state);
		} catch {
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not update sound playback.'
					: 'Não foi possível atualizar a reprodução do efeito.'
			);
		}
	}

	async function enableAudio() {
		if (lastState) await applyState({ ...lastState, startedAt: Date.now() });
		if (lastEffectsState) await applyEffectsState({ ...lastEffectsState, startedAt: Date.now() });
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
		if (first && second) playback = new CrossfadeAudio([first, second]);
		if (effectsFirst && effectsSecond)
			effectsPlayback = new CrossfadeAudio([effectsFirst, effectsSecond]);
		void loadTracks();
		void applyState(stateFromScene(scene));
		void applyEffectsState(effectsStateFromScene(scene));
		sceneSocket = connectSceneSocket(
			session,
			scene.id,
			() => void refreshScene(),
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
		return () => {
			sceneSocket?.close();
			sceneSocket = null;
			playback = null;
			effectsPlayback = null;
		};
	});

	$effect(() => {
		const state = stateFromScene(scene);
		if (
			!lastState ||
			state.path !== lastState.path ||
			state.playing !== lastState.playing ||
			state.volume !== lastState.volume
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
			state.volume !== lastEffectsState.volume
		)
			void applyEffectsState(state);
	});
</script>

<div class="audio-channels" aria-label="Canais de áudio da campanha">
	<div
		class="ambient-player music-player"
		aria-label={$appLocale === 'en' ? 'Campaign music player' : 'Player de música da campanha'}
	>
		{#if isGM}<select
				value={scene.ambientAudioPath ?? ''}
				onchange={(event) => void selectTrack(event)}
			>
				<option value=""
					>{$appLocale === 'en'
						? 'Select campaign music…'
						: 'Selecionar música da campanha…'}</option
				>
				{#each musicTracks as track (track.path)}<option value={track.path}>{track.name}</option
					>{/each}
			</select>
			<div class="gm-status">
				<strong
					>{tracks.find((track) => track.path === scene.ambientAudioPath)?.name ??
						($appLocale === 'en' ? 'No music selected' : 'Nenhuma música selecionada')}</strong
				>
				{#if scene.ambientAudioPath}<button onclick={() => void toggle()}
						>{scene.ambientAudioEnabled ? '❚❚ Parar' : '♫ Tocar'}</button
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
			</div>
		{:else}<div class="listener-status">
				<strong
					>{tracks.find((track) => track.path === scene.ambientAudioPath)?.name ??
						'Nenhuma música'}</strong
				>
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
		{#if isGM}<select
				value={scene.ambientEffectPath ?? ''}
				onchange={(event) => void selectEffect(event)}
			>
				<option value=""
					>{$appLocale === 'en' ? 'Select a sound effect…' : 'Selecionar efeito sonoro…'}</option
				>
				{#each effectTracks as track (track.path)}<option value={track.path}>{track.name}</option
					>{/each}
			</select>
			<div class="gm-status">
				<strong
					>{tracks.find((track) => track.path === scene.ambientEffectPath)?.name ??
						($appLocale === 'en' ? 'No effect selected' : 'Nenhum efeito selecionado')}</strong
				>
				{#if scene.ambientEffectPath}<button onclick={() => void toggleEffect()}
						>{scene.ambientEffectEnabled ? '❚❚ Parar' : '♫ Tocar'}</button
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
					>{tracks.find((track) => track.path === scene.ambientEffectPath)?.name ??
						($appLocale === 'en' ? 'No sound effect' : 'Nenhum efeito sonoro')}</strong
				>
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
