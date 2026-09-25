<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	import { loadMessages } from '$lib/services/eventApi';
	import type { Mensagem } from '$lib/stores/chatStore';
	import {
		connectSceneSocket,
		type RealtimeStatus,
		type SceneSocket
	} from '$lib/services/sceneRealtime';
	import { loadScene, type PersistedToken, type Scene } from '$lib/services/sceneApi';
	import DiceOverlay from '$lib/components/DiceOverlay.svelte';
	import {
		diceOverlay,
		restoreDicePreference,
		setDice3dPreference,
		setDiceRendererMode
	} from '$lib/stores/diceOverlayStore';
	import LiveKitPreview from '$lib/components/LiveKitPreview.svelte';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { request } from '$lib/services/httpClient';
	import { CrossfadeAudio, type AudioPlaybackState } from '$lib/services/audioPlayback';
	import { getOverlaySettings } from '$lib/services/overlaySettingsApi';

	let session = $state<Session | null>(null);
	let scene = $state<Scene | null>(null);
	let tokens = $state<PersistedToken[]>([]);
	let imageUrls = $state<Record<string, string>>({});
	let messages = $state<Mensagem[]>([]);
	let lastEventId = 0;
	let error = $state('');
	let socket: SceneSocket | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let fallbackRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let audio = $state<HTMLAudioElement>();
	let audioB = $state<HTMLAudioElement>();
	let playback: CrossfadeAudio | null = null;
	let effectsAudio = $state<HTMLAudioElement>();
	let effectsAudioB = $state<HTMLAudioElement>();
	let effectsPlayback: CrossfadeAudio | null = null;
	let lastAudioState: AudioPlaybackState | null = null;
	let lastEffectsState: AudioPlaybackState | null = null;
	let audioBlocked = $state(false);
	let effectsAudioBlocked = $state(false);
	type CameraSlot = { url: string; playerName: string; characterName: string };
	let cameraSlots = $state<CameraSlot[]>([]);
	let mapBackground = $state('');
	type OverlayBlock = {
		id: string;
		x: number;
		y: number;
		width?: number;
		height?: number;
		fontSize?: number;
		color?: string;
		opacity?: number;
		borderColor?: string;
		borderWidth?: number;
		shadow?: boolean;
		visible: boolean;
		locked?: boolean;
	};
	let overlayLayout = $state<{
		background: string;
		blocks: OverlayBlock[];
		livekitUrl?: string;
		livekitRoom?: string;
		livekitToken?: string;
	}>({
		background: '',
		blocks: []
	});
	let overlayBackground = $state('');
	function applyLayoutDocument(value: unknown) {
		const document = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
		if (document.profiles && typeof document.profiles === 'object') {
			const profiles = document.profiles as Record<string, typeof overlayLayout>;
			const active = String(document.activeProfile ?? Object.keys(profiles)[0] ?? 'Principal');
			overlayLayout = profiles[active] ?? { background: '', blocks: [] };
		} else if (value && typeof value === 'object') overlayLayout = value as typeof overlayLayout;
		void resolveOverlayBackground(overlayLayout.background);
	}
	async function resolveOverlayBackground(path: string) {
		if (!path) {
			overlayBackground = '';
			return;
		}
		if (path.startsWith('http') || path.startsWith('data:')) {
			overlayBackground = path;
			return;
		}
		if (!session) return;
		overlayBackground = (await getSignedAssetUrl(session, campaignId(), path)) ?? '';
	}
	async function loadOverlayLayout(currentSession: Session | null = session) {
		try {
			if (currentSession) {
				const body = await request<{ layout?: unknown }>(
					currentSession,
					`/api/v1/scenes/${sceneId()}/overlay-layout`
				);
				if (body.layout && Object.keys(body.layout as object).length) {
					applyLayoutDocument(body.layout);
					localStorage.setItem(
						`maismorras:overlay-layout:${campaignId()}:${sceneId()}`,
						JSON.stringify(body.layout)
					);
					return;
				}
			}
			const saved = localStorage.getItem(`maismorras:overlay-layout:${campaignId()}:${sceneId()}`);
			if (saved) {
				applyLayoutDocument(JSON.parse(saved));
			}
		} catch {
			/* ignore malformed local layout */
		}
	}
	let initialized = false;
	// This set is a private animation de-duplication cache, not rendered state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const seenRolls = new Set<string>();
	let authRequired = $state(false);
	onDestroy(() => {});

	const query = () => new URLSearchParams(window.location.search);
	const campaignId = () => query().get('campaign') ?? '';
	const sceneId = () => query().get('scene') ?? '';
	const visibleTokens = () => tokens.filter((token) => !token.hidden);
	const recentRolls = () =>
		messages
			.filter((message) => message.tipo === 'rolagem')
			.slice(-4)
			.reverse();
	async function applyAudioState(state: AudioPlaybackState) {
		lastAudioState = state;
		if (!playback || !session) return;
		const applied = await playback.apply(
			state,
			async (path) => (await getSignedAssetUrl(session as Session, campaignId(), path)) ?? ''
		);
		audioBlocked = state.playing && !applied;
	}
	async function applyEffectsState(state: AudioPlaybackState) {
		lastEffectsState = state;
		if (!effectsPlayback || !session) return;
		const applied = await effectsPlayback.apply(
			state,
			async (path) => (await getSignedAssetUrl(session as Session, campaignId(), path)) ?? ''
		);
		effectsAudioBlocked = state.playing && !applied;
	}
	function sceneEffectsState(value: Scene): AudioPlaybackState {
		return {
			path: value.ambientEffectPath,
			playing: value.ambientEffectEnabled,
			volume: Math.max(0, Math.min(1, value.ambientEffectVolume / 100)),
			positionMs: value.ambientEffectPositionMs ?? 0,
			startedAt: value.ambientEffectStartedAt ? Date.parse(value.ambientEffectStartedAt) : 0,
			revision: value.ambientEffectRevision ?? 0
		};
	}
	async function refresh(currentSession: Session) {
		if (!sceneId() || !campaignId()) {
			error = 'Informe os parâmetros campaign e scene na URL do overlay.';
			return;
		}
		try {
			const [loadedScene, loadedMessages] = await Promise.all([
				loadScene(currentSession, sceneId()),
				loadMessages(currentSession, campaignId(), initialized ? lastEventId : undefined)
			]);
			scene = loadedScene.scene;
			tokens = loadedScene.tokens;
			const client = supabase;
			await applyAudioState({
				path: loadedScene.scene.ambientAudioPath,
				playing: loadedScene.scene.ambientAudioEnabled,
				volume: Math.max(0, Math.min(1, loadedScene.scene.ambientAudioVolume / 100)),
				positionMs: loadedScene.scene.ambientAudioPositionMs ?? 0,
				startedAt: loadedScene.scene.ambientAudioStartedAt
					? Date.parse(loadedScene.scene.ambientAudioStartedAt)
					: 0,
				revision: loadedScene.scene.ambientAudioRevision ?? 0
			});
			await applyEffectsState(sceneEffectsState(loadedScene.scene));
			if (client) {
				if (loadedScene.scene.backgroundUrl) {
					if (
						loadedScene.scene.backgroundUrl.startsWith('http') ||
						loadedScene.scene.backgroundUrl.startsWith('data:')
					)
						mapBackground = loadedScene.scene.backgroundUrl;
					else
						mapBackground =
							(await getSignedAssetUrl(
								currentSession,
								campaignId(),
								loadedScene.scene.backgroundUrl
							)) ?? '';
				}
				const signedEntries = await Promise.all(
					loadedScene.tokens.map(async (token) => {
						if (
							!token.imageUrl ||
							token.imageUrl.startsWith('http') ||
							token.imageUrl.startsWith('data:')
						)
							return [token.id, token.imageUrl ?? ''] as const;
						return [
							token.id,
							(await getSignedAssetUrl(currentSession, campaignId(), token.imageUrl)) ?? ''
						] as const;
					})
				);
				imageUrls = Object.fromEntries(signedEntries);
			}
			if (initialized) messages = [...messages, ...loadedMessages].slice(-100);
			else messages = loadedMessages;
			for (const message of loadedMessages) {
				const numericId = Number(message.id);
				if (Number.isSafeInteger(numericId)) lastEventId = Math.max(lastEventId, numericId);
			}
			for (const message of loadedMessages.filter((item) => item.tipo === 'rolagem')) {
				if (!initialized) seenRolls.add(message.id);
				else if (!seenRolls.has(message.id) && message.detalhesRolagem) {
					seenRolls.add(message.id);
					diceOverlay.set({
						expression: message.detalhesRolagem.label ?? message.detalhesRolagem.expressao,
						notation: message.detalhesRolagem.expressao,
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
	onMount(() => {
		restoreDicePreference();
		const diceMode = query().get('diceMode');
		if (
			diceMode === 'auto' ||
			diceMode === '2d' ||
			diceMode === '3d-overlay' ||
			diceMode === '3d-table'
		)
			setDiceRendererMode(diceMode);
		const dicePreference = query().get('dice3d');
		if (!diceMode && (dicePreference === '1' || dicePreference === '0'))
			setDice3dPreference(dicePreference === '1');
		void loadOverlayLayout();
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
			if (event.data?.type === 'layout-change' && String(event.data.sceneId) === sceneId())
				void loadOverlayLayout();
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
			getOverlaySettings(data.session, campaignId())
				.then((settings) => {
					if (settings.cameras?.length)
						cameraSlots = settings.cameras.filter((camera) =>
							camera.url.startsWith('https://vdo.ninja/')
						);
					if (!query().get('scene') && settings.activeSceneId)
						applySceneChange(settings.activeSceneId);
				})
				.catch(() => {
					/* query parameters remain a compatible fallback */
				});
			void loadOverlayLayout(data.session);
			void refresh(data.session);
			const updateFallback = (status: RealtimeStatus) => {
				if (status === 'connected') {
					if (fallbackRefreshTimer) clearInterval(fallbackRefreshTimer);
					fallbackRefreshTimer = null;
					return;
				}
				if (!fallbackRefreshTimer)
					fallbackRefreshTimer = setInterval(() => {
						void refresh(data.session);
						void loadOverlayLayout(data.session);
					}, 60_000);
			};
			socket = connectSceneSocket(
				data.session,
				sceneId(),
				() => {
					if (refreshTimer) clearTimeout(refreshTimer);
					refreshTimer = setTimeout(() => {
						void refresh(data.session);
						void loadOverlayLayout(data.session);
					}, 180);
				},
				undefined,
				updateFallback,
				(state) => void applyAudioState(state),
				(data) => {
					const presentation = (data as { presentation?: unknown } | undefined)?.presentation;
					if (!presentation && session) void refresh(session);
				},
				(data) => {
					const document = (data as { document?: unknown } | undefined)?.document;
					if (document) applyLayoutDocument(document);
					else void loadOverlayLayout(session);
				},
				undefined,
				undefined,
				undefined,
				undefined,
				(state) => void applyEffectsState(state)
			);
		});
		return () => {
			disposed = true;
			overlayChannel?.close();
			window.removeEventListener('storage', onStorage);
			if (refreshTimer) clearTimeout(refreshTimer);
			if (fallbackRefreshTimer) clearInterval(fallbackRefreshTimer);
			socket?.close();
		};
	});
	async function enableAudio() {
		if (lastAudioState) await applyAudioState({ ...lastAudioState, startedAt: Date.now() });
		if (lastEffectsState) await applyEffectsState({ ...lastEffectsState, startedAt: Date.now() });
	}
	$effect(() => {
		if (audio && audioB && !playback) playback = new CrossfadeAudio([audio, audioB]);
		if (effectsAudio && effectsAudioB && !effectsPlayback)
			effectsPlayback = new CrossfadeAudio([effectsAudio, effectsAudioB]);
		if (playback && lastAudioState) void applyAudioState(lastAudioState);
		if (effectsPlayback && lastEffectsState) void applyEffectsState(lastEffectsState);
	});
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
	const block = (id: string) => overlayLayout.blocks.find((item) => item.id === id);
	const blockStyle = (id: string) => {
		const item = block(id);
		return item
			? `--overlay-x:${item.x}%;--overlay-y:${item.y}%;--overlay-width:${item.width ?? 20}%;--overlay-height:${item.height ?? 20}%;--overlay-font:${item.fontSize ?? 1}rem;--overlay-color:${item.color ?? '#f0e0c8'};--overlay-opacity:${(item.opacity ?? 100) / 100};--overlay-border:${item.borderColor ?? '#d8ad67'};--overlay-border-width:${item.borderWidth ?? 1}px;--overlay-shadow:${item.shadow === false ? 'none' : '0 10px 24px #0008'};`
			: '';
	};
</script>

<svelte:head>
	<title>{scene?.name ?? 'Overlay · MaisMorras'}</title>
	<meta name="theme-color" content="#09070b" />
</svelte:head>

<main class="live-overlay" aria-label="Overlay da live">
	{#if authRequired}<section class="overlay-auth">
			<p class="overlay-error">Faça login no MaisMorras para visualizar esta overlay.</p>
			<button onclick={() => void login()}>Entrar com Google</button>
		</section>{:else if error}<p class="overlay-error">
			{error}
		</p>{:else if !scene || !session}<p class="overlay-loading">Carregando overlay…</p>{:else}
		<header
			class="overlay-header"
			class:layout-hidden={block('header')?.visible === false}
			class:layout-positioned={Boolean(block('header'))}
			style={blockStyle('header')}
		>
			<div>
				<span>MAISMORRAS · LIVE</span>
				<h1>{scene.name}</h1>
			</div>
			<small>{visibleTokens().length} personagens em cena</small>
		</header>
		<audio bind:this={audio} loop preload="metadata"></audio>
		<audio bind:this={audioB} loop preload="metadata"></audio>
		<audio bind:this={effectsAudio} loop preload="metadata"></audio>
		<audio bind:this={effectsAudioB} loop preload="metadata"></audio>
		{#if audioBlocked || effectsAudioBlocked}<button
				class="audio-enable"
				onclick={() => void enableAudio()}>Ativar áudio da cena</button
			>{/if}
		<section
			class="map-preview"
			class:layout-hidden={block('map')?.visible === false}
			class:layout-positioned={Boolean(block('map'))}
			aria-label="Mapa da cena"
			style={`--grid-size: ${scene.gridSize}px; ${blockStyle('map')} background-image: ${mapBackground ? `url("${mapBackground}")` : overlayBackground ? `url("${overlayBackground}")` : 'none'}`}
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
		<section
			class:hidden={block('map')?.visible === false}
			class="token-strip"
			aria-label="Personagens na cena"
		>
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
		{#if recentRolls().length && block('rolls')?.visible !== false}<aside
				class="roll-feed"
				class:layout-positioned={Boolean(block('rolls'))}
				aria-label="Últimas rolagens"
				style={blockStyle('rolls')}
			>
				{#each recentRolls() as message (message.id)}<div class="roll-item">
						<small>{message.autor} / {rollLabel(message)}</small><strong
							>{message.detalhesRolagem?.total ?? '—'}</strong
						>
					</div>{/each}
			</aside>{/if}
		{#if cameraSlots.length && block('cameras')?.visible !== false}<section
				class="camera-grid"
				class:layout-positioned={Boolean(block('cameras'))}
				aria-label="Câmeras dos jogadores"
				style={blockStyle('cameras')}
			>
				{#each cameraSlots as camera, index (camera.url)}<article
						class="camera-card"
						class:layout-positioned={Boolean(block(`camera-${index + 1}`))}
						style={blockStyle(`camera-${index + 1}`)}
					>
						<iframe
							src={camera.url}
							title={`Câmera do jogador ${index + 1}`}
							allow="camera; microphone; autoplay; fullscreen"
						></iframe><strong>{camera.playerName || `Jogador ${index + 1}`}</strong
						>{#if camera.characterName}<small>{camera.characterName}</small>{/if}
					</article>{/each}
				{#if overlayLayout.livekitUrl && overlayLayout.livekitToken}<article class="camera-card">
						<LiveKitPreview
							serverUrl={overlayLayout.livekitUrl}
							token={overlayLayout.livekitToken}
						/>
						<strong>LiveKit · {overlayLayout.livekitRoom || 'Sala'}</strong>
					</article>{/if}
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
		position: relative;
		isolation: isolate;
		min-height: 100dvh;
		padding: clamp(1rem, 3vw, 2.8rem);
		color: #f7eedf;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		background:
			radial-gradient(circle at 15% 0%, #53341caa, transparent 32%),
			linear-gradient(180deg, #08070bd9, transparent 32%, #08070bd9);
	}
	.layout-hidden {
		display: none !important;
	}
	.layout-positioned {
		position: absolute !important;
		left: var(--overlay-x, 0%);
		top: var(--overlay-y, 0%);
		width: var(--overlay-width, auto);
		min-height: var(--overlay-height, auto);
		transform: none;
		color: var(--overlay-color, inherit);
		font-size: var(--overlay-font, inherit);
		opacity: var(--overlay-opacity, 1);
		box-sizing: border-box;
		border: var(--overlay-border-width, 0) solid var(--overlay-border, transparent);
		box-shadow: var(--overlay-shadow, none);
	}
	.overlay-header {
		position: relative;
		z-index: 50;
	}
	.map-preview {
		position: relative;
		isolation: isolate;
		z-index: 20;
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
		z-index: 0;
		background-image:
			linear-gradient(#d8ad6733 1px, transparent 1px),
			linear-gradient(90deg, #d8ad6733 1px, transparent 1px);
		background-size: var(--grid-size) var(--grid-size);
	}
	.map-token {
		position: absolute;
		z-index: 1;
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
		position: relative;
		z-index: 30;
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
		z-index: 60;
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
		position: relative;
		z-index: 10;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
		max-width: 1100px;
		margin: 0.8rem auto 0;
	}
	.camera-grid > .camera-card.layout-positioned {
		position: absolute;
		margin: 0;
		max-width: none;
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
