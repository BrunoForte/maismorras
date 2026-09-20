<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import type { Scene } from '$lib/services/sceneApi';
	import { loadScene, updateScene } from '$lib/services/sceneApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import type { AudioPlaybackState } from '$lib/services/audioPlayback';
	import { CrossfadeAudio } from '$lib/services/audioPlayback';
	import { supabase } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { getSignedAssetUrl } from '$lib/services/assetApi';

	let { scene, session, isGM, onSceneUpdate } = $props<{
		scene: Scene;
		session: Session;
		isGM: boolean;
		onSceneUpdate: (scene: Scene) => void;
	}>();
	type Track = { path: string; name: string };
	let tracks = $state<Track[]>([]);
	let needsGesture = $state(false);
	let sceneSocket: SceneSocket | null = null;
	let playback: CrossfadeAudio | null = null;
	let lastState: AudioPlaybackState | null = null;
	const targetVolume = (value = scene.ambientAudioVolume) => Math.max(0, Math.min(1, value / 100));

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

	async function signed(path: string) {
		return (await getSignedAssetUrl(session, scene.campaignId, path)) ?? '';
	}

	async function applyState(state: AudioPlaybackState) {
		lastState = state;
		if (!playback) return;
		const applied = await playback.apply(state, signed);
		needsGesture = state.playing && !applied;
	}

	async function refreshScene() {
		try {
			const loaded = await loadScene(session, scene.id);
			if (loaded.scene.id === scene.id) {
				onSceneUpdate(loaded.scene);
				await applyState(stateFromScene(loaded.scene));
			}
		} catch {
			// A transient realtime refresh must not interrupt the audio already playing.
		}
	}

	async function loadTracks() {
		if (!supabase) return;
		const { data } = await supabase.storage
			.from('campaign-assets')
			.list(`campaigns/${scene.campaignId}/media`, {
				limit: 200,
				sortBy: { column: 'created_at', order: 'desc' }
			});
		tracks = (data ?? [])
			.filter((file) => file.metadata?.mimetype?.startsWith('audio/'))
			.map((file) => ({
				path: `campaigns/${scene.campaignId}/media/${file.name}`,
				name: file.name.replace(/^[a-f0-9-]+-/, '')
			}));
	}

	async function save(next: Scene, notify = true) {
		const saved = await updateScene(session, next);
		onSceneUpdate(saved);
		if (notify) sceneSocket?.publishRefresh();
		return saved;
	}

	async function applyRemoteState(state: AudioPlaybackState) {
		onSceneUpdate({
			...scene,
			ambientAudioPath: state.path,
			ambientAudioEnabled: state.playing,
			ambientAudioVolume: Math.round(state.volume * 100)
		});
		await applyState(state);
	}

	function publishState(state: AudioPlaybackState) {
		sceneSocket?.publishAudioState(state);
	}

	async function selectTrack(event: Event) {
		if (!isGM) return;
		const path = (event.currentTarget as HTMLSelectElement).value;
		const next = {
			...scene,
			ambientAudioPath: path || null,
			ambientAudioEnabled: false,
			ambientAudioPositionMs: 0,
			ambientAudioStartedAt: null,
			ambientAudioRevision: (scene.ambientAudioRevision ?? 0) + 1
		};
		const saved = await save(next, false);
		const state: AudioPlaybackState = {
			path: saved.ambientAudioPath,
			playing: false,
			volume: targetVolume(saved.ambientAudioVolume),
			positionMs: saved.ambientAudioPositionMs ?? 0,
			startedAt: saved.ambientAudioStartedAt ? Date.parse(saved.ambientAudioStartedAt) : 0,
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
		const saved = await save(next, false);
		const state: AudioPlaybackState = {
			path: saved.ambientAudioPath,
			playing,
			volume: targetVolume(saved.ambientAudioVolume),
			positionMs,
			startedAt: playing ? Date.parse(saved.ambientAudioStartedAt ?? '') || Date.now() : 0,
			revision: saved.ambientAudioRevision ?? 0
		};
		publishState(state);
		await applyState(state);
	}

	async function enableAudio() {
		if (!lastState) return;
		await applyState({ ...lastState, startedAt: Date.now() });
	}

	onMount(() => {
		const first = document.getElementById('maismorras-ambient-a') as HTMLAudioElement | null;
		const second = document.getElementById('maismorras-ambient-b') as HTMLAudioElement | null;
		if (first && second) playback = new CrossfadeAudio([first, second]);
		void loadTracks();
		void applyState(stateFromScene(scene));
		sceneSocket = connectSceneSocket(
			session,
			scene.id,
			() => void refreshScene(),
			undefined,
			undefined,
			(state) => void applyRemoteState(state)
		);
		return () => {
			sceneSocket?.close();
			sceneSocket = null;
			playback = null;
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
</script>

<div
	class="ambient-player"
	aria-label={$appLocale === 'en' ? 'Campaign music player' : 'Player de música da campanha'}
>
	{#if isGM}<select
			value={scene.ambientAudioPath ?? ''}
			onchange={(event) => void selectTrack(event)}
		>
			<option value=""
				>{$appLocale === 'en' ? 'Select campaign music…' : 'Selecionar música da campanha…'}</option
			>
			{#each tracks as track (track.path)}<option value={track.path}>{track.name}</option>{/each}
		</select>
		{#if scene.ambientAudioPath}<div class="gm-status">
				<strong
					>{tracks.find((track) => track.path === scene.ambientAudioPath)?.name ??
						'Música selecionada'}</strong
				>
				<button onclick={() => void toggle()}
					>{scene.ambientAudioEnabled ? '❚❚ Parar' : '♫ Tocar'}</button
				>
			</div>{/if}
	{:else}<div class="listener-status">
			<strong
				>{tracks.find((track) => track.path === scene.ambientAudioPath)?.name ??
					'Nenhuma música'}</strong
			>
			{#if needsGesture}<button class="audio-enable" onclick={() => void enableAudio()}
					>{$appLocale === 'en' ? 'Enable audio' : 'Ativar áudio'}</button
				>{/if}
		</div>{/if}
</div>

<style>
	.ambient-player {
		position: fixed;
		z-index: 45;
		box-sizing: border-box;
		min-height: 3.5rem;
		inset-inline: 0;
		inset-block-end: 0;
		width: 100vw;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.55rem max(1rem, env(safe-area-inset-right)) 0.55rem
			max(1rem, env(safe-area-inset-left));
		border-top: 1px solid #5a493b;
		background: #211b1e;
		box-shadow: 0 -5px 20px #0008;
	}
	.ambient-player select {
		width: min(24rem, 55vw);
		min-width: 12rem;
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eee4d6;
		background: #121012;
	}
	.listener-status,
	.gm-status {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
		color: #eee4d6;
	}
	.listener-status {
		pointer-events: none;
	}
	.listener-status strong,
	.gm-status strong {
		overflow: hidden;
		color: #e8c786;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ambient-player button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.5rem 0.8rem;
		color: #26190e;
		background: #e0b86f;
		font-weight: 700;
		pointer-events: auto;
	}
	@media (max-width: 600px) {
		.ambient-player {
			flex-wrap: wrap;
		}
		.ambient-player select {
			min-width: 100%;
		}
		.gm-status {
			width: 100%;
		}
	}
</style>
