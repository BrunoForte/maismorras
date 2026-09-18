<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import type { Scene } from '$lib/services/sceneApi';
	import { updateScene } from '$lib/services/sceneApi';
	import { supabase } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { apiBase } from '$lib/services/apiBase';
	let { scene, session, isGM, onSceneUpdate } = $props<{
		scene: Scene;
		session: Session;
		isGM: boolean;
		onSceneUpdate: (scene: Scene) => void;
	}>();
	type Track = { path: string; name: string };
	let tracks = $state<Track[]>([]);
	let url = $state('');
	let loadedPath = $state('');
	let needsGesture = $state(false);
	let fading = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	const audio = () => document.getElementById('maismorras-ambient-a') as HTMLAudioElement | null;
	onMount(() => {
		void loadTracks();
		const element = audio();
		const updateTime = () => {
			if (!element) return;
			currentTime = element.currentTime;
			duration = Number.isFinite(element.duration) ? element.duration : 0;
		};
		element?.addEventListener('timeupdate', updateTime);
		element?.addEventListener('loadedmetadata', updateTime);
		return () => {
			element?.removeEventListener('timeupdate', updateTime);
			element?.removeEventListener('loadedmetadata', updateTime);
		};
	});
	const timeLabel = (value: number) =>
		`${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
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
	async function signed(path: string) {
		const response = await fetch(
			`${apiBase}/api/v1/campaigns/${scene.campaignId}/assets/signed-url`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.access_token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ path })
			}
		);
		if (!response.ok) return '';
		const data = (await response.json()) as { url?: string };
		return data.url ?? '';
	}
	async function save(next: Scene) {
		const saved = await updateScene(session, next);
		onSceneUpdate(saved);
		return saved;
	}
	async function selectTrack(event: Event) {
		if (!isGM) return;
		const path = (event.currentTarget as HTMLSelectElement).value;
		const next = { ...scene, ambientAudioPath: path || null, ambientAudioEnabled: false };
		await save(next);
		url = path ? await signed(path) : '';
		loadedPath = path;
		const element = audio();
		if (element) {
			element.pause();
			element.currentTime = 0;
			element.src = url;
		}
	}
	async function toggle() {
		if (!isGM && !needsGesture) return;
		const element = audio();
		if (!element || !url) return;
		if (element.paused) {
			try {
				await element.play();
				needsGesture = false;
				await save({ ...scene, ambientAudioEnabled: true });
			} catch {
				needsGesture = true;
			}
		} else {
			element.pause();
			await save({ ...scene, ambientAudioEnabled: false });
		}
	}
	$effect(() => {
		const path = scene.ambientAudioPath ?? '';
		if (path !== loadedPath) {
			loadedPath = path;
			url = '';
			if (path) void signed(path).then((value) => (url = value));
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
				<span
					>{scene.ambientAudioEnabled
						? `${timeLabel(currentTime)} / ${timeLabel(duration)}`
						: 'Pausada'}</span
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
			<span
				>{scene.ambientAudioEnabled
					? `${timeLabel(currentTime)} / ${timeLabel(duration)}`
					: 'Pausada'}</span
			>
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
	.listener-status {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
		color: #eee4d6;
		pointer-events: none;
	}
	.listener-status strong {
		overflow: hidden;
		color: #e8c786;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.listener-status span {
		flex: 0 0 auto;
		color: #b9aa9b;
		font-variant-numeric: tabular-nums;
	}
	.gm-status {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 1rem;
		min-width: 0;
	}
	.gm-status strong {
		overflow: hidden;
		color: #e8c786;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gm-status span {
		flex: 0 0 auto;
		color: #b9aa9b;
		font-variant-numeric: tabular-nums;
	}
	.ambient-player button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.5rem 0.8rem;
		color: #26190e;
		background: #e0b86f;
		font-weight: 700;
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
			justify-content: space-between;
		}
	}
</style>
