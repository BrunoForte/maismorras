<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { getSupabaseClient, supabaseConfigured } from '$lib/services/supabase';
	import { loadMessages } from '$lib/services/eventApi';
	import type { Mensagem } from '$lib/stores/chatStore';
	import {
		connectSceneSocket,
		type RealtimeStatus,
		type SceneSocket
	} from '$lib/services/sceneRealtime';
	import { getCombat, loadScene, type PersistedToken, type Scene } from '$lib/services/sceneApi';
	import DiceOverlay from '$lib/components/DiceOverlay.svelte';
	import {
		diceOverlay,
		restoreDicePreference,
		setDice3dPreference,
		setDiceRendererMode
	} from '$lib/stores/diceOverlayStore';
	import OverlayCameraCard from '$lib/components/overlay/OverlayCameraCard.svelte';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { request } from '$lib/services/httpClient';
	import { CrossfadeAudio, type AudioPlaybackState } from '$lib/services/audioPlayback';
	import { getOverlaySettings } from '$lib/services/overlaySettingsApi';
	import { cameraCharacterLabel, findCameraCharacterToken } from '$lib/utils/overlayCamera';
	import { getPresentation, type Presentation } from '$lib/services/presentationApi';
	import { getCharacterForGM, type CharacterSheet } from '$lib/services/characterApi';
	import { getOverlayInitiativeOrder, getOverlayNextCombatant } from '$lib/utils/overlayCombat';
	import { createOverlaySession, exchangeOverlayPairing } from '$lib/services/overlayPairingApi';

	let session = $state<Session | null>(null);
	let scene = $state<Scene | null>(null);
	let tokens = $state<PersistedToken[]>([]);
	let combat = $state<{
		activeTokenId: string | null;
		initiatives: { tokenId: string; initiative: number }[];
	}>({ activeTokenId: null, initiatives: [] });
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
	type CameraSlot = {
		url: string;
		playerName: string;
		characterName: string;
		characterId?: string;
	};
	let cameraSlots = $state<CameraSlot[]>([]);
	let initiativeViewport = $state<HTMLDivElement>();
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
	let overlayPresentation = $state<Presentation | null>(null);
	let overlayPresentationUrl = $state('');
	let overlayPresentationClosed = $state(false);
	let activeCharacterSheet = $state<CharacterSheet | null>(null);
	let requestedSheetTokenId = '';
	type LiveKitPreviewComponentType = typeof import('$lib/components/LiveKitPreview.svelte').default;
	let LiveKitPreviewComponent = $state<LiveKitPreviewComponentType | null>(null);
	let liveKitLoadFailed = $state(false);
	let liveKitImport: Promise<void> | null = null;
	const initiativeOrder = () => getOverlayInitiativeOrder(visibleTokens(), combat.initiatives);
	const activeCombatant = () =>
		initiativeOrder().find((token) => token.id === combat.activeTokenId) ?? null;
	const activeInitiativeLabel = () => {
		const initiative = activeCombatant()?.initiative ?? 0;
		return `${initiative >= 0 ? '+' : ''}${initiative}`;
	};
	const upcomingCombatant = () => getOverlayNextCombatant(initiativeOrder(), combat.activeTokenId);
	const isCameraUrl = (value: string) => {
		try {
			const url = new URL(value);
			return url.protocol === 'https:' && url.hostname === 'vdo.ninja';
		} catch {
			return false;
		}
	};
	const hostCamera = () => {
		const camera = cameraSlots[5];
		return camera && isCameraUrl(camera.url) ? camera : null;
	};
	const playerCameras = () =>
		cameraSlots
			.map((camera, index) => ({ camera, index }))
			.filter(({ camera, index }) => index !== 5 && isCameraUrl(camera.url));
	const hasLiveKitCamera = () => Boolean(overlayLayout.livekitUrl && overlayLayout.livekitToken);
	async function loadLiveKitPreview() {
		if (LiveKitPreviewComponent || liveKitImport) return liveKitImport;
		liveKitLoadFailed = false;
		liveKitImport = import('$lib/components/LiveKitPreview.svelte')
			.then((module) => {
				LiveKitPreviewComponent = module.default;
			})
			.catch(() => {
				liveKitLoadFailed = true;
			})
			.finally(() => {
				liveKitImport = null;
			});
		return liveKitImport;
	}
	$effect(() => {
		if (hasLiveKitCamera()) void loadLiveKitPreview();
	});
	async function loadOverlayPresentation(currentSession: Session | null = session) {
		if (!currentSession || !sceneId()) return;
		try {
			const next = await getPresentation(currentSession, sceneId(), 'overlay');
			const keyChanged =
				next.assetPath !== overlayPresentation?.assetPath ||
				next.title !== overlayPresentation?.title ||
				next.updatedAt !== overlayPresentation?.updatedAt;
			overlayPresentation = next.visible && next.overlayVisible ? next : null;
			if (keyChanged) overlayPresentationClosed = false;
			if (overlayPresentation?.assetPath) {
				overlayPresentationUrl =
					(await getSignedAssetUrl(currentSession, campaignId(), overlayPresentation.assetPath, {
						sceneId: sceneId(),
						surface: 'overlay'
					})) ?? '';
			} else overlayPresentationUrl = '';
		} catch {
			overlayPresentation = null;
			overlayPresentationUrl = '';
		}
	}
	function applyLayoutDocument(value: unknown) {
		const document = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
		if (document.profiles && typeof document.profiles === 'object') {
			const profiles = document.profiles as Record<string, Partial<typeof overlayLayout>>;
			const active = String(document.activeProfile ?? Object.keys(profiles)[0] ?? 'Principal');
			overlayLayout = normalizeOverlayLayout(profiles[active]);
		} else if (value && typeof value === 'object')
			overlayLayout = normalizeOverlayLayout(value as Partial<typeof overlayLayout>);
		void resolveOverlayBackground(overlayLayout.background);
	}
	function normalizeOverlayLayout(value?: Partial<typeof overlayLayout>) {
		const defaults = defaultOverlayLayout();
		const savedBlocks = Array.isArray(value?.blocks) ? value.blocks : [];
		return {
			...defaults,
			...value,
			blocks: defaults.blocks.map((fallback) => ({
				...fallback,
				...savedBlocks.find((item) => item.id === fallback.id)
			}))
		};
	}
	function defaultOverlayLayout() {
		const block = (id: string, x: number, y: number, width: number, height: number) => ({
			id,
			x,
			y,
			width,
			height,
			visible: true
		});
		return {
			background: '',
			blocks: [
				block('initiative', 50, 7, 94, 15),
				block('host-camera', 11, 17, 20, 23),
				block('active-character', 87, 49, 23, 43),
				block('dice', 50, 57, 36, 52),
				...Array.from({ length: 5 }, (_, index) =>
					block(`camera-${index + 1}`, 10 + index * 20, 88, 18, 19)
				)
			]
		};
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
		overlayBackground =
			(await getSignedAssetUrl(session, campaignId(), path, {
				sceneId: sceneId(),
				surface: 'overlay'
			})) ?? '';
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
	const cameraToken = (camera: CameraSlot) => findCameraCharacterToken(camera, tokens);
	const cameraLabel = (camera: CameraSlot, fallback: string) =>
		cameraCharacterLabel(camera, cameraToken(camera), fallback);
	const cameraShowsHP = (camera: CameraSlot) => {
		const token = cameraToken(camera);
		return token?.visibility.showHP ? token : null;
	};
	async function applyAudioState(state: AudioPlaybackState) {
		lastAudioState = state;
		if (!playback || !session) return;
		const applied = await playback.apply(
			state,
			async (path) =>
				(await getSignedAssetUrl(session as Session, campaignId(), path, {
					sceneId: sceneId(),
					surface: 'overlay'
				})) ?? ''
		);
		audioBlocked = state.playing && !applied;
	}
	async function applyEffectsState(state: AudioPlaybackState) {
		lastEffectsState = state;
		if (!effectsPlayback || !session) return;
		const applied = await effectsPlayback.apply(
			state,
			async (path) =>
				(await getSignedAssetUrl(session as Session, campaignId(), path, {
					sceneId: sceneId(),
					surface: 'overlay'
				})) ?? ''
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
			if (supabaseConfigured) {
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
							(await getSignedAssetUrl(currentSession, campaignId(), token.imageUrl, {
								sceneId: sceneId(),
								surface: 'overlay'
							})) ?? ''
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
	async function refreshCombat(currentSession: Session | null = session) {
		if (!currentSession || !sceneId()) return;
		try {
			combat = await getCombat(currentSession, sceneId());
		} catch {
			combat = { activeTokenId: null, initiatives: [] };
		}
	}
	onMount(() => {
		restoreDicePreference();
		const diceMode = query().get('diceMode');
		if (diceMode === 'auto' || diceMode === '2d' || diceMode === '3d-overlay') {
			setDiceRendererMode(diceMode);
		} else if (diceMode === '3d-table') {
			// Links antigos de overlay apontam para o único modo 3D agora suportado.
			setDiceRendererMode('3d-overlay');
		}
		const dicePreference = query().get('dice3d');
		if (!diceMode && (dicePreference === '1' || dicePreference === '0'))
			setDice3dPreference(dicePreference === '1');
		void loadOverlayLayout();
		if (!supabaseConfigured) {
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
		cameraSlots = Array.from({ length: 12 }, (_, index) => index + 1).map((index) => ({
			url: params.get(`camera${index}`) ?? '',
			playerName: params.get(`camera${index}Player`) ?? '',
			characterName: params.get(`camera${index}Character`) ?? '',
			characterId: params.get(`camera${index}CharacterId`) ?? undefined
		}));
		void (async () => {
			let overlaySession: Session | null = null;
			const fragment = new URLSearchParams(window.location.hash.slice(1));
			const pairingCode = fragment.get('pair');
			const storageKey = `maismorras:overlay-access:${campaignId()}`;
			try {
				if (pairingCode) {
					const exchanged = await exchangeOverlayPairing(pairingCode);
					localStorage.setItem(storageKey, JSON.stringify(exchanged));
					history.replaceState(null, '', `${location.pathname}${location.search}`);
					overlaySession = createOverlaySession(exchanged.accessToken, campaignId());
				} else {
					const stored = localStorage.getItem(storageKey);
					if (stored) {
						const grant = JSON.parse(stored) as { accessToken?: string; expiresAt?: number };
						if (grant.accessToken && (grant.expiresAt ?? 0) * 1000 > Date.now())
							overlaySession = createOverlaySession(grant.accessToken, campaignId());
						else localStorage.removeItem(storageKey);
					}
					if (!overlaySession) {
						const client = await getSupabaseClient();
						const { data } = await client!.auth.getSession();
						overlaySession = data.session;
					}
				}
			} catch (pairError) {
				authRequired = true;
				error =
					pairError instanceof Error ? pairError.message : 'Não foi possível parear esta overlay.';
				return;
			}
			if (disposed) return;
			if (!overlaySession) {
				authRequired = true;
				error =
					'Esta tela ainda não foi pareada. Gere um link em Campanha > Overlay e abra-o no navegador do OBS.';
				return;
			}
			session = overlaySession;
			getOverlaySettings(overlaySession, campaignId())
				.then((settings) => {
					if (settings.cameras?.length)
						cameraSlots = settings.cameras.map((camera) => ({
							...camera,
							url: camera.url ?? '',
							playerName: camera.playerName ?? '',
							characterName: camera.characterName ?? ''
						}));
					if (!query().get('scene') && settings.activeSceneId)
						applySceneChange(settings.activeSceneId);
				})
				.catch(() => {
					/* query parameters remain a compatible fallback */
				});
			void loadOverlayLayout(overlaySession as Session);
			void refresh(overlaySession as Session);
			void refreshCombat(overlaySession);
			void loadOverlayPresentation(overlaySession);
			const updateFallback = (status: RealtimeStatus) => {
				if (status === 'connected') {
					if (fallbackRefreshTimer) clearInterval(fallbackRefreshTimer);
					fallbackRefreshTimer = null;
					return;
				}
				if (!fallbackRefreshTimer)
					fallbackRefreshTimer = setInterval(() => {
						void refresh(overlaySession as Session);
						void loadOverlayLayout(overlaySession as Session);
						void loadOverlayPresentation(overlaySession);
					}, 60_000);
			};
			socket = connectSceneSocket(
				overlaySession,
				sceneId(),
				() => {
					if (refreshTimer) clearTimeout(refreshTimer);
					refreshTimer = setTimeout(() => {
						void refresh(overlaySession as Session);
						void loadOverlayLayout(overlaySession as Session);
						void loadOverlayPresentation(overlaySession);
					}, 180);
				},
				undefined,
				updateFallback,
				(state) => void applyAudioState(state),
				() => void loadOverlayPresentation(session),
				(data) => {
					const document = (data as { document?: unknown } | undefined)?.document;
					if (document) applyLayoutDocument(document);
					else void loadOverlayLayout(session);
				},
				undefined,
				() => {
					void refreshCombat(session);
				},
				undefined,
				undefined,
				(state) => void applyEffectsState(state)
			);
		})();
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
	$effect(() => {
		const activeId = combat.activeTokenId;
		if (!activeId || !initiativeViewport) return;
		const activeElement = initiativeViewport.querySelector<HTMLElement>(
			`[data-token-id="${CSS.escape(activeId)}"]`
		);
		activeElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
	});
	$effect(() => {
		const token = activeCombatant();
		if (!token?.actorId || !session) {
			requestedSheetTokenId = '';
			activeCharacterSheet = null;
			return;
		}
		if (requestedSheetTokenId === token.id) return;
		requestedSheetTokenId = token.id;
		activeCharacterSheet = null;
		void getCharacterForGM(session, campaignId(), token.actorId)
			.then((character) => {
				if (combat.activeTokenId === token.id) activeCharacterSheet = character.sheet;
			})
			.catch(() => {
				// A player overlay may not be authorized to retrieve the complete sheet.
			});
	});
	async function login() {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: window.location.href }
		});
		if (authError) error = authError.message;
	}

	const tokenImage = (token: Pick<PersistedToken, 'id' | 'imageUrl'>) =>
		imageUrls[token.id] ||
		(token.imageUrl?.startsWith('http') || token.imageUrl?.startsWith('data:')
			? token.imageUrl
			: null);
	const block = (id: string) => overlayLayout.blocks.find((item) => item.id === id);
	const blockStyle = (id: string) => {
		const item = block(id);
		return item
			? `--overlay-x:${item.x}%;--overlay-y:${item.y}%;--overlay-width:${item.width ?? 20}%;--overlay-height:${item.height ?? 20}%;--overlay-font:${item.fontSize ?? 1}rem;--overlay-color:${item.color ?? '#f0e0c8'};--overlay-opacity:${(item.opacity ?? 100) / 100};--overlay-border:${item.borderColor ?? '#d8ad67'};--overlay-border-width:${item.borderWidth ?? 1}px;--overlay-shadow:${item.shadow === false ? 'none' : '0 10px 24px #0008'};`
			: '';
	};
	const layoutBlockStyle = (id: string) => {
		const item = block(id);
		return item
			? `${blockStyle(id)}left:${item.x}%;top:${item.y}%;width:${item.width ?? 20}%;height:${item.height ?? 20}%;transform:translate(-50%, -50%);`
			: '';
	};
	function playerCameraStyle(index: number) {
		const configured = block(`camera-${index + 1}`);
		const totalCameras = playerCameras().length + (hasLiveKitCamera() ? 1 : 0);
		if (configured && totalCameras <= 5)
			return `${layoutBlockStyle(`camera-${index + 1}`)}z-index:40;`;
		const count = Math.max(1, totalCameras);
		const width = Math.min(18, 92 / count);
		const center = ((index + 0.5) / count) * 100;
		return `left:${center}%;top:88%;width:${width}%;height:19%;transform:translate(-50%,-50%);z-index:40;`;
	}
</script>

<svelte:head>
	<title>{scene?.name ?? 'Overlay · MaisMorras'}</title>
	<meta name="theme-color" content="#09070b" />
</svelte:head>

<main
	class="live-overlay"
	aria-label="Overlay da live"
	style:background-image={overlayBackground ? `url("${overlayBackground}")` : undefined}
	style:background-color={overlayBackground ? '#09070b' : 'transparent'}
>
	{#if authRequired}<section class="overlay-auth">
			<p class="overlay-error">{error || 'Esta tela ainda não foi pareada.'}</p>
			<p>
				Na mesa, abra Campanha → Overlay e gere um link pareado para colar como URL da fonte de
				navegador do OBS.
			</p>
			<button onclick={() => void login()}>Entrar com Google nesta janela</button>
		</section>{:else if error}<p class="overlay-error">
			{error}
		</p>{:else if !scene || !session}<p class="overlay-loading">Carregando overlay…</p>{:else}
		<audio bind:this={audio} loop preload="metadata"></audio>
		<audio bind:this={audioB} loop preload="metadata"></audio>
		<audio bind:this={effectsAudio} loop preload="metadata"></audio>
		<audio bind:this={effectsAudioB} loop preload="metadata"></audio>
		{#if audioBlocked || effectsAudioBlocked}<button
				class="audio-enable"
				onclick={() => void enableAudio()}>Clique para ativar o áudio da transmissão</button
			>{/if}

		{#if combat.activeTokenId && initiativeOrder().length && block('initiative')?.visible !== false}<section
				class="initiative-bar"
				class:layout-hidden={block('initiative')?.visible === false}
				class:layout-positioned={Boolean(block('initiative'))}
				style={layoutBlockStyle('initiative')}
				aria-label="Ordem de iniciativa"
			>
				<span class="initiative-title">INICIATIVA</span>
				<div class="initiative-viewport" bind:this={initiativeViewport}>
					{#each initiativeOrder() as token (token.id)}<article
							class="initiative-entry"
							class:active={token.id === combat.activeTokenId}
							class:up-next={token.id === upcomingCombatant()?.id}
							data-token-id={token.id}
							title={`${token.name} · Iniciativa ${token.initiative}`}
						>
							<div
								class="initiative-portrait"
								style={`--token-color:${token.color ? `#${token.color.toString(16).padStart(6, '0')}` : '#85613a'}`}
							>
								{#if tokenImage(token)}<img src={tokenImage(token) ?? ''} alt="" />{:else}<span
										>{token.name.slice(0, 1).toUpperCase()}</span
									>{/if}
							</div>
							<strong>{token.name}</strong>
							<small>{token.initiative}</small>
							{#if token.id === combat.activeTokenId}<span class="turn-label current">AGORA</span
								>{/if}
							{#if token.id === upcomingCombatant()?.id}<span class="turn-label next">A SEGUIR</span
								>{/if}
						</article>{/each}
				</div>
			</section>{/if}

		{#if hostCamera()?.url && block('host-camera')?.visible !== false}{@const hostCameraHP =
				cameraShowsHP(hostCamera() as CameraSlot)}
			<OverlayCameraCard
				kind="host"
				src={hostCamera()?.url ?? ''}
				title="Câmera do narrador"
				label={cameraLabel(hostCamera() as CameraSlot, 'Narrador')}
				secondaryLabel={hostCamera()?.playerName ?? ''}
				hp={hostCameraHP ? { current: hostCameraHP.hpCurrent, max: hostCameraHP.hpMax } : null}
				positioned={Boolean(block('host-camera'))}
				style={layoutBlockStyle('host-camera')}
			/>{/if}

		{#if activeCombatant() && block('active-character')?.visible !== false}<aside
				class="active-character-card"
				class:layout-positioned={Boolean(block('active-character'))}
				style={layoutBlockStyle('active-character')}
				aria-label={`Resumo de ${activeCombatant()?.name}, personagem da vez`}
			>
				<span class="eyebrow">TURNO DE</span>
				{#if tokenImage(activeCombatant() as PersistedToken)}<img
						src={tokenImage(activeCombatant() as PersistedToken) ?? ''}
						alt=""
					/>{:else}<div class="active-fallback">
						{activeCombatant()?.name.slice(0, 1).toUpperCase()}
					</div>{/if}
				<h2>{activeCombatant()?.name}</h2>
				{#if activeCharacterSheet && activeCombatant()?.actorId}<p class="character-classline">
						{activeCharacterSheet.class}{#if activeCharacterSheet.subclass}
							· {activeCharacterSheet.subclass}
						{/if} · Nível {activeCharacterSheet.level}
					</p>{/if}
				<div class="character-stats">
					{#if activeCombatant()?.visibility.showHP}<span
							><small>PV</small>{activeCombatant()?.hpCurrent}/{activeCombatant()?.hpMax}</span
						>{/if}
					{#if activeCombatant()?.visibility.showAC}<span
							><small>CA</small>{activeCombatant()?.armorClass}</span
						>{/if}
					<span><small>INICIATIVA</small>{activeInitiativeLabel()}</span>
				</div>
			</aside>{/if}

		{#if block('dice')?.visible !== false}<section
				class="dice-layer"
				class:layout-positioned={Boolean(block('dice'))}
				style={layoutBlockStyle('dice')}
				aria-label="Dados da rolagem"
			>
				<DiceOverlay viewport />
			</section>{/if}

		{#each playerCameras() as { camera, index }, playerIndex (index)}{#if block(`camera-${playerIndex + 1}`)?.visible !== false}{@const linkedHP =
					cameraShowsHP(camera)}
				<OverlayCameraCard
					kind="player"
					src={camera.url}
					title={`Câmera de ${camera.playerName || camera.characterName || `jogador ${playerIndex + 1}`}`}
					label={cameraLabel(camera, `Jogador ${playerIndex + 1}`)}
					secondaryLabel={camera.playerName}
					hp={linkedHP ? { current: linkedHP.hpCurrent, max: linkedHP.hpMax } : null}
					positioned={Boolean(block(`camera-${playerIndex + 1}`))}
					style={playerCameraStyle(playerIndex)}
				/>{/if}{/each}
		{#if hasLiveKitCamera()}<article
				class="camera-card livekit-camera"
				style={playerCameraStyle(playerCameras().length)}
			>
				{#if LiveKitPreviewComponent}<LiveKitPreviewComponent
						serverUrl={overlayLayout.livekitUrl ?? ''}
						token={overlayLayout.livekitToken ?? ''}
					/>
				{:else if liveKitLoadFailed}<p role="status" aria-live="polite">
						Não foi possível carregar a câmera LiveKit. <button
							onclick={() => void loadLiveKitPreview()}>Tentar novamente</button
						>
					</p>{:else}<p role="status" aria-live="polite">Carregando câmera LiveKit…</p>{/if}
				<strong>LiveKit · {overlayLayout.livekitRoom || 'Sala'}</strong>
			</article>{/if}

		{#if overlayPresentation && !overlayPresentationClosed}<section
				class="overlay-presentation"
				aria-label={overlayPresentation.title || 'Imagem apresentada'}
			>
				{#if overlayPresentationUrl}<img
						src={overlayPresentationUrl}
						alt={overlayPresentation.title || 'Imagem apresentada'}
					/>{:else if overlayPresentation.description}<article>
						<h2>{overlayPresentation.title}</h2>
						<p>{overlayPresentation.description}</p>
					</article>{/if}
				{#if overlayPresentation.title && overlayPresentationUrl}<strong
						>{overlayPresentation.title}</strong
					>{/if}
				<button
					onclick={() => (overlayPresentationClosed = true)}
					aria-label="Fechar imagem nesta overlay">×</button
				>
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
		position: fixed;
		inset: 0;
		isolation: isolate;
		width: 100vw;
		height: 100dvh;
		min-height: 0;
		padding: 0;
		overflow: hidden;
		color: #f7eedf;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		background-color: transparent;
		background-image: none;
		background-position: center;
		background-size: cover;
	}
	.initiative-bar {
		position: absolute;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: clamp(0.35rem, 1vw, 1rem);
		box-sizing: border-box;
		padding: clamp(0.25rem, 0.8vw, 0.8rem);
		border: 1px solid #d8ad6755;
		border-radius: 999px;
		background: linear-gradient(90deg, #100c11df, #211a1ddd, #100c11df);
		box-shadow: 0 8px 28px #0008;
		backdrop-filter: blur(9px);
	}
	.initiative-title {
		flex: 0 0 auto;
		margin-left: 20%;
		color: #e7c684;
		font-size: clamp(0.5rem, 0.8vw, 0.75rem);
		font-weight: 850;
		letter-spacing: 0.13em;
	}
	.initiative-viewport {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		gap: clamp(0.35rem, 1vw, 1rem);
		min-width: 0;
		height: 100%;
		overflow-x: auto;
		overflow-y: visible;
		scrollbar-width: none;
		scroll-behavior: smooth;
	}
	.initiative-viewport::-webkit-scrollbar {
		display: none;
	}
	.initiative-entry {
		position: relative;
		flex: 0 0 auto;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 0.12rem;
		min-width: clamp(2.8rem, 5.1vw, 5.5rem);
		max-height: 100%;
		color: #d6c8b7;
		font-size: clamp(0.45rem, 0.66vw, 0.68rem);
		transition:
			transform 260ms ease,
			color 220ms ease;
	}
	.initiative-entry strong {
		max-width: clamp(2.8rem, 5.5vw, 6rem);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: inherit;
	}
	.initiative-entry small {
		color: #baaa94;
		font-size: 0.9em;
	}
	.initiative-entry.active {
		z-index: 1;
		color: #fff0ce;
		transform: translateY(-0.12rem) scale(1.1);
		animation: turn-slide 420ms ease-out both;
	}
	.initiative-entry.up-next .initiative-portrait {
		border-color: #b4a4d7;
		box-shadow: 0 0 0 2px #b4a4d744;
	}
	.initiative-portrait,
	.active-fallback {
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 2px solid #8a775c;
		border-radius: 50%;
		color: #fff4da;
		background: var(--token-color, #85613a);
		font-weight: 850;
	}
	.initiative-portrait {
		width: clamp(1.45rem, 3.4vw, 3.35rem);
		aspect-ratio: 1;
		box-shadow: 0 2px 10px #0009;
		transition:
			border-color 220ms ease,
			box-shadow 220ms ease;
	}
	.initiative-portrait img,
	.active-character-card > img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.initiative-entry.active .initiative-portrait {
		border-color: #f1ca78;
		box-shadow:
			0 0 0 3px #f1ca7866,
			0 0 24px #e4af4a99;
	}
	.turn-label {
		position: absolute;
		bottom: -0.8rem;
		padding: 0.08rem 0.3rem;
		border-radius: 999px;
		font-size: clamp(0.38rem, 0.48vw, 0.52rem);
		font-weight: 900;
		white-space: nowrap;
	}
	.turn-label.current {
		color: #23190b;
		background: #e9bf69;
	}
	.turn-label.next {
		color: #e3d7f9;
		background: #504464;
	}
	.livekit-camera {
		position: absolute;
		box-sizing: border-box;
		z-index: 45;
		display: grid;
		align-content: end;
		gap: 0.12rem;
		color: #f5d38c;
		font-size: clamp(0.45rem, 0.75vw, 0.76rem);
		text-align: center;
		text-shadow: 0 1px 3px #000;
	}
	.active-character-card {
		position: absolute;
		z-index: 22;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(0.25rem, 0.8vw, 0.75rem);
		padding: clamp(0.5rem, 1.3vw, 1.25rem);
		border: 1px solid #d8ad6780;
		border-radius: clamp(8px, 1vw, 16px);
		color: #fff0d3;
		background: linear-gradient(160deg, #211a20e8, #0f0c11eb);
		box-shadow: 0 12px 32px #0009;
		backdrop-filter: blur(8px);
		text-align: center;
	}
	.active-character-card .eyebrow {
		color: #e8c477;
		font-size: clamp(0.48rem, 0.68vw, 0.72rem);
		font-weight: 850;
		letter-spacing: 0.16em;
	}
	.active-character-card > img,
	.active-fallback {
		width: min(48%, 8rem);
		aspect-ratio: 1;
		border: 2px solid #e9bf69;
		border-radius: 50%;
		box-shadow: 0 0 22px #d7a9475c;
	}
	.active-character-card h2 {
		max-width: 100%;
		margin: 0;
		overflow-wrap: anywhere;
		font:
			600 clamp(0.72rem, 1.35vw, 1.35rem)/1.15 Georgia,
			serif;
	}
	.character-classline {
		max-width: 100%;
		margin: 0;
		color: #d8c6a6;
		font-size: clamp(0.5rem, 0.82vw, 0.82rem);
		line-height: 1.25;
	}
	.character-stats {
		width: 100%;
		display: grid;
		gap: 0.35rem;
	}
	.character-stats span {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		padding-top: 0.3rem;
		border-top: 1px solid #d8ad6733;
		font-size: clamp(0.55rem, 0.9vw, 0.88rem);
	}
	.character-stats small {
		color: #c1ad8a;
		font-size: 0.75em;
		letter-spacing: 0.07em;
	}
	.dice-layer {
		position: absolute;
		z-index: 30;
		isolation: isolate;
		overflow: visible;
		pointer-events: none;
	}
	.dice-layer :global(.dice-box-3d) {
		z-index: 1;
	}
	.dice-layer :global(.dice-overlay) {
		z-index: 2;
		width: min(90%, 44rem);
		grid-template-columns: repeat(auto-fit, minmax(min(7rem, 40%), 1fr));
	}
	.dice-layer :global(.dice-error) {
		z-index: 4;
		width: max-content;
		max-width: 95%;
		font-size: clamp(0.55rem, 0.85vw, 0.85rem);
	}
	.livekit-camera {
		z-index: 45;
	}
	.overlay-auth {
		position: absolute;
		z-index: 10001;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 1rem;
		background: #09070be8;
		text-align: center;
	}
	.overlay-error,
	.overlay-loading {
		position: absolute;
		z-index: 10001;
		inset: 0;
		display: grid;
		place-content: center;
		margin: 0;
		color: #ead8b7;
		background: #09070be8;
		text-align: center;
	}
	.overlay-auth button,
	.audio-enable {
		border: 1px solid #d8ad67;
		border-radius: 999px;
		padding: 0.65rem 1rem;
		color: #2a1b0e;
		background: #e0b86f;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}
	.audio-enable {
		position: absolute;
		z-index: 100;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		font-size: clamp(0.65rem, 1vw, 0.9rem);
	}
	.overlay-presentation {
		position: fixed;
		z-index: 10000;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 3rem;
		background: #000d;
		backdrop-filter: blur(3px);
		pointer-events: auto;
	}
	.overlay-presentation img {
		display: block;
		max-width: 94vw;
		max-height: 88vh;
		object-fit: contain;
		border-radius: 12px;
		box-shadow: 0 20px 80px #000;
	}
	.overlay-presentation strong {
		position: absolute;
		bottom: 1.2rem;
		max-width: 85vw;
		overflow: hidden;
		color: #f7eedf;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.overlay-presentation article {
		width: min(90vw, 900px);
		max-height: 82vh;
		overflow: auto;
		padding: 3rem;
		border: 1px solid #d8ad67;
		border-radius: 12px;
		color: #f7eedf;
		background: #171417;
	}
	.overlay-presentation button {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid #d8ad67;
		border-radius: 50%;
		color: #f7eedf;
		background: #171417;
		font-size: 1.5rem;
		pointer-events: auto;
	}
	.layout-hidden {
		display: none !important;
	}
	.layout-positioned {
		left: var(--overlay-x, 0%);
		top: var(--overlay-y, 0%);
		width: var(--overlay-width, auto);
		min-height: var(--overlay-height, auto);
		color: var(--overlay-color, inherit);
		font-size: var(--overlay-font, inherit);
		opacity: var(--overlay-opacity, 1);
		border-color: var(--overlay-border, transparent);
		border-width: var(--overlay-border-width, 0);
		box-shadow: var(--overlay-shadow, none);
	}
	@keyframes turn-slide {
		from {
			transform: translateX(0.5rem) translateY(-0.12rem) scale(1.02);
		}
		to {
			transform: translateX(0) translateY(-0.12rem) scale(1.1);
		}
	}
	@media (max-width: 700px) {
		.initiative-bar {
			gap: 0.25rem;
			padding: 0.2rem 0.35rem;
		}
		.initiative-title {
			font-size: 0.42rem;
			letter-spacing: 0.04em;
		}
		.initiative-entry {
			min-width: 2.2rem;
		}
		.initiative-entry strong {
			max-width: 2.5rem;
		}
		.active-character-card {
			padding: 0.35rem;
		}
	}
</style>
