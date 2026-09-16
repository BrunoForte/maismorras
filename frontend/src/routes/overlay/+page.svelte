<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	import { loadMessages } from '$lib/services/eventApi';
	import type { Mensagem } from '$lib/stores/chatStore';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { loadScene, type PersistedToken, type Scene } from '$lib/services/sceneApi';
	import DiceOverlay from '$lib/components/DiceOverlay.svelte';
	import { diceOverlay, setDice3dPreference } from '$lib/stores/diceOverlayStore';
	import { apiBase } from '$lib/services/apiBase';

	let session = $state<Session | null>(null);
	let scene = $state<Scene | null>(null);
	let tokens = $state<PersistedToken[]>([]);
	let imageUrls = $state<Record<string, string>>({});
	let messages = $state<Mensagem[]>([]);
	let error = $state('');
	let socket: SceneSocket | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let publicRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let audioSrc = $state('');
	let audioVolume = $state(0.5);
	let audio = $state<HTMLAudioElement>();
	let audioBlocked = $state(false);
	type CameraSlot = { url: string; playerName: string; characterName: string };
	let cameraSlots = $state<CameraSlot[]>([]);
	let mapBackground = $state('');
	let initialized = false;
	// This set is a private animation de-duplication cache, not rendered state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const seenRolls = new Set<string>();
	let publicMode = $state(false);
	let authRequired = $state(false);
	onDestroy(() => {
		if (publicRefreshTimer) clearInterval(publicRefreshTimer);
	});

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
				if (loadedScene.scene.backgroundUrl) {
					if (
						loadedScene.scene.backgroundUrl.startsWith('http') ||
						loadedScene.scene.backgroundUrl.startsWith('data:')
					)
						mapBackground = loadedScene.scene.backgroundUrl;
					else {
						const { data } = await client.storage
							.from('campaign-assets')
							.createSignedUrl(loadedScene.scene.backgroundUrl, 3600);
						mapBackground = data?.signedUrl ?? '';
					}
				}
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
			for (const message of loadedMessages.filter((item) => item.tipo === 'rolagem')) {
				if (!initialized) seenRolls.add(message.id);
				else if (!seenRolls.has(message.id) && message.detalhesRolagem) {
					seenRolls.add(message.id);
					diceOverlay.set({
						expression: message.detalhesRolagem.expressao,
						total: message.detalhesRolagem.total,
						dice: message.detalhesRolagem.dados,
						nonce: message.id
					});
				}
			}
			initialized = true;
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível carregar o overlay.';
		}
	}
	async function refreshPublic() {
		const token = query().get('access');
		if (!token || !sceneId()) return;
		const response = await fetch(
			`${apiBase}/api/v1/overlay/${encodeURIComponent(token)}?scene=${encodeURIComponent(sceneId())}`
		);
		if (!response.ok) throw new Error('Overlay inválida ou revogada.');
		const data = await response.json();
		scene = data.scene;
		tokens = data.tokens ?? [];
		messages = (data.events ?? []).map(
			(event: {
				id: number;
				author: string;
				type: string;
				payload: unknown;
				createdAt: string;
			}) => ({
				id: String(event.id),
				autor: event.author,
				tipo: event.type === 'dice.roll' ? 'rolagem' : 'sistema',
				texto: '',
				detalhesRolagem: event.payload
			})
		);
		error = '';
	}

	onMount(() => {
		setDice3dPreference(true);
		publicMode = Boolean(query().get('access'));
		if (publicMode) {
			cameraSlots = Array.from({ length: 12 }, (_, index) => index + 1)
				.map((index) => ({
					url: query().get(`camera${index}`) ?? '',
					playerName: query().get(`camera${index}Player`) ?? '',
					characterName: query().get(`camera${index}Character`) ?? ''
				}))
				.filter((camera) => camera.url.startsWith('https://vdo.ninja/'));
			void refreshPublic().catch(
				(err) =>
					(error = err instanceof Error ? err.message : 'Não foi possível carregar o overlay.')
			);
			publicRefreshTimer = setInterval(() => {
				void refreshPublic().catch((err) => {
					error = err instanceof Error ? err.message : 'Não foi possível atualizar o overlay.';
					if (publicRefreshTimer) {
						clearInterval(publicRefreshTimer);
						publicRefreshTimer = null;
					}
				});
			}, 5000);
			return;
		}
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
		cameraSlots = Array.from({ length: 12 }, (_, index) => index + 1)
			.map((index) => ({
				url: params.get(`camera${index}`) ?? '',
				playerName: params.get(`camera${index}Player`) ?? '',
				characterName: params.get(`camera${index}Character`) ?? ''
			}))
			.filter((camera) => camera.url.startsWith('https://vdo.ninja/'));
		supabase.auth.getSession().then(({ data }) => {
			if (disposed || !data.session) {
				authRequired = true;
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
			if (publicRefreshTimer) clearInterval(publicRefreshTimer);
			socket?.close();
		};
	});
	async function enableAudio() {
		if (!audio || !audioSrc) return;
		audio.volume = audioVolume;
		await audio.play();
		audioBlocked = false;
	}
	async function login() {
		if (!supabase) return;
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: window.location.href }
		});
		if (authError) error = authError.message;
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
	{#if authRequired}<section class="overlay-auth">
			<p class="overlay-error">Faça login no MaisMorras para visualizar esta overlay.</p>
			<button onclick={() => void login()}>Entrar com Google</button>
		</section>{:else if error}<p class="overlay-error">{error}</p>{:else if !session || !scene}<p
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
		<section
			class="map-preview"
			aria-label="Mapa da cena"
			style={`--grid-size: ${scene.gridSize}px; background-image: ${mapBackground ? `url("${mapBackground}")` : 'none'}`}
		>
			<div class="map-grid" aria-hidden="true"></div>
			{#each visibleTokens() as token (token.id)}<div
					class="map-token"
					style={`left:${token.x}px;top:${token.y}px;width:${token.size}px;height:${token.size}px;background:${token.color ? `#${token.color.toString(16).padStart(6, '0')}` : '#7b4b37'}`}
					title={token.name}
				>
					{token.name.slice(0, 1).toUpperCase()}
				</div>{/each}
			<DiceOverlay />
		</section>
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
		{#if cameraSlots.length}<section class="camera-grid" aria-label="Câmeras dos jogadores">
				{#each cameraSlots as camera, index (camera.url)}<article class="camera-card">
						<iframe
							src={camera.url}
							title={`Câmera do jogador ${index + 1}`}
							allow="camera; microphone; autoplay; fullscreen"
						></iframe><strong>{camera.playerName || `Jogador ${index + 1}`}</strong
						>{#if camera.characterName}<small>{camera.characterName}</small>{/if}
					</article>{/each}
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
	.map-preview {
		position: relative;
		isolation: isolate;
		width: min(1100px, 100%);
		height: min(60dvh, 680px);
		margin: 0 auto;
		border: 1px solid #d8ad6755;
		border-radius: 10px;
		background-color: #151019;
		background-position: center;
		background-size: cover;
		overflow: hidden;
	}
	.map-grid {
		position: absolute;
		inset: 0;
		z-index: -1;
		background-image:
			linear-gradient(#d8ad6733 1px, transparent 1px),
			linear-gradient(90deg, #d8ad6733 1px, transparent 1px);
		background-size: var(--grid-size) var(--grid-size);
	}
	.map-token {
		position: absolute;
		display: grid;
		place-items: center;
		border: 2px solid #f7dfaa;
		border-radius: 50%;
		color: #fff4da;
		font-weight: 800;
		text-shadow: 0 1px 3px #000;
		box-shadow: 0 3px 10px #000b;
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
	.camera-card {
		display: grid;
		gap: 0.25rem;
		color: #f0cb85;
		font-size: 0.72rem;
	}
	.camera-card small {
		color: #cdbda9;
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
	.overlay-auth {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 1rem;
		min-height: 100dvh;
		text-align: center;
	}
	.overlay-auth button {
		padding: 0.7rem 1.1rem;
		border: 1px solid #d8ad67;
		border-radius: 8px;
		color: #1b1514;
		background: #d8ad67;
		font-weight: 700;
		cursor: pointer;
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
