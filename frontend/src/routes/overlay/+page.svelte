<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	import { loadMessages } from '$lib/services/eventApi';
	import type { Mensagem } from '$lib/stores/chatStore';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { loadScene, type PersistedToken, type Scene } from '$lib/services/sceneApi';

	let session = $state<Session | null>(null);
	let scene = $state<Scene | null>(null);
	let tokens = $state<PersistedToken[]>([]);
	let imageUrls = $state<Record<string, string>>({});
	let messages = $state<Mensagem[]>([]);
	let error = $state('');
	let socket: SceneSocket | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let audioSrc = $state('');
	let audioVolume = $state(0.5);
	let audio = $state<HTMLAudioElement>();
	let audioBlocked = $state(false);
	let cameraUrls = $state<string[]>([]);

	const query = () => new URLSearchParams(window.location.search);
	const campaignId = () => query().get('campaign') ?? '';
	const sceneId = () => query().get('scene') ?? '';
	const visibleTokens = () => tokens.filter((token) => !token.hidden);
	const recentRolls = () =>
		messages
			.filter((message) => message.tipo === 'rolagem')
			.slice(-4)
			.reverse();

	async function refresh(currentSession: Session) {
		if (!sceneId() || !campaignId()) {
			error = 'Informe os parâmetros campaign e scene na URL do overlay.';
			return;
		}
		try {
			const [loadedScene, loadedMessages] = await Promise.all([
				loadScene(currentSession, sceneId()),
				loadMessages(currentSession, campaignId())
			]);
			scene = loadedScene.scene;
			tokens = loadedScene.tokens;
			const client = supabase;
			audioVolume = Math.max(0, Math.min(1, loadedScene.scene.ambientAudioVolume / 100));
			if (loadedScene.scene.ambientAudioEnabled && loadedScene.scene.ambientAudioPath && client) {
				const { data } = await client.storage
					.from('campaign-assets')
					.createSignedUrl(loadedScene.scene.ambientAudioPath, 3600);
				audioSrc = data?.signedUrl ?? '';
				if (audio) {
					audio.src = audioSrc;
					audio.volume = audioVolume;
					void audio.play().catch(() => (audioBlocked = true));
				}
			} else {
				audioSrc = '';
				if (audio) audio.pause();
			}
			if (client) {
				const signedEntries = await Promise.all(
					loadedScene.tokens.map(async (token) => {
						if (
							!token.imageUrl ||
							token.imageUrl.startsWith('http') ||
							token.imageUrl.startsWith('data:')
						)
							return [token.id, token.imageUrl ?? ''] as const;
						const { data } = await client.storage
							.from('campaign-assets')
							.createSignedUrl(token.imageUrl, 3600);
						return [token.id, data?.signedUrl ?? ''] as const;
					})
				);
				imageUrls = Object.fromEntries(signedEntries);
			}
			messages = loadedMessages;
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível carregar o overlay.';
		}
	}

	onMount(() => {
		if (!supabase) {
			error = 'Supabase não está configurado.';
			return;
		}
		let disposed = false;
		const overlayChannel =
			'BroadcastChannel' in window
				? new BroadcastChannel(`maismorras:overlay:${campaignId()}`)
				: null;
		const applySceneChange = (nextSceneId: string) => {
			if (!nextSceneId || nextSceneId === sceneId()) return;
			const next = new URL(window.location.href);
			next.searchParams.set('scene', nextSceneId);
			window.history.replaceState({}, '', next);
			window.location.reload();
		};
		overlayChannel?.addEventListener('message', (event) => {
			if (event.data?.type === 'scene-change') applySceneChange(String(event.data.sceneId));
		});
		const onStorage = (event: StorageEvent) => {
			if (event.key !== `maismorras:overlay:${campaignId()}` || !event.newValue) return;
			try {
				applySceneChange(String(JSON.parse(event.newValue).sceneId));
			} catch {
				/* invalid event */
			}
		};
		window.addEventListener('storage', onStorage);
		const params = query();
		cameraUrls = [1, 2, 3, 4]
			.map((index) => params.get(`camera${index}`) ?? '')
			.filter((value) => value.startsWith('https://vdo.ninja/'));
		supabase.auth.getSession().then(({ data }) => {
			if (disposed || !data.session) {
				error = 'Faça login no MaisMorras antes de abrir o overlay.';
				return;
			}
			session = data.session;
			void refresh(data.session);
			socket = connectSceneSocket(data.session, sceneId(), () => {
				if (refreshTimer) clearTimeout(refreshTimer);
				refreshTimer = setTimeout(() => void refresh(data.session), 180);
			});
		});
		return () => {
			disposed = true;
			overlayChannel?.close();
			window.removeEventListener('storage', onStorage);
			if (refreshTimer) clearTimeout(refreshTimer);
			socket?.close();
		};
	});
	async function enableAudio() {
		if (!audio || !audioSrc) return;
		audio.volume = audioVolume;
		await audio.play();
		audioBlocked = false;
	}

	const tokenImage = (token: PersistedToken) =>
		imageUrls[token.id] ||
		(token.imageUrl?.startsWith('http') || token.imageUrl?.startsWith('data:')
			? token.imageUrl
			: null);
	const rollLabel = (message: Mensagem) =>
		message.detalhesRolagem?.label ||
		message.texto.split(' · ')[0] ||
		message.detalhesRolagem?.expressao ||
		'Rolagem';
</script>

<svelte:head>
	<title>{scene?.name ?? 'Overlay · MaisMorras'}</title>
	<meta name="theme-color" content="#09070b" />
</svelte:head>

<main class="live-overlay" aria-label="Overlay da live">
	{#if error}<p class="overlay-error">{error}</p>{:else if !session || !scene}<p
			class="overlay-loading"
		>
			Carregando overlay…
		</p>{:else}
		<header class="overlay-header">
			<div>
				<span>MAISMORRAS · LIVE</span>
				<h1>{scene.name}</h1>
			</div>
			<small>{visibleTokens().length} personagens em cena</small>
		</header>
		{#if audioSrc}<audio
				bind:this={audio}
				src={audioSrc}
				loop
				preload="auto"
				oncanplay={() => void audio?.play().catch(() => (audioBlocked = true))}
			></audio>{#if audioBlocked}<button class="audio-enable" onclick={() => void enableAudio()}
					>Ativar áudio da cena</button
				>{/if}{/if}
		<section class="token-strip" aria-label="Personagens na cena">
			{#each visibleTokens() as token (token.id)}<article class="token-card">
					{#if tokenImage(token)}<img src={tokenImage(token) ?? ''} alt="" />{:else}<div
							class="token-fallback"
						>
							{token.name.slice(0, 1).toUpperCase()}
						</div>{/if}
					<div>
						<strong>{token.name}</strong>{#if token.visibility.showHP}<small
								>{token.hpCurrent}/{token.hpMax} PV</small
							>{/if}
					</div>
				</article>{/each}
		</section>
		{#if recentRolls().length}<aside class="roll-feed" aria-label="Últimas rolagens">
				{#each recentRolls() as message (message.id)}<div class="roll-item">
						<small>{message.autor} / {rollLabel(message)}</small><strong
							>{message.detalhesRolagem?.total ?? '—'}</strong
						>
					</div>{/each}
			</aside>{/if}
		{#if cameraUrls.length}<section class="camera-grid" aria-label="Câmeras dos jogadores">
				{#each cameraUrls as camera, index (camera)}<iframe
						src={camera}
						title={`Câmera do jogador ${index + 1}`}
						allow="camera; microphone; autoplay; fullscreen"
					></iframe>{/each}
			</section>{/if}
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		min-width: 320px;
		background: transparent;
	}
	:global(body) {
		overflow: hidden;
	}
	.live-overlay {
		min-height: 100dvh;
		padding: clamp(1rem, 3vw, 2.8rem);
		color: #f7eedf;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		background:
			radial-gradient(circle at 15% 0%, #53341caa, transparent 32%),
			linear-gradient(180deg, #08070bd9, transparent 32%, #08070bd9);
	}
	.overlay-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		max-width: 1100px;
		margin: 0 auto;
		padding: 0.8rem 1rem;
		border-left: 3px solid #e0b86f;
		background: #120f14cc;
		box-shadow: 0 12px 30px #0007;
	}
	.overlay-header span {
		color: #e0b86f;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.2em;
	}
	h1 {
		margin: 0.2rem 0 0;
		font:
			500 clamp(1.4rem, 3vw, 2.4rem)/1 Georgia,
			serif;
	}
	.overlay-header small {
		color: #c4b6a5;
		font-size: 0.72rem;
	}
	.token-strip,
	.roll-feed {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		max-width: 1100px;
		margin: 0.8rem auto 0;
	}
	.token-card,
	.roll-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid #d8ad6744;
		border-radius: 8px;
		background: #171219dd;
		backdrop-filter: blur(8px);
	}
	.token-card img,
	.token-fallback {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		object-fit: cover;
	}
	.token-fallback {
		display: grid;
		place-items: center;
		color: #2a1b0e;
		background: #e0b86f;
		font-weight: 800;
	}
	.token-card strong {
		display: block;
		font-size: 0.74rem;
	}
	.token-card small,
	.roll-item small {
		display: block;
		color: #b9aa9b;
		font-size: 0.62rem;
	}
	.roll-feed {
		justify-content: end;
	}
	.roll-item {
		min-width: 7.5rem;
		justify-content: space-between;
		gap: 1rem;
	}
	.roll-item strong {
		color: #f0cb85;
		font-size: 1.2rem;
	}
	.audio-enable {
		display: block;
		margin: 0.7rem auto;
		border: 1px solid #d8ad67;
		border-radius: 999px;
		padding: 0.45rem 0.8rem;
		color: #2a1b0e;
		background: #e0b86f;
		font-size: 0.7rem;
		font-weight: 800;
		cursor: pointer;
	}
	.camera-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
		max-width: 1100px;
		margin: 0.8rem auto 0;
	}
	.camera-grid iframe {
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 1px solid #d8ad6744;
		border-radius: 8px;
		background: #0c0a0fdd;
	}
	.overlay-error,
	.overlay-loading {
		display: grid;
		min-height: 80dvh;
		place-items: center;
		margin: 0;
		color: #ead8b7;
		text-align: center;
	}
	@media (max-width: 900px) {
		.camera-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.live-overlay {
			padding: 0.75rem;
		}
		.overlay-header {
			align-items: start;
			flex-direction: column;
		}
		.roll-feed {
			justify-content: start;
		}
		.camera-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
